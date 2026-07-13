const Settings = require("../models/Settings");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get restaurant settings (public - hours, contact, socials)
// @route   GET /api/settings
// @access  Public
exports.getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  res.status(200).json({ success: true, data: settings });
});

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private/Admin
exports.updateSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create(req.body);
  } else {
    settings = await Settings.findByIdAndUpdate(settings._id, req.body, {
      new: true,
      runValidators: true,
    });
  }
  res.status(200).json({ success: true, data: settings });
});
