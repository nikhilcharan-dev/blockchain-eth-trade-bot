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

export async function POST(request) {
  try {
    const creds = await getWazirxCredentials(request);
    if (creds.error) {
      return Response.json({ error: creds.error }, { status: creds.status });
    }

    const params = {
      timestamp: Date.now(),
      recvWindow: 20000,
    };

    const { queryString, signature } = signRequest(params, creds.apiSecret);

    const resp = await fetch(
      `${WAZIRX_BASE}/sapi/v1/openOrders?${queryString}&signature=${signature}`,
      {
        headers: { "X-Api-Key": creds.apiKey },
      }
    );

    if (!resp.ok) {
      return Response.json(
        { error: "Failed to fetch open orders from WazirX" },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (err) {
    console.error("WazirX open-orders error:", err);
    return Response.json(
      { error: "Failed to fetch open orders" },
      { status: 500 }
    );
  }
}
