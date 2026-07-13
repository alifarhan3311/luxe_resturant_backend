/**
 * categoryController — OWASP A03
 *
 * Fixes applied:
 *  - create/update: only whitelisted fields from req.body (no mass-assignment)
 *  - String fields trimmed and length-capped
 *  - sortOrder validated as integer
 */
const Category      = require("../models/Category");
const asyncHandler  = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");

// @desc    Get all active categories
// @route   GET /api/categories
// @access  Public
exports.getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort("sortOrder name");
  res.status(200).json({ success: true, count: categories.length, data: categories });
});

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Public
exports.getCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);
  if (!category) return next(new ErrorResponse("Category not found", 404));
  res.status(200).json({ success: true, data: category });
});

// @desc    Create category
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = asyncHandler(async (req, res, next) => {
  const { name, description, image, sortOrder, isActive } = req.body;

  if (!name || String(name).trim().length === 0)
    return next(new ErrorResponse("Category name is required", 400));

  const category = await Category.create({
    name:        String(name).trim().slice(0, 100),
    description: description ? String(description).trim().slice(0, 500) : undefined,
    image:       image ? String(image).trim().slice(0, 500) : undefined,
    sortOrder:   sortOrder !== undefined ? parseInt(sortOrder, 10) || 0 : 0,
    isActive:    isActive !== undefined ? Boolean(isActive) : true,
  });

  res.status(201).json({ success: true, data: category });
});

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = asyncHandler(async (req, res, next) => {
  // A03 — whitelist updatable fields
  const updates = {};
  if (req.body.name        !== undefined) updates.name        = String(req.body.name).trim().slice(0, 100);
  if (req.body.description !== undefined) updates.description = String(req.body.description).trim().slice(0, 500);
  if (req.body.image       !== undefined) updates.image       = String(req.body.image).trim().slice(0, 500);
  if (req.body.sortOrder   !== undefined) updates.sortOrder   = parseInt(req.body.sortOrder, 10) || 0;
  if (req.body.isActive    !== undefined) updates.isActive    = Boolean(req.body.isActive);

  const category = await Category.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!category) return next(new ErrorResponse("Category not found", 404));
  res.status(200).json({ success: true, data: category });
});

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return next(new ErrorResponse("Category not found", 404));
  res.status(200).json({ success: true, data: {} });
});
