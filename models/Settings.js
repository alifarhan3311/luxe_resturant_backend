const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    restaurantName: { type: String, default: "Luxe Restaurant" },
    logo: String,
    favicon: String,
    email: String,
    phone: String,
    address: String,
    openingHours: [
      {
        day: String,
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
    ],
    deliveryCharge: { type: Number, default: 150 },
    taxPercent: { type: Number, default: 5 },
    socialLinks: {
      facebook: String,
      instagram: String,
      twitter: String,
      whatsapp: String,
    },
    mapEmbedUrl: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
