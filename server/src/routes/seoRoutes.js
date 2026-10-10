const express = require("express");
const Listing = require("../models/Listing");
const VendorProfile = require("../models/VendorProfile");

const router = express.Router();

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
const CATEGORIES = ["Tutoring", "Home Repair", "Photography", "Events", "Cleaning"];

// XML sitemap of every public page — the homepage, category landing pages,
// each approved vendor and each publicly visible listing. URLs point at the
// website (CLIENT_URL), not this API; the website's robots.txt references
// this file (sitemaps may be cross-submitted via robots.txt).
router.get("/sitemap.xml", async (req, res, next) => {
  try {
    const site = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
    const vendors = await VendorProfile.find({ isVerified: true }).select("_id createdAt").lean();
    const verifiedIds = vendors.map((v) => v._id);
    const listings = await Listing.find({ isActive: true, vendorId: { $in: verifiedIds } }).select("_id createdAt").limit(45000).lean();

    const url = (loc, lastmod, priority) =>
      `<url><loc>${escapeXml(site + loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}<priority>${priority}</priority></url>`;
    const body = [
      url("/", null, "1.0"),
      url("/search", null, "0.8"),
      ...CATEGORIES.map((c) => url(`/search?category=${encodeURIComponent(c)}`, null, "0.8")),
      ...vendors.map((v) => url(`/vendor/${v._id}`, v.createdAt, "0.6")),
      ...listings.map((l) => url(`/listing/${l._id}`, l.createdAt, "0.7")),
    ].join("");

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
