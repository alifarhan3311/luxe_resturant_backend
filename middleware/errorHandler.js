/**
 * Central error handler — OWASP A05 / A09
 *
 * A05 – Security Misconfiguration:
 *   - Never exposes stack traces, internal paths or raw Mongoose errors in production
 *   - Maps all known error types to safe, generic messages
 *
 * A09 – Security Logging:
 *   - Logs full error (with stack) to server console for debugging
 *   - Never forwards internal details to the client in production
 */
const ErrorResponse = require("../utils/ErrorResponse");

const isProd = process.env.NODE_ENV === "production";

const errorHandler = (err, req, res, next) => {
  let error = new ErrorResponse(err.message || "Server Error", err.statusCode || 500);

  // ── Structured server-side logging (never sent to client) ──────────────
  if (!isProd) {
    console.error("──────────────────────────────────────────");
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.error("Error:", err.message);
    console.error(err.stack);
    console.error("──────────────────────────────────────────");
  } else {
    // In production only log the minimum — no stack trace
    console.error(`[ERROR] ${new Date().toISOString()} ${req.method} ${req.originalUrl} — ${err.message}`);
  }

  // ── Mongoose CastError (invalid ObjectId) ──────────────────────────────
  if (err.name === "CastError") {
    error = new ErrorResponse("Resource not found", 404);
  }

  // ── Mongoose Duplicate Key ─────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    // In production, don't reveal which field is duplicate
    const msg = isProd ? "A record with that value already exists" : `Duplicate value for field: ${field}`;
    error = new ErrorResponse(msg, 400);
  }

  // ── Mongoose Validation Error ──────────────────────────────────────────
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((v) => v.message);
    error = new ErrorResponse(messages.join(", "), 400);
  }

  // ── JWT Errors ─────────────────────────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    error = new ErrorResponse("Invalid token. Please log in again.", 401);
  }
  if (err.name === "TokenExpiredError") {
    error = new ErrorResponse("Session expired. Please log in again.", 401);
  }

  // ── Multer file errors ─────────────────────────────────────────────────
  if (err.code === "LIMIT_FILE_SIZE") {
    error = new ErrorResponse("File too large. Maximum size is 5MB.", 400);
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    error = new ErrorResponse("Unexpected file field in upload.", 400);
  }

  // ── CORS error ─────────────────────────────────────────────────────────
  if (err.message && err.message.startsWith("CORS:")) {
    error = new ErrorResponse("Not allowed by CORS policy.", 403);
  }

  // ── Generic 500 — never expose internal message in production ──────────
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 && isProd
      ? "An unexpected error occurred. Please try again later."
      : error.message;

  res.status(statusCode).json({ success: false, message });
};

module.exports = errorHandler;
