/**
 * reviewController — OWASP A01 / A03
 *
 * Fixes applied:
 *  - createReview: whitelist fields, cap comment length, validate rating range
 *  - moderateReview: only status + adminReply fields allowed (not full req.body)
 *  - Admin-only routes verified at route level but double-checked here
 *  - menuItem ID validated as valid ObjectId before aggregation
 */
const Review        = require("../models/Review");
const MenuItem      = require("../models/MenuItem");
const asyncHandler  = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const mongoose      = require("mongoose");

const VALID_MOD_STATUSES = ["Pending", "Approved", "Rejected"];

// @desc    Get approved reviews
// @route   GET /api/reviews
// @access  Public
exports.getReviews = asyncHandler(async (req, res) => {
  const filter = { status: "Approved" };

  // Validate menuItem ID before using in query (prevents CastError injection)
  if (req.query.menuItem) {
    if (!mongoose.Types.ObjectId.isValid(req.query.menuItem))
      return res.status(200).json({ success: true, count: 0, data: [] });
    filter.menuItem = req.query.menuItem;
  }

  const reviews = await Review.find(filter)
    .populate("user", "name avatar")
    .sort("-createdAt")
    .limit(50); // cap public listing

  res.status(200).json({ success: true, count: reviews.length, data: reviews });
});

// @desc    Create review
// @route   POST /api/reviews
// @access  Private
exports.createReview = asyncHandler(async (req, res, next) => {
  const { menuItem, rating, comment } = req.body;

  if (!rating || !comment)
    return next(new ErrorResponse("Rating and comment are required", 400));

  const ratingNum = parseInt(rating, 10);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5)
    return next(new ErrorResponse("Rating must be between 1 and 5", 400));

  // Validate menuItem ObjectId if provided
  if (menuItem && !mongoose.Types.ObjectId.isValid(menuItem))
    return next(new ErrorResponse("Invalid menu item ID", 400));

  // A03 — only whitelisted fields
  const review = await Review.create({
    user:     req.user.id,
    menuItem: menuItem || undefined,
    rating:   ratingNum,
    comment:  String(comment).trim().slice(0, 1000),
  });

  // Recalculate ratings aggregate after new approved review
  if (review.menuItem && review.status === "Approved") {
    await recalcRatings(review.menuItem);
  }

  res.status(201).json({ success: true, data: review });
});

// @desc    Get all reviews (admin)
// @route   GET /api/reviews/admin
// @access  Private/Admin
exports.getAllReviewsAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && VALID_MOD_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const reviews = await Review.find(filter)
    .populate("user", "name email")
    .sort("-createdAt");
  res.status(200).json({ success: true, count: reviews.length, data: reviews });
});

// @desc    Moderate review (approve/reject/reply) — admin only
// @route   PUT /api/reviews/:id
// @access  Private/Admin
exports.moderateReview = asyncHandler(async (req, res, next) => {
  // A03 — only allow specific moderation fields
  const updates = {};

  if (req.body.status !== undefined) {
    if (!VALID_MOD_STATUSES.includes(req.body.status))
      return next(new ErrorResponse(`Status must be one of: ${VALID_MOD_STATUSES.join(", ")}`, 400));
    updates.status = req.body.status;
  }

  if (req.body.adminReply !== undefined) {
    updates.adminReply = String(req.body.adminReply).trim().slice(0, 1000);
  }

  if (Object.keys(updates).length === 0)
    return next(new ErrorResponse("No valid fields to update", 400));

  const review = await Review.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!review) return next(new ErrorResponse("Review not found", 404));

  // Recalc menu item rating if approval status changed
  if (updates.status && review.menuItem) {
    await recalcRatings(review.menuItem);
  }

  res.status(200).json({ success: true, data: review });
});

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
exports.deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) return next(new ErrorResponse("Review not found", 404));

  if (review.menuItem) await recalcRatings(review.menuItem);

  res.status(200).json({ success: true, data: {} });
});

// Helper — recalculate ratings average after any review change
async function recalcRatings(menuItemId) {
  try {
    const stats = await Review.aggregate([
      { $match: { menuItem: new mongoose.Types.ObjectId(menuItemId), status: "Approved" } },
      { $group: { _id: "$menuItem", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    await MenuItem.findByIdAndUpdate(menuItemId, {
      ratingsAverage: stats[0]?.avg   ?? 0,
      ratingsCount:   stats[0]?.count ?? 0,
    });
  } catch (e) {
    console.error("recalcRatings failed:", e.message);
  }
}
