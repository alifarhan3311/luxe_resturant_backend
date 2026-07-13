/**
 * db.js — Serverless-safe MongoDB connection with caching
 *
 * ROOT CAUSE FIX:
 *  - bufferCommands: false was causing queries to throw immediately
 *    if the connection wasn't ready. Removed — Mongoose will buffer safely.
 *  - The connectDB() function now ALWAYS returns a promise that resolves
 *    only after a confirmed connection. Controllers never run before DB ready.
 *  - Connection is cached on `global` so warm Vercel invocations reuse it.
 */
const mongoose = require("mongoose");

// Persist cache across hot-reloads (dev) and warm invocations (Vercel prod)
let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

const connectDB = async () => {
  // ── Already have a live connection — return immediately (O(1) cost) ────
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // ── Connection attempt already in-flight — wait for it ────────────────
  if (!cached.promise) {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error(
        "MONGO_URI is not defined. Add it to Vercel Environment Variables."
      );
    }

    const opts = {
      // DO NOT set bufferCommands: false here.
      // With it false, any query that runs before connect() resolves will
      // throw instantly. Leave it at the default (true) so Mongoose queues
      // operations until the connection is ready — safer for serverless.
      maxPoolSize:              10,
      serverSelectionTimeoutMS: 10000, // give up after 10s trying to connect
      socketTimeoutMS:          45000, // close idle sockets after 45s
      family:                   4,     // use IPv4, avoids IPv6 issues on some hosts
    };

    cached.promise = mongoose
      .connect(uri, opts)
      .then((m) => {
        console.log(`[DB] Connected: ${m.connection.host}`);
        return m;
      })
      .catch((err) => {
        // Reset promise so the next request can retry
        cached.promise = null;
        cached.conn    = null;
        throw err;
      });
  }

  // ── Await the in-flight promise ────────────────────────────────────────
  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;
