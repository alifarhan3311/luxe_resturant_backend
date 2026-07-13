const express = require("express");
const router = express.Router();
const {
  getGallery,
  uploadGalleryImages,
  deleteGalleryImage,
} = require("../controllers/galleryController");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimiter");

router.get("/", getGallery);
router.post("/", protect, authorize("admin"), uploadLimiter, upload.array("images", 10), uploadGalleryImages);
router.delete("/:id", protect, authorize("admin"), deleteGalleryImage);

module.exports = router;
