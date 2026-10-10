const ApiError = require("./ApiError");

// File links users submit (CNIC photos, portfolio, listing photos, delivered
// work, avatars) must point at our own upload storage. Accepting any URL let
// an applicant submit a "document" that is really a phishing page, which an
// admin would then open from the review drawer.
//
// Trusted: this Cloudinary account, the dev-only local /uploads, and any
// extra hosts in TRUSTED_UPLOAD_HOSTS (comma-separated, e.g. a CDN).
function trustedPrefixes() {
  const prefixes = [];
  if (process.env.CLOUDINARY_CLOUD_NAME) prefixes.push(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`);
  return prefixes;
}

function extraHosts() {
  return (process.env.TRUSTED_UPLOAD_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

function isTrustedUploadUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && process.env.NODE_ENV !== "production")) return false;
  if (trustedPrefixes().some((prefix) => value.startsWith(prefix))) return true;
  // Dev-only local upload fallback (served by this API at /uploads).
  if (process.env.NODE_ENV !== "production" && url.pathname.startsWith("/uploads/") && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return true;
  return extraHosts().some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function assertTrustedUploadUrl(value, what = "File") {
  if (!isTrustedUploadUrl(value)) throw new ApiError(400, `${what} must be uploaded through Goodhand`);
  return value;
}

module.exports = { isTrustedUploadUrl, assertTrustedUploadUrl };
