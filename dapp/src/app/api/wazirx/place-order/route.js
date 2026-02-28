import { createHmac } from "crypto";
import { getWazirxCredentials } from "@/lib/wazirxAuth";

const WAZIRX_BASE = "https://api.wazirx.com";
const SYMBOL_RE = /^[a-z0-9]{4,20}$/;
const SIDES = ["buy", "sell"];
const TYPES = ["limit", "stop_limit"];

function signRequest(params, secret) {
  const queryString = new URLSearchParams(params).toString();
  const signature = createHmac("sha256", secret).update(queryString).digest("hex");
  return { queryString, signature };
}

export async function POST(request) {
  try {
    const creds = await getWazirxCredentials(request);
    if (creds.error) {
      return Response.json({ error: creds.error }, { status: creds.status });
    }

    const body = await request.json();
    const { symbol, side, type, quantity, price } = body;

    // Validation
    if (!symbol || !SYMBOL_RE.test(symbol)) {
      return Response.json({ error: "Invalid symbol" }, { status: 400 });
    }
    if (!SIDES.includes(side)) {
      return Response.json({ error: "Side must be 'buy' or 'sell'" }, { status: 400 });
    }
    if (!TYPES.includes(type)) {
      return Response.json({ error: "Type must be 'limit' or 'stop_limit'" }, { status: 400 });
    }
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (isNaN(qty) || qty <= 0) {
      return Response.json({ error: "Invalid quantity" }, { status: 400 });
    }
    if (isNaN(prc) || prc <= 0) {
      return Response.json({ error: "Invalid price" }, { status: 400 });
    }

    const params = {
      symbol,
      side,
      type,
      quantity: qty.toString(),
      price: prc.toString(),
      timestamp: Date.now(),
      recvWindow: 20000,
    };

    const { queryString, signature } = signRequest(params, creds.apiSecret);

    const resp = await fetch(
      `${WAZIRX_BASE}/sapi/v1/order?${queryString}&signature=${signature}`,
      {
        method: "POST",
        headers: { "X-Api-Key": creds.apiKey },
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      return Response.json(
        { error: data.message || data.msg || "Order failed", detail: data },
        { status: resp.status }
      );
    }

    return Response.json(data);
  } catch (err) {
    console.error("Place order error:", err);
    return Response.json({ error: "Failed to place order" }, { status: 500 });
  }
}
