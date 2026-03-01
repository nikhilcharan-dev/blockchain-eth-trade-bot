import { createHmac } from "crypto";
import { verifyToken } from "@/lib/jwt";
import connectDB from "@/lib/mongodb";
import TradeRange from "@/lib/models/TradeRange";
import TradeRangeLog from "@/lib/models/TradeRangeLog";
import UserSettings from "@/lib/models/UserSettings";
import { decrypt } from "@/lib/crypto";

const WAZIRX_BASE = "https://api.wazirx.com";
const WAZIRX_TICKERS_URL = "https://api.wazirx.com/sapi/v1/tickers/24hr";

function signRequest(params, secret) {
  const queryString = new URLSearchParams(params).toString();
  const signature = createHmac("sha256", secret).update(queryString).digest("hex");
  return { queryString, signature };
}

async function placeWazirxOrder(apiKey, apiSecret, symbol, side, price, quantity) {
  const params = {
    symbol,
    side,
    type: "limit",
    quantity: quantity.toString(),
    price: price.toString(),
    timestamp: Date.now(),
    recvWindow: 20000,
  };

  const { queryString, signature } = signRequest(params, apiSecret);
  const resp = await fetch(`${WAZIRX_BASE}/sapi/v1/order?${queryString}&signature=${signature}`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.message || data.msg || "Order failed");
  }
  return data;
}

async function fetchCurrentPrices() {
  const resp = await fetch(WAZIRX_TICKERS_URL);
  if (!resp.ok) throw new Error("Failed to fetch prices");
  const data = await resp.json();
  const prices = {};
  for (const ticker of data) {
    const sym = ticker.symbol || "";
    if (!sym.endsWith("inr")) continue;
    const token = sym.slice(0, -3).toUpperCase();
    prices[token] = parseFloat(ticker.lastPrice);
  }
  return prices;
}

async function fetchWazirxFunds(apiKey, apiSecret) {
  const params = { timestamp: Date.now(), recvWindow: 20000 };
  const { queryString, signature } = signRequest(params, apiSecret);
  const resp = await fetch(`${WAZIRX_BASE}/sapi/v1/funds?${queryString}&signature=${signature}`, {
    headers: { "X-Api-Key": apiKey },
  });
  if (!resp.ok) return [];
  return resp.json();
}

// POST — Execute trade range checks for the authenticated user
export async function POST(request) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || !payload.username || payload.role === "guest") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const username = payload.username.toLowerCase();

    await connectDB();

    // Get user's WazirX credentials
    const settings = await UserSettings.findOne({ username });
    if (!settings || !settings.wazirxApiKey || !settings.wazirxApiSecret) {
      return Response.json({ error: "WazirX credentials not configured" }, { status: 401 });
    }

    const apiKey = decrypt(settings.wazirxApiKey);
    const apiSecret = decrypt(settings.wazirxApiSecret);
    if (!apiKey || !apiSecret) {
      return Response.json({ error: "WazirX credentials not configured" }, { status: 401 });
    }

    // Get all active ranges
    const ranges = await TradeRange.find({ username, active: true });
    if (ranges.length === 0) {
      return Response.json({ executed: [], message: "No active trade ranges" });
    }

    // Fetch current prices
    const prices = await fetchCurrentPrices();

    // Fetch wallet balances for quantity validation
    const fundsArr = await fetchWazirxFunds(apiKey, apiSecret);
    const funds = {};
    for (const f of (Array.isArray(fundsArr) ? fundsArr : [])) {
      const asset = (f.asset || "").toUpperCase();
      funds[asset] = parseFloat(f.free) || 0;
    }

    const executed = [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const range of ranges) {
      const currentPrice = prices[range.token];
      if (!currentPrice) continue;

      // Update last checked
      range.lastCheckedAt = now;

      // Check max trades per day limit
      if (range.maxTradesPerDay > 0) {
        const todayTradeCount = await TradeRangeLog.countDocuments({
          rangeId: range._id,
          createdAt: { $gte: startOfDay },
          status: "executed",
        });
        if (todayTradeCount >= range.maxTradesPerDay) continue;
      }

      let action = null;

      // Price at or below lower range → BUY
      if (currentPrice <= range.lowerPrice) {
        // Check INR balance
        const inrBalance = funds["INR"] || 0;
        const cost = currentPrice * range.quantity;
        if (inrBalance >= cost) {
          action = "buy";
        }
      }
      // Price at or above upper range → SELL
      else if (currentPrice >= range.upperPrice) {
        // Check token balance — can't sell more than what user holds
        const tokenBalance = funds[range.token] || 0;
        if (tokenBalance >= range.quantity) {
          action = "sell";
        }
      }

      if (action) {
        const logEntry = {
          username,
          rangeId: range._id,
          symbol: range.symbol,
          token: range.token,
          side: action,
          price: currentPrice,
          quantity: range.quantity,
          total: currentPrice * range.quantity,
        };

        try {
          const orderResult = await placeWazirxOrder(
            apiKey, apiSecret, range.symbol, action, currentPrice, range.quantity
          );

          logEntry.status = "executed";
          logEntry.orderId = orderResult.id || orderResult.orderId || "";

          // Calculate P/L for sells
          if (action === "sell" && range.totalBuys > 0) {
            // Simple P/L: difference from midpoint of range
            const midPrice = (range.lowerPrice + range.upperPrice) / 2;
            logEntry.profitLoss = (currentPrice - midPrice) * range.quantity;
          } else if (action === "buy") {
            logEntry.profitLoss = 0;
          }

          // Update range counters
          if (action === "buy") {
            range.totalBuys += 1;
          } else {
            range.totalSells += 1;
          }
          range.totalProfitLoss += logEntry.profitLoss;
          range.lastAction = action;
          range.lastActionAt = now;

          // Update wallet balance cache
          if (action === "buy") {
            funds["INR"] = (funds["INR"] || 0) - (currentPrice * range.quantity);
            funds[range.token] = (funds[range.token] || 0) + range.quantity;
          } else {
            funds["INR"] = (funds["INR"] || 0) + (currentPrice * range.quantity);
            funds[range.token] = (funds[range.token] || 0) - range.quantity;
          }

          executed.push({ rangeId: range._id, action, price: currentPrice, quantity: range.quantity, orderId: logEntry.orderId });
        } catch (err) {
          logEntry.status = "failed";
          logEntry.error = err.message;
        }

        await TradeRangeLog.create(logEntry);
      }

      await range.save();
    }

    return Response.json({ executed, checkedAt: now.toISOString() });
  } catch (err) {
    console.error("Trade range execute error:", err);
    return Response.json({ error: "Failed to execute trade range checks" }, { status: 500 });
  }
}
