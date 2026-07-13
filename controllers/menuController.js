const MenuItem = require("../models/MenuItem");
const asyncHandler = require("../middleware/asyncHandler");
const ErrorResponse = require("../utils/ErrorResponse");
const APIFeatures = require("../utils/apiFeatures");

// @desc    Get all menu items (search, filter, sort, paginate)
// @route   GET /api/menu
// @access  Public
exports.getMenuItems = asyncHandler(async (req, res) => {
  let query = MenuItem.find().populate("category", "name slug");

  const features = new APIFeatures(query, req.query)
    .search(["name", "description"])
    .filter()
    .sort()
    .limitFields();

  const totalQuery = new APIFeatures(MenuItem.find(), req.query)
    .search(["name", "description"])
    .filter();
  const total = await totalQuery.query.countDocuments();

  features.paginate();
  const items = await features.query;

  res.status(200).json({
    success: true,
    count: items.length,
    total,
    page: features.pagination.page,
    pages: Math.ceil(total / features.pagination.limit),
    data: items,
  });
});

// @desc    Get single menu item
// @route   GET /api/menu/:id
// @access  Public
exports.getMenuItem = asyncHandler(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.id).populate("category", "name slug");
  if (!item) return next(new ErrorResponse("Menu item not found", 404));
  res.status(200).json({ success: true, data: item });
});

// @desc    Get featured dishes
// @route   GET /api/menu/featured
// @access  Public
exports.getFeaturedItems = asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ isFeatured: true, isAvailable: true })
    .populate("category", "name slug")
    .limit(8);
  res.status(200).json({ success: true, count: items.length, data: items });
});

// @desc    Get chef specials
// @route   GET /api/menu/chef-specials
// @access  Public
exports.getChefSpecials = asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ isChefSpecial: true, isAvailable: true })
    .populate("category", "name slug")
    .limit(6);
  res.status(200).json({ success: true, count: items.length, data: items });
});

// @desc    Create menu item
// @route   POST /api/menu
// @access  Private/Admin
exports.createMenuItem = asyncHandler(async (req, res, next) => {
  // Cloudinary: req.files[].path = full HTTPS URL
  // Local dev with diskStorage: req.files[].path = local filesystem path
  if (req.files && req.files.length) {
    req.body.images = req.files.map((f) => f.path);
  }

  // A03 — whitelist fields to prevent mass-assignment
  const {
    name, description, category, price, discountPrice,
    images, ingredients, calories, spiceLevel,
    isVeg, isAvailable, isFeatured, isChefSpecial,
  } = req.body;

  if (!name || !description || !category || !price)
    return next(new ErrorResponse("Name, description, category and price are required", 400));

  const item = await MenuItem.create({
    name:          String(name).trim().slice(0, 200),
    description:   String(description).trim().slice(0, 2000),
    category,
    price:         parseFloat(price),
    discountPrice: discountPrice ? parseFloat(discountPrice) : undefined,
    images:        images || [],
    ingredients:   Array.isArray(ingredients)
                     ? ingredients.map((i) => String(i).trim().slice(0, 100))
                     : [],
    calories:      calories ? parseInt(calories, 10) : undefined,
    spiceLevel:    ["Mild","Medium","Hot","Extra Hot"].includes(spiceLevel) ? spiceLevel : undefined,
    isVeg:         isVeg === true || isVeg === "true",
    isAvailable:   isAvailable !== false && isAvailable !== "false",
    isFeatured:    isFeatured === true || isFeatured === "true",
    isChefSpecial: isChefSpecial === true || isChefSpecial === "true",
  });

  res.status(201).json({ success: true, data: item });
});

// @desc    Update menu item
// @route   PUT /api/menu/:id
// @access  Private/Admin
exports.updateMenuItem = asyncHandler(async (req, res, next) => {
  if (req.files && req.files.length) {
    req.body.images = req.files.map((f) => f.path);
  }

  // A03 — whitelist updatable fields
  const allowed = [
    "name","description","category","price","discountPrice",
    "images","ingredients","calories","spiceLevel",
    "isVeg","isAvailable","isFeatured","isChefSpecial",
  ];
  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  // Sanitise types
  if (updates.price)        updates.price        = parseFloat(updates.price);
  if (updates.discountPrice) updates.discountPrice = parseFloat(updates.discountPrice);
  if (updates.calories)     updates.calories     = parseInt(updates.calories, 10);
  if (updates.name)         updates.name         = String(updates.name).trim().slice(0, 200);
  if (updates.description)  updates.description  = String(updates.description).trim().slice(0, 2000);
  if (updates.spiceLevel && !["Mild","Medium","Hot","Extra Hot"].includes(updates.spiceLevel)) {
    delete updates.spiceLevel;
  }
  if (updates.ingredients && Array.isArray(updates.ingredients)) {
    updates.ingredients = updates.ingredients.map((i) => String(i).trim().slice(0, 100));
  }

  const item = await MenuItem.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!item) return next(new ErrorResponse("Menu item not found", 404));
  res.status(200).json({ success: true, data: item });
});

// @desc    Delete menu item
// @route   DELETE /api/menu/:id
// @access  Private/Admin
exports.deleteMenuItem = asyncHandler(async (req, res, next) => {
  const item = await MenuItem.findByIdAndDelete(req.params.id);
  if (!item) return next(new ErrorResponse("Menu item not found", 404));
  res.status(200).json({ success: true, data: {} });
});

// @desc    Toggle availability
// @route   PATCH /api/menu/:id/availability
// @access  Private/Admin
exports.toggleAvailability = asyncHandler(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) return next(new ErrorResponse("Menu item not found", 404));
  item.isAvailable = !item.isAvailable;
  await item.save();
  res.status(200).json({ success: true, data: item });
});

// @desc    Toggle featured
// @route   PATCH /api/menu/:id/featured
// @access  Private/Admin
exports.toggleFeatured = asyncHandler(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.id);
  if (!item) return next(new ErrorResponse("Menu item not found", 404));
  item.isFeatured = !item.isFeatured;
  await item.save();
  res.status(200).json({ success: true, data: item });
});
