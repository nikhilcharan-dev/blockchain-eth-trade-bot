import { createHmac } from "crypto";

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
    const { apiKey, apiSecret } = await request.json();

    if (!apiKey || !apiSecret) {
      return Response.json(
        { error: "API key and secret are required" },
        { status: 400 }
      );
    }

    const params = {
      timestamp: Date.now(),
      recvWindow: 20000,
    };

    const { queryString, signature } = signRequest(params, apiSecret);

    const resp = await fetch(
      `${WAZIRX_BASE}/sapi/v1/funds?${queryString}&signature=${signature}`,
      {
        headers: { "X-Api-Key": apiKey },
      }
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return Response.json(
        { error: `WazirX API error: ${resp.status}`, details: errBody },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch funds", details: err.message },
      { status: 500 }
    );
  }
}
