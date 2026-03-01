import mongoose from "mongoose";

const tradeRangeSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
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
    // Price range boundaries (INR)
    lowerPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    upperPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // Quantity to trade per trigger
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    // Whether bot is actively monitoring
    active: {
      type: Boolean,
      default: true,
    },
    // Max trades per day (0 = unlimited)
    maxTradesPerDay: {
      type: Number,
      default: 0,
    },
    // Counters
    totalBuys: { type: Number, default: 0 },
    totalSells: { type: Number, default: 0 },
    totalProfitLoss: { type: Number, default: 0 },
    // Last action taken
    lastAction: {
      type: String,
      enum: ["buy", "sell", null],
      default: null,
    },
    lastActionAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tradeRangeSchema.index({ username: 1, active: 1 });
tradeRangeSchema.index({ username: 1, symbol: 1 });

export default mongoose.models.TradeRange ||
  mongoose.model("TradeRange", tradeRangeSchema);
