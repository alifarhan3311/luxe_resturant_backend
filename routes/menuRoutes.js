const express = require("express");
const router = express.Router();
const {
  getMenuItems,
  getMenuItem,
  getFeaturedItems,
  getChefSpecials,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
  toggleFeatured,
} = require("../controllers/menuController");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimiter");

router.get("/", getMenuItems);
router.get("/featured", getFeaturedItems);
router.get("/chef-specials", getChefSpecials);
router.get("/:id", getMenuItem);

router.post("/", protect, authorize("admin"), uploadLimiter, upload.array("images", 5), createMenuItem);
router.put("/:id", protect, authorize("admin"), uploadLimiter, upload.array("images", 5), updateMenuItem);
router.delete("/:id", protect, authorize("admin"), deleteMenuItem);
router.patch("/:id/availability", protect, authorize("admin"), toggleAvailability);
router.patch("/:id/featured", protect, authorize("admin"), toggleFeatured);

module.exports = router;
