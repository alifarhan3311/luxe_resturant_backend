const express = require("express");
const router = express.Router();
const {
  createReservation,
  getMyReservations,
  getAllReservations,
  updateReservation,
  cancelReservation,
} = require("../controllers/reservationController");
const { protect, authorize } = require("../middleware/auth");

// Optional auth: attach user if token present, but don't block guests
const optionalAuth = (req, res, next) => {
  const { protect: protectFn } = require("../middleware/auth");
  if (req.headers.authorization || req.cookies?.token) {
    return protectFn(req, res, next);
  }
  next();
};

router.post("/", optionalAuth, createReservation);
router.get("/my-reservations", protect, getMyReservations);
router.get("/", protect, authorize("admin", "employee"), getAllReservations);
router.put("/:id", protect, authorize("admin", "employee"), updateReservation);
router.delete("/:id", protect, cancelReservation);

module.exports = router;
