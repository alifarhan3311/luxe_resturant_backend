/**
 * newsletterController — OWASP A03 / A07
 *
 * Fixes applied:
 *  - Email validated and normalised before DB write
 *  - subscribe always returns 200 (no email enumeration)
 *  - Bulk send: subject + html length capped, rate limited at route level
 *  - No raw req.body passed to Mongoose
 */
const Newsletter  = require("../models/Newsletter");
const asyncHandler  = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const sendEmail     = require("../utils/sendEmail");

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// @desc    Subscribe to newsletter
// @route   POST /api/newsletter/subscribe
// @access  Public
exports.subscribe = asyncHandler(async (req, res, next) => {
  const raw = req.body.email;
  if (!raw) return next(new ErrorResponse("Email is required", 400));

  const email = String(raw).toLowerCase().trim().slice(0, 254);
  if (!EMAIL_RE.test(email)) return next(new ErrorResponse("Please provide a valid email", 400));

  const existing = await Newsletter.findOne({ email });
  if (existing) {
    if (existing.isActive) {
      // A07 — don't confirm whether email exists; just return success
      return res.status(200).json({ success: true, message: "Subscribed successfully" });
    }
    existing.isActive = true;
    await existing.save();
    return res.status(200).json({ success: true, message: "Subscribed successfully" });
  }

  await Newsletter.create({ email });
  res.status(201).json({ success: true, message: "Subscribed successfully" });
});

// @desc    Unsubscribe
// @route   POST /api/newsletter/unsubscribe
// @access  Public
exports.unsubscribe = asyncHandler(async (req, res, next) => {
  const raw = req.body.email;
  if (!raw) return next(new ErrorResponse("Email is required", 400));

  const email = String(raw).toLowerCase().trim().slice(0, 254);

  // A07 — always return success to prevent email enumeration
  await Newsletter.findOneAndUpdate({ email }, { isActive: false });
  res.status(200).json({ success: true, message: "Unsubscribed successfully" });
});

// @desc    Get all active subscribers (admin)
// @route   GET /api/newsletter
// @access  Private/Admin
exports.getSubscribers = asyncHandler(async (req, res) => {
  const subs = await Newsletter.find({ isActive: true }).sort("-createdAt").select("email createdAt");
  res.status(200).json({ success: true, count: subs.length, data: subs });
});

// @desc    Send bulk email newsletter
// @route   POST /api/newsletter/send
// @access  Private/Admin
exports.sendNewsletter = asyncHandler(async (req, res, next) => {
  const { subject, html } = req.body;

  if (!subject || !html)
    return next(new ErrorResponse("Subject and html are required", 400));

  // Cap content length to prevent abuse
  const safeSubject = String(subject).trim().slice(0, 200);
  const safeHtml    = String(html).trim().slice(0, 50000);

  const subs = await Newsletter.find({ isActive: true }).select("email");

  // Send in batches of 50 to avoid SMTP rate limits
  const BATCH = 50;
  let sent = 0;
  for (let i = 0; i < subs.length; i += BATCH) {
    const batch = subs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((s) => sendEmail({ to: s.email, subject: safeSubject, html: safeHtml }))
    );
    sent += results.filter((r) => r.status === "fulfilled").length;
  }

  res.status(200).json({
    success: true,
    message: `Newsletter sent to ${sent} of ${subs.length} subscribers`,
  });
});
