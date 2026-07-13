const express = require("express");
const router = express.Router();
const {
  signup,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  updatePassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.get("/logout", logout);
router.get("/me", protect, getMe);
router.post("/forgot-password", authLimiter, forgotPassword);
router.put("/reset-password/:resettoken", resetPassword);
router.put("/update-password", protect, updatePassword);

module.exports = router;
