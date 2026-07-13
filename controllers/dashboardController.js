const Order = require("../models/Order");
const Reservation = require("../models/Reservation");
const User = require("../models/User");
const MenuItem = require("../models/MenuItem");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get admin dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private/Admin
exports.getStats = asyncHandler(async (req, res) => {
  const [totalOrders, totalRevenueAgg, totalCustomers, totalReservations, pendingOrders, todayOrders] =
    await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      User.countDocuments({ role: "customer" }),
      Reservation.countDocuments(),
      Order.countDocuments({ status: "Pending" }),
      Order.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

  const recentOrders = await Order.find().sort("-createdAt").limit(5).populate("user", "name");

  // Last 7 days revenue trend
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const revenueTrend = await Order.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$total" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // A03 — cap to 5, select only safe fields (never expose PII in aggregations)
  const topDishes = await MenuItem.find()
    .sort("-orderCount")
    .limit(5)
    .select("name orderCount images ratingsAverage");

  res.status(200).json({
    success: true,
    data: {
      totalOrders,
      totalRevenue: totalRevenueAgg[0]?.total || 0,
      totalCustomers,
      totalReservations,
      pendingOrders,
      todayOrders,
      recentOrders,
      revenueTrend,
      topDishes,
    },
  });
});
