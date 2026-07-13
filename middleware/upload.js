/**
 * upload.js — Cloudinary-backed Multer middleware
 *
 * ROOT CAUSE OF VERCEL UPLOAD FAILURE:
 *
 *   multer.diskStorage() writes files to the local filesystem.
 *   Vercel Serverless Functions run in a READ-ONLY container.
 *   The ONLY writable path is /tmp, which:
 *     1. Is limited to ~512 MB
 *     2. Is WIPED between invocations (ephemeral)
 *     3. Is NOT publicly accessible — /uploads cannot be served as static files
 *
 *   So even if Multer writes to /tmp successfully:
 *     - The file disappears after the function ends
 *     - The /uploads URL returns 404 on every subsequent request
 *     - On a DIFFERENT Vercel instance the file was never there
 *
 * THE FIX:
 *   Replace diskStorage with multer-storage-cloudinary.
 *   Files are streamed directly from the request → Cloudinary CDN.
 *   No filesystem write at all — works perfectly on Vercel.
 *   Returns a permanent, publicly accessible HTTPS URL.
 *
 * SECURITY:
 *   - MIME type validated (image only)
 *   - Extension allowlisted
 *   - 5 MB size limit
 *   - Files namespaced under /luxe-restaurant/ folder on Cloudinary
 */

const multer     = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const path = require("path");

// ── Configure Cloudinary ───────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Cloudinary storage engine ──────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    return {
      folder:         "luxe-restaurant",   // all images grouped in one folder
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
      // Random public_id so filenames are unguessable
      public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  },
});

// ── MIME + extension allowlist ─────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.has(file.mimetype))
    return cb(new Error("Invalid file type. Only JPEG, PNG, WebP and GIF are allowed."), false);
  if (!ALLOWED_EXT.has(ext))
    return cb(new Error("Invalid file extension."), false);
  cb(null, true);
};

// ── Export configured Multer instance ─────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files:    10,
    fields:   20,
  },
});

module.exports = upload;
