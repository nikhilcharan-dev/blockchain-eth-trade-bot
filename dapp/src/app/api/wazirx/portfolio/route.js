import { createHmac } from "crypto";
import { getWazirxCredentials } from "@/lib/wazirxAuth";

const WAZIRX_BASE = "https://api.wazirx.com";

function signRequest(params, secret) {
  const queryString = new URLSearchParams(params).toString();
  const signature = createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");
  return { queryString, signature };
}

async function fetchWazirxFunds(apiKey, apiSecret) {
  const params = { timestamp: Date.now(), recvWindow: 20000 };
  const { queryString, signature } = signRequest(params, apiSecret);

  const resp = await fetch(
    `${WAZIRX_BASE}/sapi/v1/funds?${queryString}&signature=${signature}`,
    { headers: { "X-Api-Key": apiKey } }
  );
  if (!resp.ok) throw new Error("Failed to fetch funds");
  return resp.json();
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

    // 1. Fetch wallet funds
    const funds = await fetchWazirxFunds(creds.apiKey, creds.apiSecret);
    const holdings = (Array.isArray(funds) ? funds : [])
      .map((f) => ({
        asset: (f.asset || "").toUpperCase(),
        free: parseFloat(f.free) || 0,
        locked: parseFloat(f.locked) || 0,
      }))
      .filter((f) => f.free + f.locked > 0);

    // 2. For each crypto token (not INR), fetch order history to calculate avg buy price
    const cryptoHoldings = holdings.filter((h) => h.asset !== "INR");
    const orderResults = await Promise.allSettled(
      cryptoHoldings.map((h) =>
        fetchOrdersForSymbol(
          `${h.asset.toLowerCase()}inr`,
          creds.apiKey,
          creds.apiSecret
        )
      )
    );

    // 3. Calculate average buy price for each token
    const portfolio = holdings.map((h) => {
      const total = h.free + h.locked;
      const entry = { symbol: h.asset, amount: total, free: h.free, locked: h.locked };

      if (h.asset === "INR") return entry;

      const idx = cryptoHoldings.findIndex((c) => c.asset === h.asset);
      if (idx === -1 || orderResults[idx]?.status !== "fulfilled") return entry;

      const orders = orderResults[idx].value;
      if (!Array.isArray(orders)) return entry;

      // Calculate weighted average buy price from filled buy orders
      let totalBuyQty = 0;
      let totalBuyCost = 0;

      for (const o of orders) {
        if (o.side === "buy" && o.status === "done") {
          const qty = parseFloat(o.executedQty) || 0;
          const price = parseFloat(o.price) || 0;
          if (qty > 0 && price > 0) {
            totalBuyQty += qty;
            totalBuyCost += qty * price;
          }
        }
      }

      if (totalBuyQty > 0) {
        entry.avgBuyPrice = totalBuyCost / totalBuyQty;
        entry.totalInvested = totalBuyCost;
      }

      return entry;
    });

    return Response.json(portfolio);
  } catch (err) {
    console.error("WazirX portfolio error:", err);
    return Response.json(
      { error: "Failed to fetch portfolio data" },
      { status: 500 }
    );
  }
}
