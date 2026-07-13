require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const morgan       = require("morgan");
const helmet       = require("helmet");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const hpp          = require("hpp");
const path         = require("path");

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

connectDB();

const app = express();

// ── OWASP A05 – Security Misconfiguration ──────────────────────────────────
// Helmet: sets 14 security-related HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy:  { policy: "cross-origin" }, // allow /uploads images
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "https://js.stripe.com"],
        frameSrc:    ["'self'", "https://js.stripe.com"],
        connectSrc:  ["'self'", "https://api.stripe.com"],
        imgSrc:      ["'self'", "data:", "https://images.unsplash.com", "blob:"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        fontSrc:     ["'self'", "data:"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // HSTS — only meaningful in production behind HTTPS
    strictTransportSecurity: process.env.NODE_ENV === "production"
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
  })
);

// ── OWASP A07 – CORS locked to client origin ──────────────────────────────
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow no-origin requests (Postman, mobile) in non-production
      if (!origin && process.env.NODE_ENV !== "production") return cb(null, true);
      // Allow exact match
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // Allow all Vercel preview deployments for this project
      if (origin && origin.match(/https:\/\/luxe-resturant-front-end.*\.vercel\.app$/)) return cb(null, true);
      cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parsing — explicit size limits (A08 – Software/Data Integrity) ───
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// ── OWASP A03 – NoSQL Injection ───────────────────────────────────────────
// Strips $-prefixed keys from req.body, req.query, req.params
app.use(mongoSanitize({ replaceWith: "_" }));

// ── OWASP A03 – HTTP Parameter Pollution ─────────────────────────────────
app.use(hpp({ whitelist: ["sort", "fields", "page", "limit", "category"] }));

// ── Logging (dev only — never log sensitive data in production) ───────────
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// ── Static uploads ────────────────────────────────────────────────────────
// Vercel serverless: filesystem is ephemeral — /uploads not served statically.
// In production use Cloudinary/S3. Locally we serve from the uploads/ folder.
if (!process.env.VERCEL) {
  app.use(
    "/uploads",
    (req, res, next) => {
      if (req.path.includes("..")) return res.status(400).json({ success: false, message: "Invalid path" });
      next();
    },
    express.static(path.join(__dirname, "uploads"), {
      dotfiles: "deny",
      maxAge: "1d",
    })
  );
}

// ── OWASP A04 – Rate Limiting on all /api routes ──────────────────────────
app.use("/api", apiLimiter);

// ── Mount routers ─────────────────────────────────────────────────────────
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

// Health check — no sensitive info
app.get("/api/health", (req, res) =>
  res.json({ success: true, message: "API is running", env: process.env.NODE_ENV })
);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

// ── Server start ──────────────────────────────────────────────────────────
// Vercel: exports the app (no app.listen — Vercel handles the port)
// Local:  starts the HTTP server normally
if (process.env.VERCEL || process.env.NODE_ENV === "test") {
  // Serverless — just export the app
  module.exports = app;
} else {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () =>
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
  );
  module.exports = app;
}
