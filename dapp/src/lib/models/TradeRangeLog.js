import mongoose from "mongoose";

const tradeRangeLogSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    rangeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TradeRange",
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    side: {
      type: String,
      enum: ["buy", "sell"],
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    // Whether the trade was actually executed on the exchange or just recorded
    status: {
      type: String,
      enum: ["executed", "failed", "simulated"],
      default: "executed",
    },
    // Error message if failed
    error: { type: String, default: "" },
    // The WazirX order ID if executed
    orderId: { type: String, default: "" },
    // P/L for this specific trade (calculated against avg buy price)
    profitLoss: { type: Number, default: 0 },
  },
  { timestamps: true }
);

tradeRangeLogSchema.index({ username: 1, createdAt: -1 });
tradeRangeLogSchema.index({ rangeId: 1, createdAt: -1 });

export default mongoose.models.TradeRangeLog ||
  mongoose.model("TradeRangeLog", tradeRangeLogSchema);
