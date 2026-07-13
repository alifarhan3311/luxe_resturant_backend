/**
 * db.js — MongoDB connection with serverless caching
 *
 * Vercel serverless functions are stateless — each invocation may be a
 * cold start. We cache the mongoose connection on the global object so
 * warm invocations reuse the existing connection instead of opening a
 * new one on every request (avoids "MongooseError: too many connections").
 */
const mongoose = require("mongoose");

// Cache on global to survive across hot-reloads in dev and warm invocations in prod
let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

const connectDB = async () => {
  // Already connected — return immediately
  if (cached.conn) return cached.conn;

  // Connection in progress — wait for it
  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    cached.promise = mongoose
      .connect(uri, {
        // Recommended settings for serverless
        bufferCommands:    false,   // don't buffer ops when disconnected
        maxPoolSize:       10,      // limit connections
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS:   45000,
      })
      .then((m) => {
        console.log(`MongoDB Connected: ${m.connection.host}`);
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // reset so next call retries
    console.error(`MongoDB connection error: ${err.message}`);
    throw err;
  }

  return cached.conn;
};

module.exports = connectDB;
