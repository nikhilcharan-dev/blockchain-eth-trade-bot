import { verifyToken } from "@/lib/jwt";
import connectDB from "@/lib/mongodb";
import UserSettings from "@/lib/models/UserSettings";
import { decrypt } from "@/lib/crypto";

export async function getWazirxCredentials(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };

  const payload = await verifyToken(token);
  if (!payload || !payload.username || payload.role === "guest") {
    return { error: "Unauthorized", status: 401 };
  }

  await connectDB();
  const settings = await UserSettings.findOne({
    username: payload.username.toLowerCase(),
  });

  if (!settings || !settings.wazirxApiKey || !settings.wazirxApiSecret) {
    return { error: "WazirX credentials not configured", status: 401 };
  }

  const apiKey = decrypt(settings.wazirxApiKey);
  const apiSecret = decrypt(settings.wazirxApiSecret);

  if (!apiKey || !apiSecret) {
    return { error: "WazirX credentials not configured", status: 401 };
  }

  return { apiKey, apiSecret };
}
