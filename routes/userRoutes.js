const express = require("express");
const router = express.Router();
const {
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  toggleWishlist,
  getWishlist,
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimiter");

router.put(
  "/profile",
  protect,
  uploadLimiter,
  upload.single("avatar"),
  (req, res, next) => {
    // Cloudinary returns full HTTPS URL in req.file.path
    if (req.file) req.body.avatar = req.file.path;
    next();
  },
  updateProfile
);
router.post("/addresses", protect, addAddress);
router.put("/addresses/:addressId", protect, updateAddress);
router.delete("/addresses/:addressId", protect, deleteAddress);
router.get("/wishlist", protect, getWishlist);
router.post("/wishlist/:menuItemId", protect, toggleWishlist);

router.get("/", protect, authorize("admin"), getAllUsers);
router.get("/:id", protect, authorize("admin"), getUser);
router.put("/:id", protect, authorize("admin"), updateUser);
router.delete("/:id", protect, authorize("admin"), deleteUser);

module.exports = router;
