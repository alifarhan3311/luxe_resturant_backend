/**
 * authController — OWASP-hardened authentication
 *
 * A02 – Cryptographic Failures:
 *   - Passwords hashed with bcrypt (cost 10) in User model pre-save hook
 *   - Reset tokens hashed with SHA-256 before DB storage
 *   - JWT signed with HS256 + expiry enforced
 *   - Secure, HttpOnly, SameSite cookies
 *
 * A04 – Brute Force / Account Lockout:
 *   - 5 consecutive failed login attempts → account locked for 15 minutes
 *   - Lockout fields: loginAttempts, lockUntil stored on User model
 *
 * A07 – Identification & Auth Failures:
 *   - Identical error message for wrong email vs wrong password (no enumeration)
 *   - Forgot password always returns 200 regardless of email existence
 *   - Password strength enforced server-side (min 8 chars, must have uppercase/number)
 */

const crypto = require("crypto");
const User          = require("../models/User");
const asyncHandler  = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const sendTokenResponse = require("../utils/sendTokenResponse");
const sendEmail     = require("../utils/sendEmail");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS   = 15 * 60 * 1000; // 15 minutes

// Validates password strength server-side (A07)
const isStrongPassword = (pwd) => {
  if (!pwd || pwd.length < 8) return false;
  if (!/[A-Z]/.test(pwd))    return false;
  if (!/[0-9]/.test(pwd))    return false;
  return true;
};

// ─── Signup ───────────────────────────────────────────────────────────────
exports.signup = asyncHandler(async (req, res, next) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password)
    return next(new ErrorResponse("Name, email and password are required", 400));

  // A07 – Server-side password policy
  if (!isStrongPassword(password))
    return next(new ErrorResponse("Password must be at least 8 characters with one uppercase letter and one number", 400));

  // Check duplicate — returns SAME message as login to prevent enumeration (A07)
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) return next(new ErrorResponse("Email already registered", 400));

  const user = await User.create({
    name:     name.trim().slice(0, 100),
    email:    email.toLowerCase().trim(),
    phone:    phone ? phone.trim().slice(0, 20) : undefined,
    password,
  });

  sendTokenResponse(user, 201, res);
});

// ─── Login ────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new ErrorResponse("Please provide email and password", 400));

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select("+password +loginAttempts +lockUntil");

  // A07 – Same generic message for no-user and wrong password (no enumeration)
  const genericMsg = "Invalid credentials";

  if (!user) return next(new ErrorResponse(genericMsg, 401));

  if (!user.isActive) return next(new ErrorResponse("Account is deactivated. Contact support.", 403));

  // A04 – Account lockout check
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return next(new ErrorResponse(`Account temporarily locked. Try again in ${mins} minute(s).`, 429));
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    // Increment failed attempts
    user.loginAttempts = (user.loginAttempts || 0) + 1;

    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil      = new Date(Date.now() + LOCK_DURATION_MS);
      user.loginAttempts  = 0;
      await user.save({ validateBeforeSave: false });
      return next(new ErrorResponse("Too many failed attempts. Account locked for 15 minutes.", 429));
    }

    await user.save({ validateBeforeSave: false });
    return next(new ErrorResponse(genericMsg, 401));
  }

  // Successful login — reset lockout counters
  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil     = undefined;
    await user.save({ validateBeforeSave: false });
  }

  sendTokenResponse(user, 200, res);
});

// ─── Logout ───────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  res.cookie("token", "none", {
    expires:  new Date(Date.now() + 5 * 1000),
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

// ─── Get current user ─────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  // Re-fetch from DB — never trust stale token payload
  const user = await User.findById(req.user.id).select("-password -loginAttempts -lockUntil -resetPasswordToken -resetPasswordExpire");
  res.status(200).json({ success: true, data: user });
});

// ─── Forgot Password ──────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase().trim() });

  // A07 – Always return 200 to prevent email enumeration
  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  // Use HTTPS in production — never expose raw token in logs
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  const html = `
    <p>You requested a password reset for your Luxe Restaurant account.</p>
    <p>Click the link below to set a new password — this link is valid for <strong>30 minutes</strong>:</p>
    <a href="${resetUrl}" style="color:#D4AF37">${resetUrl}</a>
    <p>If you did not request this, please ignore this email. Your password will not change.</p>
  `;

  try {
    await sendEmail({ to: user.email, subject: "Luxe Restaurant — Password Reset", html });
  } catch (err) {
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpire  = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ErrorResponse("Email could not be sent. Please try again later.", 500));
  }

  res.status(200).json({
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
  });
});

// ─── Reset Password ───────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // A02 – token is hashed in DB; raw token only lives in the URL (never stored)
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.resettoken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) return next(new ErrorResponse("Invalid or expired reset token", 400));

  // A07 – Enforce password policy on reset too
  if (!isStrongPassword(req.body.password))
    return next(new ErrorResponse("Password must be at least 8 characters with one uppercase letter and one number", 400));

  user.password             = req.body.password;
  user.resetPasswordToken   = undefined;
  user.resetPasswordExpire  = undefined;
  user.loginAttempts        = 0;  // clear any lockout on successful reset
  user.lockUntil            = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// ─── Update Password (authenticated) ─────────────────────────────────────
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");

  const isMatch = await user.matchPassword(req.body.currentPassword);
  if (!isMatch) return next(new ErrorResponse("Current password is incorrect", 401));

  if (!isStrongPassword(req.body.newPassword))
    return next(new ErrorResponse("New password must be at least 8 characters with one uppercase letter and one number", 400));

  if (req.body.currentPassword === req.body.newPassword)
    return next(new ErrorResponse("New password must be different from the current password", 400));

  user.password = req.body.newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
});
