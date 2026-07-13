/**
 * APIFeatures — secure query builder
 *
 * Security fixes applied:
 *  - A03 NoSQL Injection: filter() strips all MongoDB operator keys ($where,
 *    $expr, nested objects with $-prefixed keys) before querying.
 *  - A03 ReDoS: search() escapes all regex special chars so user input cannot
 *    create a catastrophic-backtracking regex.
 *  - A05 Misconfiguration: sort() and limitFields() use allowlists — only
 *    known safe field names are accepted.
 */

// Allowed sort fields — extend as needed
const ALLOWED_SORT_FIELDS = new Set([
  "createdAt", "-createdAt", "price", "-price",
  "ratingsAverage", "-ratingsAverage", "name", "-name",
  "orderCount", "-orderCount",
]);

// Allowed projection fields
const ALLOWED_FIELDS = new Set([
  "name", "description", "category", "price", "discountPrice",
  "images", "ingredients", "calories", "spiceLevel", "isVeg",
  "isAvailable", "isFeatured", "isChefSpecial", "ratingsAverage",
  "ratingsCount", "slug", "createdAt",
]);

// Escape all regex special characters — prevents ReDoS (OWASP A03)
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Recursively remove any key that starts with '$' or is a plain object
// This is a defence-in-depth layer on top of express-mongo-sanitize (A03)
const stripDollarKeys = (obj) => {
  if (typeof obj !== "object" || obj === null) return obj;
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;                    // drop operator keys
    if (typeof val === "object" && val !== null) {
      const inner = stripDollarKeys(val);
      if (Object.keys(inner).length > 0) clean[key] = inner;
    } else {
      clean[key] = val;
    }
  }
  return clean;
};

class APIFeatures {
  constructor(query, queryString) {
    this.query       = query;
    this.queryString = queryString;
    this.pagination  = { page: 1, limit: 12 };
  }

  // A03 – NoSQL injection safe filter
  filter() {
    const excluded = ["page", "sort", "limit", "fields", "search"];
    const raw = { ...this.queryString };
    excluded.forEach((f) => delete raw[f]);

    // Allow only comparison operators: gte, gt, lte, lt — nothing else
    let queryStr = JSON.stringify(raw);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (m) => `$${m}`);

    let parsed = JSON.parse(queryStr);

    // Defence-in-depth: strip any remaining $-keys (e.g. $where, $ne, $regex)
    parsed = stripDollarKeys(parsed);

    this.query = this.query.find(parsed);
    return this;
  }

  // A03 – ReDoS safe full-text search
  search(fields = []) {
    const raw = this.queryString.search;
    if (raw && typeof raw === "string" && fields.length) {
      // Limit search term length to prevent abuse
      const term = raw.slice(0, 100);
      // Escape ALL regex special chars before constructing the RegExp
      const safe  = escapeRegex(term);
      const regex = new RegExp(safe, "i");
      const orConditions = fields.map((f) => ({ [f]: regex }));
      this.query = this.query.find({ $or: orConditions });
    }
    return this;
  }

  // A03 – Allowlist-based sort (prevents sorting on arbitrary fields)
  sort() {
    if (this.queryString.sort) {
      const requested = this.queryString.sort.split(",").map((s) => s.trim());
      // Only pass through fields in the allowlist
      const safe = requested.filter((s) => ALLOWED_SORT_FIELDS.has(s));
      if (safe.length) {
        this.query = this.query.sort(safe.join(" "));
        return this;
      }
    }
    this.query = this.query.sort("-createdAt");
    return this;
  }

  // A03 – Allowlist-based field projection (prevents leaking sensitive fields)
  limitFields() {
    if (this.queryString.fields) {
      const requested = this.queryString.fields.split(",").map((s) => s.trim());
      const safe = requested.filter((s) => ALLOWED_FIELDS.has(s));
      if (safe.length) {
        this.query = this.query.select(safe.join(" "));
        return this;
      }
    }
    this.query = this.query.select("-__v -__v");
    return this;
  }

  // A04 – Pagination with hard caps to prevent DoS
  paginate() {
    const page  = Math.max(1, parseInt(this.queryString.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(this.queryString.limit, 10) || 12));
    const skip  = (page - 1) * limit;

    this.query      = this.query.skip(skip).limit(limit);
    this.pagination = { page, limit };
    return this;
  }
}

module.exports = APIFeatures;
