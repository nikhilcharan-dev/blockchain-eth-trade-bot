import mongoose from "mongoose";

const loginEntrySchema = new mongoose.Schema(
  {
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true },
    logins: { type: [loginEntrySchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
