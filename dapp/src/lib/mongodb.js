import mongoose from "mongoose";

let cached = global._mongooseCache;

if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export default async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URL;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URL is not defined in environment variables");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI)
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
