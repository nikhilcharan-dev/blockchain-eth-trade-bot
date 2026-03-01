import { verifyToken } from "@/lib/jwt";
import connectDB from "@/lib/mongodb";
import TradeRange from "@/lib/models/TradeRange";
import TradeRangeLog from "@/lib/models/TradeRangeLog";

async function getUsername(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || !payload.username || payload.role === "guest") return null;
  return payload.username.toLowerCase();
}

// GET — Fetch all trade ranges for user
export async function GET(request) {
  try {
    const username = await getUsername(request);
    if (!username) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const ranges = await TradeRange.find({ username }).sort({ createdAt: -1 }).lean();
    return Response.json({ ranges });
  } catch (err) {
    console.error("Fetch trade ranges error:", err);
    return Response.json({ error: "Failed to fetch trade ranges" }, { status: 500 });
  }
}

// POST — Create a new trade range
export async function POST(request) {
  try {
    const username = await getUsername(request);
    if (!username) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { token, lowerPrice, upperPrice, quantity, maxTradesPerDay } = body;

    if (!token || typeof token !== "string") {
      return Response.json({ error: "Token is required" }, { status: 400 });
    }
    const tokenUpper = token.trim().toUpperCase();
    const symbol = `${tokenUpper.toLowerCase()}inr`;

    const lower = parseFloat(lowerPrice);
    const upper = parseFloat(upperPrice);
    const qty = parseFloat(quantity);

    if (isNaN(lower) || lower <= 0) {
      return Response.json({ error: "Invalid lower price" }, { status: 400 });
    }
    if (isNaN(upper) || upper <= 0) {
      return Response.json({ error: "Invalid upper price" }, { status: 400 });
    }
    if (upper <= lower) {
      return Response.json({ error: "Upper price must be greater than lower price" }, { status: 400 });
    }
    if (isNaN(qty) || qty <= 0) {
      return Response.json({ error: "Invalid quantity" }, { status: 400 });
    }

    await connectDB();
    const range = await TradeRange.create({
      username,
      symbol,
      token: tokenUpper,
      lowerPrice: lower,
      upperPrice: upper,
      quantity: qty,
      maxTradesPerDay: parseInt(maxTradesPerDay) || 0,
      active: true,
    });

    return Response.json({ range }, { status: 201 });
  } catch (err) {
    console.error("Create trade range error:", err);
    return Response.json({ error: "Failed to create trade range" }, { status: 500 });
  }
}

// PUT — Update a trade range (toggle active, update prices, etc.)
export async function PUT(request) {
  try {
    const username = await getUsername(request);
    if (!username) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { rangeId, ...updates } = body;

    if (!rangeId) {
      return Response.json({ error: "Range ID is required" }, { status: 400 });
    }

    // Only allow safe fields to be updated
    const allowed = ["lowerPrice", "upperPrice", "quantity", "active", "maxTradesPerDay"];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    if (safeUpdates.lowerPrice !== undefined && safeUpdates.upperPrice !== undefined) {
      if (parseFloat(safeUpdates.upperPrice) <= parseFloat(safeUpdates.lowerPrice)) {
        return Response.json({ error: "Upper price must be greater than lower price" }, { status: 400 });
      }
    }

    await connectDB();
    const range = await TradeRange.findOneAndUpdate(
      { _id: rangeId, username },
      { $set: safeUpdates },
      { new: true }
    ).lean();

    if (!range) {
      return Response.json({ error: "Trade range not found" }, { status: 404 });
    }

    return Response.json({ range });
  } catch (err) {
    console.error("Update trade range error:", err);
    return Response.json({ error: "Failed to update trade range" }, { status: 500 });
  }
}

// DELETE — Delete a trade range and its logs
export async function DELETE(request) {
  try {
    const username = await getUsername(request);
    if (!username) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rangeId = searchParams.get("id");

    if (!rangeId) {
      return Response.json({ error: "Range ID is required" }, { status: 400 });
    }

    await connectDB();
    const deleted = await TradeRange.findOneAndDelete({ _id: rangeId, username });
    if (!deleted) {
      return Response.json({ error: "Trade range not found" }, { status: 404 });
    }

    // Also delete associated logs
    await TradeRangeLog.deleteMany({ rangeId });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Delete trade range error:", err);
    return Response.json({ error: "Failed to delete trade range" }, { status: 500 });
  }
}
