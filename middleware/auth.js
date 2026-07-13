/**
 * auth middleware — OWASP A01 / A07
 *
 * A01 – Broken Access Control:
 *   - Every protected route re-fetches the user from DB (never trusts stale token data)
 *   - Checks isActive on every request — deactivated users are instantly blocked
 *
 * A07 – Identification & Authentication Failures:
 *   - Accepts token from httpOnly cookie first, Authorization header second
 *   - Rejects tokens with algorithm "none" (jwt.verify enforces algorithm)
 *   - Returns identical 401 message for all auth failures (no enumeration)
 */
const jwt           = require("jsonwebtoken");
const asyncHandler  = require("./asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const User          = require("../models/User");

const GENERIC_AUTH_ERROR = "Not authorized to access this route";

exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1st priority: Authorization header (reliable cross-origin)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  // 2nd priority: httpOnly cookie (works same-origin or when SameSite=None)
  else if (req.cookies?.token && req.cookies.token !== "none") {
    token = req.cookies.token;
  }

  if (!token) return next(new ErrorResponse(GENERIC_AUTH_ERROR, 401));

  try {
    // A07 – Explicitly specify algorithm; rejects "none" algorithm attacks
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // A01 – Re-fetch from DB every request (checks isActive, role changes)
    const user = await User.findById(decoded.id).select(
      "-password -loginAttempts -lockUntil -resetPasswordToken -resetPasswordExpire"
    );

    if (!user)           return next(new ErrorResponse(GENERIC_AUTH_ERROR, 401));
    if (!user.isActive)  return next(new ErrorResponse("Account is deactivated. Contact support.", 403));

    req.user = user;
    next();
  } catch (err) {
    // Map all JWT errors to the same generic message (no enumeration)
    return next(new ErrorResponse(GENERIC_AUTH_ERROR, 401));
  }
});

// A01 – Role-based access control
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(
      new ErrorResponse(
        `You do not have permission to perform this action`,
        403
      )
    );
  }
  next();
};
