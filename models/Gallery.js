const mongoose = require("mongoose");

const gallerySchema = new mongoose.Schema(
  {
    title: String,
    image: { type: String, required: true },
    category: { type: String, default: "General" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Gallery", gallerySchema);
