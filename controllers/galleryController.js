const Gallery = require("../models/Gallery");
const asyncHandler = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");

// @desc    Get all gallery images
// @route   GET /api/gallery
// @access  Public
exports.getGallery = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  const images = await Gallery.find(filter).sort("-createdAt");
  res.status(200).json({ success: true, count: images.length, data: images });
});

// @desc    Upload gallery image(s)
// @route   POST /api/gallery
// @access  Private/Admin
exports.uploadGalleryImages = asyncHandler(async (req, res, next) => {
  if (!req.files || !req.files.length) return next(new ErrorResponse("No images uploaded", 400));

  const docs = await Gallery.insertMany(
    req.files.map((f) => ({
      title: req.body.title || "",
      category: req.body.category || "General",
      image: `/uploads/${f.filename}`,
    }))
  );

  res.status(201).json({ success: true, data: docs });
});

// @desc    Delete gallery image
// @route   DELETE /api/gallery/:id
// @access  Private/Admin
exports.deleteGalleryImage = asyncHandler(async (req, res, next) => {
  const image = await Gallery.findByIdAndDelete(req.params.id);
  if (!image) return next(new ErrorResponse("Image not found", 404));
  res.status(200).json({ success: true, data: {} });
});
