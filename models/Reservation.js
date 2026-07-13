const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    guests: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    specialRequest: String,
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Completed", "Cancelled"],
      default: "Pending",
    },
    tableNumber: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reservation", reservationSchema);
