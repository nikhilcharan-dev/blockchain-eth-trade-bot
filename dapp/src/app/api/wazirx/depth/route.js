const WAZIRX_BASE = "https://api.wazirx.com";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const limit = searchParams.get("limit") || "30";

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    const resp = await fetch(
      `${WAZIRX_BASE}/sapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${encodeURIComponent(limit)}`,
      { cache: "no-store" }
    );

    if (!resp.ok) {
      return Response.json(
        { error: "Failed to fetch depth from WazirX" },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (err) {
    console.error("WazirX depth proxy error:", err);
    return Response.json(
      { error: "Failed to fetch order book depth" },
      { status: 500 }
    );
  }
}
