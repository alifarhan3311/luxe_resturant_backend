const Order = require("../models/Order");
const MenuItem = require("../models/MenuItem");
const Coupon = require("../models/Coupon");
const Settings = require("../models/Settings");
const asyncHandler = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const APIFeatures = require("../utils/apiFeatures");
const sendEmail = require("../utils/sendEmail");
const Stripe = require("stripe");

// Lazy-init Stripe so missing key doesn't crash the whole server on startup
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("xxxx")) {
    throw new Error("Stripe secret key not configured in .env");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
};

// @desc    Create order (checkout)
// @route   POST /api/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { items, address, orderType, paymentMethod, couponCode, notes } = req.body;

  if (!items || !items.length) return next(new ErrorResponse("Order must contain at least one item", 400));

  // Recalculate prices server-side (never trust client totals)
  let subtotal = 0;
  const orderItems = [];
  for (const it of items) {
    const menuItem = await MenuItem.findById(it.menuItem);
    if (!menuItem || !menuItem.isAvailable) {
      return next(new ErrorResponse(`Item unavailable: ${it.menuItem}`, 400));
    }
    const price = menuItem.discountPrice || menuItem.price;
    subtotal += price * it.quantity;
    orderItems.push({
      menuItem: menuItem._id,
      name: menuItem.name,
      image: menuItem.images?.[0] || "",
      price,
      quantity: it.quantity,
    });
    menuItem.orderCount += it.quantity;
    await menuItem.save();
  }

  const settings = (await Settings.findOne()) || {};
  const taxPercent = settings.taxPercent ?? Number(process.env.DEFAULT_TAX_PERCENT || 5);
  const deliveryCharge =
    orderType === "pickup" ? 0 : settings.deliveryCharge ?? Number(process.env.DEFAULT_DELIVERY_CHARGE || 150);

  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (coupon && coupon.expiresAt > Date.now() && coupon.usedCount < coupon.usageLimit && subtotal >= coupon.minOrderAmount) {
      discount =
        coupon.discountType === "percentage"
          ? (subtotal * coupon.discountValue) / 100
          : coupon.discountValue;
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
      coupon.usedCount += 1;
      await coupon.save();
    }
  }

  const tax = ((subtotal - discount) * taxPercent) / 100;
  const total = Math.max(0, subtotal - discount + tax + deliveryCharge);

  const order = await Order.create({
    user: req.user.id,
    items: orderItems,
    subtotal,
    tax,
    deliveryCharge,
    discount,
    couponCode: couponCode || undefined,
    total,
    address,
    orderType,
    paymentMethod,
    notes,
  });

  // Fire-and-forget confirmation email
  sendEmail({
    to: req.user.email,
    subject: `Order Confirmed - ${order.orderNumber}`,
    html: `<p>Hi ${req.user.name},</p><p>Your order <b>${order.orderNumber}</b> has been placed successfully. Total: Rs. ${total.toFixed(2)}</p>`,
  }).catch((e) => console.error("Order email failed:", e.message));

  res.status(201).json({ success: true, data: order });
});

// @desc    Get logged-in user's orders
// @route   GET /api/orders/my-orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort("-createdAt");
  res.status(200).json({ success: true, count: orders.length, data: orders });
});

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate("user", "name email phone");
  if (!order) return next(new ErrorResponse("Order not found", 404));

  if (order.user._id.toString() !== req.user.id && req.user.role === "customer") {
    return next(new ErrorResponse("Not authorized to view this order", 403));
  }

  res.status(200).json({ success: true, data: order });
});

// @desc    Get all orders (admin) - filter by status, search, paginate
// @route   GET /api/orders
// @access  Private/Admin
exports.getAllOrders = asyncHandler(async (req, res) => {
  let query = Order.find().populate("user", "name email phone");
  const features = new APIFeatures(query, req.query).filter().sort().limitFields().paginate();
  const orders = await features.query;
  const total = await Order.countDocuments();
  res.status(200).json({ success: true, count: orders.length, total, data: orders });
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) return next(new ErrorResponse("Order not found", 404));

  order.status = req.body.status;
  await order.save();

  sendEmail({
    to: order.user.email,
    subject: `Order Update - ${order.orderNumber}`,
    html: `<p>Hi ${order.user.name},</p><p>Your order <b>${order.orderNumber}</b> status is now: <b>${order.status}</b></p>`,
  }).catch((e) => console.error("Status email failed:", e.message));

  res.status(200).json({ success: true, data: order });
});

// @desc    Create Stripe PaymentIntent (called before placing stripe order)
// @route   POST /api/orders/create-payment-intent
// @access  Private
exports.createPaymentIntent = asyncHandler(async (req, res, next) => {
  const { items, couponCode, orderType } = req.body;

  if (!items || !items.length) return next(new ErrorResponse("No items provided", 400));

  // Recalculate amount server-side — never trust client
  let subtotal = 0;
  for (const it of items) {
    const menuItem = await MenuItem.findById(it.menuItem);
    if (!menuItem || !menuItem.isAvailable) {
      return next(new ErrorResponse(`Item unavailable: ${it.menuItem}`, 400));
    }
    subtotal += (menuItem.discountPrice || menuItem.price) * it.quantity;
  }

  const settings = (await Settings.findOne()) || {};
  const taxPercent = settings.taxPercent ?? Number(process.env.DEFAULT_TAX_PERCENT || 5);
  const deliveryCharge =
    orderType === "pickup" ? 0 : settings.deliveryCharge ?? Number(process.env.DEFAULT_DELIVERY_CHARGE || 150);

  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (coupon && coupon.expiresAt > Date.now() && coupon.usedCount < coupon.usageLimit && subtotal >= coupon.minOrderAmount) {
      discount = coupon.discountType === "percentage"
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    }
  }

  const tax = ((subtotal - discount) * taxPercent) / 100;
  const total = Math.max(0, subtotal - discount + tax + deliveryCharge);

  // Stripe expects amount in smallest currency unit (paisa for PKR = cents)
  const amountInPaisa = Math.round(total * 100);

  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaisa,
      currency: "pkr",
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user.id,
        couponCode: couponCode || "",
        orderType: orderType || "delivery",
      },
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      amount: total,
    });
  } catch (err) {
    return next(new ErrorResponse(`Stripe error: ${err.message}`, 500));
  }
});
