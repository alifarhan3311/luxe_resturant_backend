const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: String,
    message: { type: String, required: true },
    status: { type: String, enum: ["New", "Read", "Replied"], default: "New" },
    adminReply: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
