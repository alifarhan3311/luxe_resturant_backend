const Coupon = require("../models/Coupon");
const asyncHandler = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");

// @desc    Validate coupon (used at checkout)
// @route   POST /api/coupons/validate
// @access  Private
exports.validateCoupon = asyncHandler(async (req, res, next) => {
  const { code, subtotal } = req.body;
  const coupon = await Coupon.findOne({ code: code?.toUpperCase(), isActive: true });

  if (!coupon) return next(new ErrorResponse("Invalid coupon code", 404));
  if (coupon.expiresAt < Date.now()) return next(new ErrorResponse("Coupon has expired", 400));
  if (coupon.usedCount >= coupon.usageLimit) return next(new ErrorResponse("Coupon usage limit reached", 400));
  if (subtotal < coupon.minOrderAmount)
    return next(new ErrorResponse(`Minimum order amount is Rs. ${coupon.minOrderAmount}`, 400));

  let discount =
    coupon.discountType === "percentage" ? (subtotal * coupon.discountValue) / 100 : coupon.discountValue;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

  res.status(200).json({ success: true, data: { code: coupon.code, discount } });
});

// @desc    Get all coupons (admin)
// @route   GET /api/coupons
// @access  Private/Admin
exports.getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort("-createdAt");
  res.status(200).json({ success: true, count: coupons.length, data: coupons });
});

// @desc    Create coupon
// @route   POST /api/coupons
// @access  Private/Admin
exports.createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json({ success: true, data: coupon });
});

// @desc    Update coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
exports.updateCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!coupon) return next(new ErrorResponse("Coupon not found", 404));
  res.status(200).json({ success: true, data: coupon });
});

// @desc    Delete coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
exports.deleteCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return next(new ErrorResponse("Coupon not found", 404));
  res.status(200).json({ success: true, data: {} });
});
