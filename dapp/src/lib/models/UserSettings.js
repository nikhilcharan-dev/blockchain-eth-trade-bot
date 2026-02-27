import mongoose from "mongoose";

const customModelSchema = new mongoose.Schema(
  {
    key: String,
    id: String,
    label: String,
    provider: { type: String, default: "Custom" },
  },
  { _id: false }
);

const userSettingsSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    syncEnabled: { type: Boolean, default: false },

    // AWS Bedrock credentials
    awsAccessKeyId: { type: String, default: "" },
    awsSecretAccessKey: { type: String, default: "" },
    awsRegion: { type: String, default: "us-east-1" },

    // Model config
    selectedModel: { type: String, default: "claude-sonnet" },
    customModels: { type: [customModelSchema], default: [] },
    modelOverrides: { type: Map, of: String, default: {} },

    // WazirX API keys
    wazirxApiKey: { type: String, default: "" },
    wazirxApiSecret: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.UserSettings ||
  mongoose.model("UserSettings", userSettingsSchema);
