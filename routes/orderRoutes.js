const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
  createPaymentIntent,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/auth");

// IMPORTANT: specific routes before /:id
router.post("/create-payment-intent", protect, createPaymentIntent);
router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/", protect, authorize("admin", "employee"), getAllOrders);
router.get("/:id", protect, getOrder);
router.put("/:id/status", protect, authorize("admin", "employee"), updateOrderStatus);

module.exports = router;
