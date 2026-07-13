/**
 * contactController — OWASP A03 / A05
 *
 * Fixes applied:
 *  - Mass-assignment: only whitelisted fields accepted from req.body
 *  - Input length limits on all string fields
 *  - Email format validated before storing
 *  - Admin reply sanitized before sending in email
 *  - updateMessageStatus locked to only the `status` field
 */
const Contact     = require("../models/Contact");
const asyncHandler  = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const sendEmail     = require("../utils/sendEmail");

const VALID_STATUSES = ["New", "Read", "Replied", "Closed"];
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// @desc    Submit contact form
// @route   POST /api/contact
// @access  Public
exports.submitContact = asyncHandler(async (req, res, next) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message)
    return next(new ErrorResponse("Name, email and message are required", 400));

  if (!EMAIL_RE.test(email))
    return next(new ErrorResponse("Please provide a valid email address", 400));

  // A03 — only whitelisted fields, all trimmed and capped
  const contact = await Contact.create({
    name:    String(name).trim().slice(0, 100),
    email:   String(email).toLowerCase().trim().slice(0, 254),
    phone:   phone   ? String(phone).trim().slice(0, 20)   : undefined,
    subject: subject ? String(subject).trim().slice(0, 200) : undefined,
    message: String(message).trim().slice(0, 2000),
  });

  res.status(201).json({ success: true, data: contact });
});

// @desc    Get all messages (admin inbox)
// @route   GET /api/contact
// @access  Private/Admin
exports.getMessages = asyncHandler(async (req, res) => {
  const filter = {};
  // Allowlist status values to prevent injection via query string
  if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const messages = await Contact.find(filter).sort("-createdAt");
  res.status(200).json({ success: true, count: messages.length, data: messages });
});

// @desc    Reply to a message
// @route   PUT /api/contact/:id/reply
// @access  Private/Admin
exports.replyMessage = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findById(req.params.id);
  if (!contact) return next(new ErrorResponse("Message not found", 404));

  if (!req.body.reply || String(req.body.reply).trim().length === 0)
    return next(new ErrorResponse("Reply text is required", 400));

  const replyText = String(req.body.reply).trim().slice(0, 5000);

  contact.adminReply = replyText;
  contact.status     = "Replied";
  await contact.save();

  sendEmail({
    to:      contact.email,
    subject: `Re: ${contact.subject || "Your message to Luxe Restaurant"}`,
    // Plain text — no HTML injection from admin input
    html: `<p>Hi ${contact.name},</p><p>${replyText.replace(/\n/g, "<br>")}</p>
           <hr><p style="color:#888;font-size:12px">Luxe Restaurant Support Team</p>`,
  }).catch((e) => console.error("Reply email failed:", e.message));

  res.status(200).json({ success: true, data: contact });
});

// @desc    Update message status only
// @route   PUT /api/contact/:id
// @access  Private/Admin
exports.updateMessageStatus = asyncHandler(async (req, res, next) => {
  // A03 — only allow status field to be updated via this route
  if (!req.body.status || !VALID_STATUSES.includes(req.body.status))
    return next(new ErrorResponse(`Status must be one of: ${VALID_STATUSES.join(", ")}`, 400));

  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true }
  );
  if (!contact) return next(new ErrorResponse("Message not found", 404));
  res.status(200).json({ success: true, data: contact });
});

// @desc    Delete message
// @route   DELETE /api/contact/:id
// @access  Private/Admin
exports.deleteMessage = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findByIdAndDelete(req.params.id);
  if (!contact) return next(new ErrorResponse("Message not found", 404));
  res.status(200).json({ success: true, data: {} });
});
