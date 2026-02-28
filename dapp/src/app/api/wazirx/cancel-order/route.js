import { createHmac } from "crypto";
import { getWazirxCredentials } from "@/lib/wazirxAuth";

const WAZIRX_BASE = "https://api.wazirx.com";
const SYMBOL_RE = /^[a-z0-9]{4,20}$/;

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
    const { symbol, orderId } = body;

    if (!symbol || !SYMBOL_RE.test(symbol)) {
      return Response.json({ error: "Invalid symbol" }, { status: 400 });
    }
    if (!orderId) {
      return Response.json({ error: "Missing orderId" }, { status: 400 });
    }

    const params = {
      symbol,
      orderId: String(orderId),
      timestamp: Date.now(),
      recvWindow: 20000,
    };

    const { queryString, signature } = signRequest(params, creds.apiSecret);

    const resp = await fetch(
      `${WAZIRX_BASE}/sapi/v1/order?${queryString}&signature=${signature}`,
      {
        method: "DELETE",
        headers: { "X-Api-Key": creds.apiKey },
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      return Response.json(
        { error: data.message || data.msg || "Cancel failed", detail: data },
        { status: resp.status }
      );
    }

    return Response.json(data);
  } catch (err) {
    console.error("Cancel order error:", err);
    return Response.json({ error: "Failed to cancel order" }, { status: 500 });
  }
}
