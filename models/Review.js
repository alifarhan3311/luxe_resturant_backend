const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    adminReply: String,
  },
  { timestamps: true }
);

reviewSchema.index({ user: 1, menuItem: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Review", reviewSchema);
