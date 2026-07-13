/**
 * reservationController — OWASP A01 / A03 / A05
 *
 * Fixes applied:
 *  - Mass-assignment: only whitelisted fields from req.body
 *  - Date validated to be in the future (can't book past dates)
 *  - Guests count capped (1–20)
 *  - Admin updateReservation only allows status + tableNumber fields
 *  - cancelReservation checks ownership (A01)
 */
const Reservation   = require("../models/Reservation");
const asyncHandler  = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const APIFeatures   = require("../utils/apiFeatures");
const sendEmail     = require("../utils/sendEmail");

const VALID_STATUSES = ["Pending", "Approved", "Rejected", "Completed", "Cancelled"];
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// @desc    Create reservation
// @route   POST /api/reservations
// @access  Public
exports.createReservation = asyncHandler(async (req, res, next) => {
  const { name, email, phone, guests, date, time, specialRequest } = req.body;

  // Required field validation
  if (!name || !email || !phone || !guests || !date || !time)
    return next(new ErrorResponse("Name, email, phone, guests, date and time are required", 400));

  if (!EMAIL_RE.test(email))
    return next(new ErrorResponse("Please provide a valid email address", 400));

  const guestCount = parseInt(guests, 10);
  if (isNaN(guestCount) || guestCount < 1 || guestCount > 20)
    return next(new ErrorResponse("Guests must be between 1 and 20", 400));

  // Date must be in the future
  const reservationDate = new Date(date);
  if (isNaN(reservationDate.getTime()))
    return next(new ErrorResponse("Invalid date format", 400));
  if (reservationDate < new Date())
    return next(new ErrorResponse("Reservation date must be in the future", 400));

  // A03 — whitelist fields, trim strings
  const data = {
    name:           String(name).trim().slice(0, 100),
    email:          String(email).toLowerCase().trim().slice(0, 254),
    phone:          String(phone).trim().slice(0, 20),
    guests:         guestCount,
    date:           reservationDate,
    time:           String(time).trim().slice(0, 10),
    specialRequest: specialRequest ? String(specialRequest).trim().slice(0, 500) : undefined,
  };

  // Attach user ID if logged in
  if (req.user) data.user = req.user.id;

  const reservation = await Reservation.create(data);

  sendEmail({
    to:      reservation.email,
    subject: "Reservation Received — Luxe Restaurant",
    html: `<p>Hi ${reservation.name},</p>
           <p>We have received your table reservation request for 
           <strong>${reservation.guests} guest(s)</strong> on 
           <strong>${new Date(reservation.date).toDateString()}</strong> at 
           <strong>${reservation.time}</strong>. We will confirm shortly.</p>`,
  }).catch((e) => console.error("Reservation email failed:", e.message));

  res.status(201).json({ success: true, data: reservation });
});

// @desc    Get logged-in user's reservation history
// @route   GET /api/reservations/my-reservations
// @access  Private
exports.getMyReservations = asyncHandler(async (req, res) => {
  const reservations = await Reservation.find({ user: req.user.id }).sort("-createdAt");
  res.status(200).json({ success: true, count: reservations.length, data: reservations });
});

// @desc    Get all reservations (admin)
// @route   GET /api/reservations
// @access  Private/Admin
exports.getAllReservations = asyncHandler(async (req, res) => {
  const features = new APIFeatures(Reservation.find(), req.query).filter().sort().paginate();
  const reservations = await features.query;
  const total = await Reservation.countDocuments();
  res.status(200).json({ success: true, count: reservations.length, total, data: reservations });
});

// @desc    Update reservation (admin) — status + tableNumber only
// @route   PUT /api/reservations/:id
// @access  Private/Admin
exports.updateReservation = asyncHandler(async (req, res, next) => {
  // A03 — only allow safe admin fields
  const updates = {};
  if (req.body.status) {
    if (!VALID_STATUSES.includes(req.body.status))
      return next(new ErrorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400));
    updates.status = req.body.status;
  }
  if (req.body.tableNumber !== undefined) {
    updates.tableNumber = String(req.body.tableNumber).trim().slice(0, 20);
  }

  const reservation = await Reservation.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!reservation) return next(new ErrorResponse("Reservation not found", 404));

  if (updates.status) {
    sendEmail({
      to:      reservation.email,
      subject: `Reservation ${updates.status} — Luxe Restaurant`,
      html: `<p>Hi ${reservation.name},</p>
             <p>Your reservation for 
             <strong>${new Date(reservation.date).toDateString()}</strong> at 
             <strong>${reservation.time}</strong> has been 
             <strong>${updates.status}</strong>.</p>`,
    }).catch((e) => console.error("Reservation update email failed:", e.message));
  }

  res.status(200).json({ success: true, data: reservation });
});

// @desc    Cancel reservation (customer owns it or admin)
// @route   DELETE /api/reservations/:id
// @access  Private
exports.cancelReservation = asyncHandler(async (req, res, next) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) return next(new ErrorResponse("Reservation not found", 404));

  // A01 — ownership check: customer can only cancel their own reservations
  if (
    req.user.role === "customer" &&
    reservation.user?.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to cancel this reservation", 403));
  }

  // Prevent cancelling already-completed reservations
  if (reservation.status === "Completed")
    return next(new ErrorResponse("Cannot cancel a completed reservation", 400));

  reservation.status = "Cancelled";
  await reservation.save();
  res.status(200).json({ success: true, data: reservation });
});
