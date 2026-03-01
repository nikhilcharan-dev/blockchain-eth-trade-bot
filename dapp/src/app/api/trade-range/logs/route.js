import { verifyToken } from "@/lib/jwt";
import connectDB from "@/lib/mongodb";
import TradeRangeLog from "@/lib/models/TradeRangeLog";

async function getUsername(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || !payload.username || payload.role === "guest") return null;
  return payload.username.toLowerCase();
}

// GET — Fetch trade logs with stats
export async function GET(request) {
  try {
    const username = await getUsername(request);
    if (!username) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rangeId = searchParams.get("rangeId");
    const limit = Math.min(parseInt(searchParams.get("limit")) || 100, 500);

    await connectDB();

    const query = { username };
    if (rangeId) query.rangeId = rangeId;

    const logs = await TradeRangeLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Compute daily stats
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayLogs = logs.filter(l => new Date(l.createdAt) >= startOfDay);
    const todayBuys = todayLogs.filter(l => l.side === "buy" && l.status === "executed");
    const todaySells = todayLogs.filter(l => l.side === "sell" && l.status === "executed");
    const todayTrades = todayBuys.length + todaySells.length;
    const todayPL = todayLogs.reduce((sum, l) => sum + (l.profitLoss || 0), 0);

    // All-time stats
    const allExecuted = logs.filter(l => l.status === "executed");
    const totalPL = allExecuted.reduce((sum, l) => sum + (l.profitLoss || 0), 0);
    const totalBuys = allExecuted.filter(l => l.side === "buy").length;
    const totalSells = allExecuted.filter(l => l.side === "sell").length;

    // Compute daily aggregates for chart (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyAgg = {};
    for (const log of logs) {
      if (log.status !== "executed") continue;
      const d = new Date(log.createdAt);
      if (d < thirtyDaysAgo) continue;
      const key = d.toISOString().slice(0, 10);
      if (!dailyAgg[key]) {
        dailyAgg[key] = { date: key, buys: 0, sells: 0, buyVolume: 0, sellVolume: 0, profitLoss: 0, trades: 0 };
      }
      dailyAgg[key].trades += 1;
      if (log.side === "buy") {
        dailyAgg[key].buys += 1;
        dailyAgg[key].buyVolume += log.total || 0;
      } else {
        dailyAgg[key].sells += 1;
        dailyAgg[key].sellVolume += log.total || 0;
      }
      dailyAgg[key].profitLoss += log.profitLoss || 0;
    }

    const dailyStats = Object.values(dailyAgg).sort((a, b) => a.date.localeCompare(b.date));

    return Response.json({
      logs,
      stats: {
        todayTrades,
        todayBuys: todayBuys.length,
        todaySells: todaySells.length,
        todayPL,
        totalTrades: totalBuys + totalSells,
        totalBuys,
        totalSells,
        totalPL,
      },
      dailyStats,
    });
  } catch (err) {
    console.error("Fetch trade logs error:", err);
    return Response.json({ error: "Failed to fetch trade logs" }, { status: 500 });
  }
}
