/**
 * Rate limiters — OWASP A04 (Insecure Design / Brute Force Protection)
 *
 * apiLimiter:    300 req / 15 min per IP  — general API traffic
 * authLimiter:   10  req / 15 min per IP  — login / signup / forgot-password
 * uploadLimiter: 20  req / 10 min per IP  — file upload endpoints
 */
const rateLimit = require("express-rate-limit");

const rateLimitResponse = (message) => ({
  success: false,
  message,
});

// General API — 300 req per 15 min
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders:   false,  // Disable X-RateLimit-* legacy headers
  message: rateLimitResponse("Too many requests. Please slow down and try again later."),
  skipSuccessfulRequests: false,
});

// Auth routes — 10 req per 15 min (A07 brute force)
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: rateLimitResponse("Too many authentication attempts. Please try again in 15 minutes."),
  skipSuccessfulRequests: true, // Only count failed requests toward limit
});

// Upload endpoints — 20 uploads per 10 min
exports.uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: rateLimitResponse("Too many upload requests. Please wait before uploading again."),
});
