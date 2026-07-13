/**
 * server.js
 *
 * ROOT CAUSE FIX (Vercel serverless):
 *
 * BEFORE (broken):
 *   connectDB();          ← fire-and-forget at module load time
 *   const app = express(); ← app exported immediately, DB may not be ready
 *   // first request arrives → controller runs → DB not connected → CRASH
 *
 * AFTER (fixed):
 *   connectDB() is removed from module-load scope.
 *   A `dbConnect` middleware is registered as the VERY FIRST middleware.
 *   Every incoming request awaits connectDB() before reaching any route.
 *   connectDB() returns the cached connection instantly on warm invocations,
 *   so there is no performance penalty after the first cold-start connection.
 */

require("dotenv").config();
const express       = require("express");
const cors          = require("cors");
const morgan        = require("morgan");
const helmet        = require("helmet");
const cookieParser  = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const hpp           = require("hpp");
const path          = require("path");

const connectDB      = require("./config/db");
const errorHandler   = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");

// Route files
const authRoutes        = require("./routes/authRoutes");
const categoryRoutes    = require("./routes/categoryRoutes");
const menuRoutes        = require("./routes/menuRoutes");
const orderRoutes       = require("./routes/orderRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const reviewRoutes      = require("./routes/reviewRoutes");
const galleryRoutes     = require("./routes/galleryRoutes");
const couponRoutes      = require("./routes/couponRoutes");
const contactRoutes     = require("./routes/contactRoutes");
const newsletterRoutes  = require("./routes/newsletterRoutes");
const settingsRoutes    = require("./routes/settingsRoutes");
const userRoutes        = require("./routes/userRoutes");
const dashboardRoutes   = require("./routes/dashboardRoutes");

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// FIX: DB connection middleware — MUST be the very first middleware.
//
// Every request awaits connectDB() before proceeding.
// On cold start  → opens a new connection, caches it, then continues.
// On warm start  → connectDB() returns the cached conn in ~0ms, then continues.
// If DB is down  → returns 503 immediately instead of a cryptic Mongoose error.
// ─────────────────────────────────────────────────────────────────────────────
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    res.status(503).json({
      success: false,
      message: "Database unavailable. Please try again shortly.",
    });
  }
});

// ── Security headers (Helmet) ─────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "https://js.stripe.com"],
        frameSrc:   ["'self'", "https://js.stripe.com"],
        connectSrc: ["'self'", "https://api.stripe.com"],
        imgSrc:     ["'self'", "data:", "https://images.unsplash.com", "blob:"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        fontSrc:    ["'self'", "data:"],
        objectSrc:  ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    strictTransportSecurity:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin && process.env.NODE_ENV !== "production") return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (
        origin &&
        origin.match(/https:\/\/luxe-resturant-front-end.*\.vercel\.app$/)
      )
        return cb(null, true);
      cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials:    true,
    methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body / Cookie parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// ── NoSQL injection + HTTP param pollution protection ─────────────────────
app.use(mongoSanitize({ replaceWith: "_" }));
app.use(hpp({ whitelist: ["sort", "fields", "page", "limit", "category"] }));

// ── Dev logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// ── Static uploads (local only — Vercel filesystem is read-only) ──────────
if (!process.env.VERCEL) {
  app.use(
    "/uploads",
    (req, res, next) => {
      if (req.path.includes(".."))
        return res.status(400).json({ success: false, message: "Invalid path" });
      next();
    },
    express.static(path.join(__dirname, "uploads"), {
      dotfiles: "deny",
      maxAge:   "1d",
    })
  );
}

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use("/api", apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",         authRoutes);
app.use("/api/categories",   categoryRoutes);
app.use("/api/menu",         menuRoutes);
app.use("/api/orders",       orderRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/reviews",      reviewRoutes);
app.use("/api/gallery",      galleryRoutes);
app.use("/api/coupons",      couponRoutes);
app.use("/api/contact",      contactRoutes);
app.use("/api/newsletter",   newsletterRoutes);
app.use("/api/settings",     settingsRoutes);
app.use("/api/users",        userRoutes);
app.use("/api/dashboard",    dashboardRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({
    success: true,
    message: "API is running",
    env:     process.env.NODE_ENV,
    db:      require("mongoose").connection.readyState === 1 ? "connected" : "disconnected",
  })
);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Start / Export ────────────────────────────────────────────────────────
if (process.env.VERCEL) {
  // Serverless: Vercel calls the exported handler directly — no listen()
  module.exports = app;
} else {
  // Traditional server: connect DB first, then start listening
  connectDB()
    .then(() => {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () =>
        console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
      );
    })
    .catch((err) => {
      console.error("Failed to connect to MongoDB:", err.message);
      process.exit(1);
    });
  module.exports = app;
}
