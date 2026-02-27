import { verifyToken } from "@/lib/jwt";
import connectDB from "@/lib/mongodb";
import UserSettings from "@/lib/models/UserSettings";
import { encrypt, decrypt } from "@/lib/crypto";

const SENSITIVE_FIELDS = [
  "awsAccessKeyId",
  "awsSecretAccessKey",
  "wazirxApiKey",
  "wazirxApiSecret",
];

function mask(value) {
  if (!value || value.length < 6) return value ? "****" : "";
  return value.slice(0, 4) + "****" + value.slice(-2);
}

async function getAuthPayload(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

// GET — fetch user settings (credentials are masked)
export async function GET(request) {
  try {
    const payload = await getAuthPayload(request);
    if (!payload || !payload.username || payload.role === "guest") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const settings = await UserSettings.findOne({
      username: payload.username.toLowerCase(),
    });

    if (!settings) {
      return Response.json({ settings: null, syncEnabled: false });
    }

    return Response.json({
      syncEnabled: settings.syncEnabled,
      settings: {
        awsAccessKeyId: mask(decrypt(settings.awsAccessKeyId)),
        awsSecretAccessKey: settings.awsSecretAccessKey ? "****" : "",
        awsRegion: settings.awsRegion,
        selectedModel: settings.selectedModel,
        customModels: settings.customModels,
        modelOverrides: Object.fromEntries(settings.modelOverrides || new Map()),
        wazirxApiKey: mask(decrypt(settings.wazirxApiKey)),
        wazirxApiSecret: settings.wazirxApiSecret ? "****" : "",
        hasAwsCredentials: !!(settings.awsAccessKeyId && settings.awsSecretAccessKey),
        hasWazirxCredentials: !!(settings.wazirxApiKey && settings.wazirxApiSecret),
      },
    });
  } catch (err) {
    console.error("Settings GET error:", err);
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// POST — save user settings (credentials are encrypted before storage)
export async function POST(request) {
  try {
    const payload = await getAuthPayload(request);
    if (!payload || !payload.username || payload.role === "guest") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const username = payload.username.toLowerCase();

    await connectDB();

    const update = { syncEnabled: true };

    // Encrypt sensitive fields before storing
    for (const field of SENSITIVE_FIELDS) {
      if (body[field] !== undefined && body[field] !== "" && !body[field].includes("****")) {
        update[field] = encrypt(body[field]);
      }
    }

    // Non-sensitive fields
    if (body.awsRegion !== undefined) update.awsRegion = body.awsRegion;
    if (body.selectedModel !== undefined) update.selectedModel = body.selectedModel;
    if (body.customModels !== undefined) update.customModels = body.customModels;
    if (body.modelOverrides !== undefined) update.modelOverrides = body.modelOverrides;
    if (body.syncEnabled !== undefined) update.syncEnabled = body.syncEnabled;

    const settings = await UserSettings.findOneAndUpdate(
      { username },
      { $set: update },
      { upsert: true, new: true }
    );

    return Response.json({
      message: "Settings saved",
      syncEnabled: settings.syncEnabled,
    });
  } catch (err) {
    console.error("Settings POST error:", err);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

// DELETE — disable sync and remove cloud settings
export async function DELETE(request) {
  try {
    const payload = await getAuthPayload(request);
    if (!payload || !payload.username || payload.role === "guest") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await UserSettings.deleteOne({
      username: payload.username.toLowerCase(),
    });

    return Response.json({ message: "Cloud settings deleted" });
  } catch (err) {
    console.error("Settings DELETE error:", err);
    return Response.json({ error: "Failed to delete settings" }, { status: 500 });
  }
}
