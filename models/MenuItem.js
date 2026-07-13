const mongoose = require("mongoose");
const slugify = require("slugify");

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    images: [{ type: String }],
    ingredients: [{ type: String }],
    calories: { type: Number },
    spiceLevel: { type: String, enum: ["Mild", "Medium", "Hot", "Extra Hot"] },
    isVeg: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isChefSpecial: { type: Boolean, default: false },
    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ name: "text", description: "text" });

menuItemSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + "-" + Date.now().toString().slice(-5);
  }
  next();
});

module.exports = mongoose.model("MenuItem", menuItemSchema);
