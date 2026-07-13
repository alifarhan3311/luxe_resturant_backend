const express = require("express");
const router = express.Router();
const { getSettings, updateSettings } = require("../controllers/settingsController");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimiter");

router.get("/", getSettings);
router.put(
  "/",
  protect,
  authorize("admin"),
  uploadLimiter,
  upload.fields([{ name: "logo", maxCount: 1 }, { name: "favicon", maxCount: 1 }]),
  (req, res, next) => {
    // Cloudinary returns full HTTPS URL in req.files[field][0].path
    if (req.files?.logo)    req.body.logo    = req.files.logo[0].path;
    if (req.files?.favicon) req.body.favicon = req.files.favicon[0].path;
    next();
  },
  updateSettings
);

module.exports = router;
