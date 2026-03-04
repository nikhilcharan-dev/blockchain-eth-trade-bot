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

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOrdersWithRetry(symbol, apiKey, apiSecret, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const params = { symbol, timestamp: Date.now(), recvWindow: 20000 };
      const { queryString, signature } = signRequest(params, apiSecret);

      const resp = await fetch(
        `${WAZIRX_BASE}/sapi/v1/allOrders?${queryString}&signature=${signature}`,
        { headers: { "X-Api-Key": apiKey } }
      );

      if (resp.status === 429) {
        // Rate limited — wait and retry
        if (attempt < retries) {
          await delay(1000 * (attempt + 1));
          continue;
        }
        return [];
      }

      if (!resp.ok) return [];
      const data = await resp.json();
      return Array.isArray(data) ? data : [];
    } catch {
      if (attempt < retries) {
        await delay(500 * (attempt + 1));
        continue;
      }
      return [];
    }
  }
  return [];
}

function calcAvgBuyPrice(orders, currentHolding) {
  let totalBuyQty = 0;
  let totalBuyCost = 0;
  let totalSellQty = 0;

  for (const o of orders) {
    const status = (o.status || "").toLowerCase();
    const side = (o.side || "").toLowerCase();

    // Skip non-completed orders
    if (status === "cancel" || status === "cancelled" || status === "wait" || status === "new") continue;

    // Use executedQty first, fall back to origQty for fully filled orders
    let qty = parseFloat(o.executedQty) || 0;
    if (qty <= 0) qty = parseFloat(o.origQty) || 0;
    if (qty <= 0) continue;

    // Try multiple price sources
    let price = parseFloat(o.price) || 0;

    // For market orders, try avgPrice or cummulativeQuoteQty
    if (price <= 0) {
      price = parseFloat(o.avgPrice) || 0;
    }
    if (price <= 0) {
      const cumQuote = parseFloat(o.cummulativeQuoteQty) || parseFloat(o.origQuoteOrderQty) || 0;
      if (cumQuote > 0) price = cumQuote / qty;
    }

    if (price > 0) {
      if (side === "buy") {
        totalBuyQty += qty;
        totalBuyCost += qty * price;
      } else if (side === "sell") {
        totalSellQty += qty;
      }
    }
  }

  if (totalBuyQty > 0) {
    const avgBuyPrice = totalBuyCost / totalBuyQty;
    // totalInvested = avgBuyPrice * currently held tokens, not all historical buys
    // This gives the cost basis of the current position
    const holdingQty = currentHolding > 0 ? currentHolding : Math.max(0, totalBuyQty - totalSellQty);
    const totalInvested = avgBuyPrice * holdingQty;
    return { avgBuyPrice, totalInvested };
  }
  return null;
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

    // 2. For each crypto token (not INR), fetch order history in batches to avoid rate limits
    const cryptoHoldings = holdings.filter((h) => h.asset !== "INR");
    const BATCH_SIZE = 3;
    const orderMap = {};

    for (let i = 0; i < cryptoHoldings.length; i += BATCH_SIZE) {
      const batch = cryptoHoldings.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((h) =>
          fetchOrdersWithRetry(
            `${h.asset.toLowerCase()}inr`,
            creds.apiKey,
            creds.apiSecret
          )
        )
      );

      batch.forEach((h, idx) => {
        if (results[idx]?.status === "fulfilled") {
          orderMap[h.asset] = results[idx].value;
        }
      });

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < cryptoHoldings.length) {
        await delay(300);
      }
    }

    // 3. Calculate average buy price for each token
    const portfolio = holdings.map((h) => {
      const total = h.free + h.locked;
      const entry = { symbol: h.asset, amount: total, free: h.free, locked: h.locked };

      if (h.asset === "INR") return entry;

      const orders = orderMap[h.asset];
      if (!orders || !Array.isArray(orders) || orders.length === 0) return entry;

      const result = calcAvgBuyPrice(orders, total);
      if (result) {
        entry.avgBuyPrice = result.avgBuyPrice;
        entry.totalInvested = result.totalInvested;
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
