const express = require("express");
const router = express.Router();
const {
  getReviews,
  createReview,
  getAllReviewsAdmin,
  moderateReview,
  deleteReview,
} = require("../controllers/reviewController");
const { protect, authorize } = require("../middleware/auth");

router.get("/", getReviews);
router.post("/", protect, createReview);
router.get("/admin", protect, authorize("admin"), getAllReviewsAdmin);
router.put("/:id", protect, authorize("admin"), moderateReview);
router.delete("/:id", protect, authorize("admin"), deleteReview);

module.exports = router;
