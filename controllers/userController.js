const User = require("../models/User");
const asyncHandler = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");

// @desc    Update own profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  // A03/A08 — Mass-assignment protection: only pick explicitly allowed fields
  const allowed = ["name", "phone", "avatar"];
  const updates = {};
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  // Sanitize string fields — trim and cap length
  if (updates.name)   updates.name  = String(updates.name).trim().slice(0, 100);
  if (updates.phone)  updates.phone = String(updates.phone).trim().slice(0, 20);
  if (updates.avatar) updates.avatar = String(updates.avatar).trim().slice(0, 500);

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  });
  res.status(200).json({ success: true, data: user });
});

// @desc    Add address
// @route   POST /api/users/addresses
// @access  Private
exports.addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  user.addresses.push(req.body);
  await user.save();
  res.status(201).json({ success: true, data: user.addresses });
});

// @desc    Update address
// @route   PUT /api/users/addresses/:addressId
// @access  Private
exports.updateAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) return next(new ErrorResponse("Address not found", 404));
  Object.assign(address, req.body);
  await user.save();
  res.status(200).json({ success: true, data: user.addresses });
});

// @desc    Delete address
// @route   DELETE /api/users/addresses/:addressId
// @access  Private
exports.deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  user.addresses = user.addresses.filter((a) => a._id.toString() !== req.params.addressId);
  await user.save();
  res.status(200).json({ success: true, data: user.addresses });
});

// @desc    Toggle wishlist item
// @route   POST /api/users/wishlist/:menuItemId
// @access  Private
exports.toggleWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const idx = user.wishlist.findIndex((id) => id.toString() === req.params.menuItemId);
  if (idx > -1) user.wishlist.splice(idx, 1);
  else user.wishlist.push(req.params.menuItemId);
  await user.save();
  res.status(200).json({ success: true, data: user.wishlist });
});

// @desc    Get wishlist
// @route   GET /api/users/wishlist
// @access  Private
exports.getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate("wishlist");
  res.status(200).json({ success: true, data: user.wishlist });
});

// ==================== ADMIN ====================

// @desc    Get all customers (admin)
// @route   GET /api/users
// @access  Private/Admin
exports.getAllUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  const users = await User.find(filter).sort("-createdAt");
  res.status(200).json({ success: true, count: users.length, data: users });
});

// @desc    Get single user (admin)
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ErrorResponse("User not found", 404));
  res.status(200).json({ success: true, data: user });
});

// @desc    Update user (admin) - role, active status, permissions
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  // A01 – Broken Access Control: only allow admins to change role/permissions/active
  const allowed = ["role", "isActive", "permissions", "name", "phone"];
  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  // Prevent admin from accidentally (or maliciously) promoting to god-role
  const validRoles = ["customer", "admin", "employee"];
  if (updates.role && !validRoles.includes(updates.role)) {
    return next(new ErrorResponse("Invalid role specified", 400));
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!user) return next(new ErrorResponse("User not found", 404));
  res.status(200).json({ success: true, data: user });
});

// @desc    Delete user (admin)
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return next(new ErrorResponse("User not found", 404));
  res.status(200).json({ success: true, data: {} });
});
