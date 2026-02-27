import { verifyToken } from "@/lib/jwt";
import { getLoginHistory } from "@/lib/users";

export async function GET(request) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || !payload.username || payload.role === "guest") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logins = await getLoginHistory(payload.username);

    // Return most recent first
    const sorted = [...logins].reverse().map((l) => ({
      ip: l.ip || "Unknown",
      userAgent: l.userAgent || "Unknown",
      at: l.at,
    }));

    return Response.json({ logins: sorted });
  } catch (err) {
    console.error("Sessions error:", err);
    return Response.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
