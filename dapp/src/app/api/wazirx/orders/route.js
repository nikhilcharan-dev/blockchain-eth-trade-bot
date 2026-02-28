import { createHmac } from "crypto";
import { getWazirxCredentials } from "@/lib/wazirxAuth";

const WAZIRX_BASE = "https://api.wazirx.com";
const SYMBOL_REGEX = /^[a-zA-Z0-9]{2,20}$/;

function signRequest(params, secret) {
  const queryString = new URLSearchParams(params).toString();
  const signature = createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");
  return { queryString, signature };
}

async function fetchOrdersForSymbol(symbol, apiKey, apiSecret) {
  const params = { symbol, timestamp: Date.now(), recvWindow: 20000 };
  const { queryString, signature } = signRequest(params, apiSecret);

  const resp = await fetch(
    `${WAZIRX_BASE}/sapi/v1/allOrders?${queryString}&signature=${signature}`,
    { headers: { "X-Api-Key": apiKey } }
  );
  if (!resp.ok) return [];
  return resp.json();
}

export async function POST(request) {
  try {
    const creds = await getWazirxCredentials(request);
    if (creds.error) {
      return Response.json({ error: creds.error }, { status: creds.status });
    }

    const body = await request.json();

    // Single symbol query
    if (body.symbol) {
      if (!SYMBOL_REGEX.test(body.symbol)) {
        return Response.json({ error: "Invalid symbol format" }, { status: 400 });
      }
      const orders = await fetchOrdersForSymbol(
        body.symbol, creds.apiKey, creds.apiSecret
      );
      return Response.json(Array.isArray(orders) ? orders : []);
    }

    // Multi-symbol query: fetch in batches to avoid rate limits
    if (body.symbols && Array.isArray(body.symbols)) {
      const validSymbols = body.symbols.filter((s) => SYMBOL_REGEX.test(s));
      const BATCH = 3;
      const allOrders = [];

      for (let i = 0; i < validSymbols.length; i += BATCH) {
        const batch = validSymbols.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((s) =>
            fetchOrdersForSymbol(s, creds.apiKey, creds.apiSecret)
          )
        );
        for (const r of results) {
          if (r.status === "fulfilled" && Array.isArray(r.value)) {
            allOrders.push(...r.value);
          }
        }
        if (i + BATCH < validSymbols.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // Sort by creation time descending
      allOrders.sort(
        (a, b) => (b.createdTime || 0) - (a.createdTime || 0)
      );
      return Response.json(allOrders);
    }

    return Response.json(
      { error: "Please provide a symbol or symbols array" },
      { status: 400 }
    );
  } catch (err) {
    console.error("WazirX orders error:", err);
    return Response.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
