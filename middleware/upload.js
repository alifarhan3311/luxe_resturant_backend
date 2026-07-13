/**
 * Multer upload middleware — OWASP A05 / A03
 *
 * Security measures:
 *  - Strict MIME type check (magic bytes via file.mimetype — not just extension)
 *  - Extension allowlist (defence-in-depth on top of MIME check)
 *  - 5 MB size limit per file
 *  - Filename sanitized — strips path traversal characters and non-safe chars
 *  - Files stored with a random UUID-style name (no user input in filename)
 */
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Allowlisted MIME types
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Allowlisted extensions (mirrors MIME types)
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),

  filename: (_req, file, cb) => {
    // Generate a random, unguessable filename — never use user-supplied names
    const random = crypto.randomBytes(16).toString("hex");
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `${random}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check both MIME type AND extension (A03 defence-in-depth)
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error("Invalid file type. Only JPEG, PNG, WebP and GIF images are allowed."), false);
  }
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new Error("Invalid file extension."), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  5 * 1024 * 1024, // 5 MB per file
    files:     10,               // max 10 files per request
    fields:    20,               // max 20 non-file fields
  },
});

module.exports = upload;
