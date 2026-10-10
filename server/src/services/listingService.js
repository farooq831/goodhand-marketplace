const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const VendorProfile = require("../models/VendorProfile");
const Booking = require("../models/Booking");
const ApiError = require("../utils/ApiError");
const { toUtcDay, blockingEntry } = require("../utils/timeOff");
const { denormFrom } = require("./listingSync");
const { isTrustedUploadUrl } = require("../utils/trustedUrl");

// New photos must come from our storage; ones already on the listing
// (e.g. older or seeded data) may be kept as they are.
function assertPhotos(photos, existing = []) {
  if (photos === undefined) return;
  if (!Array.isArray(photos) || photos.length > 10) throw new ApiError(400, "Up to 10 photos per listing");
  if (!photos.every((url) => existing.includes(url) || isTrustedUploadUrl(url))) throw new ApiError(400, "Photos must be uploaded through Goodhand");
}
const { generateSlotsForWindow, doRangesOverlap } = require("../utils/timeSlots");

const WRITABLE_FIELDS = [
  "title",
  "description",
  "category",
  "price",
  "durationMinutes",
  "photos",
  "availabilityRules",
  "serviceLocation",
];

async function createListing(vendorProfile, data) {
  const { title, category, price, durationMinutes } = data;
  if (!title || !category || price == null || durationMinutes == null) {
    throw new ApiError(400, "title, category, price, and durationMinutes are required");
  }

  assertPhotos(data.photos);
  const { set } = denormFrom(vendorProfile);
  const payload = { vendorId: vendorProfile._id, ...set };
  for (const field of WRITABLE_FIELDS) {
    if (data[field] !== undefined) payload[field] = data[field];
  }

  return Listing.create(payload);
}

const PUBLIC_VENDOR_FIELDS = "userId businessName avgRating reviewCount isVerified serviceArea.city trustScore";
// Vendor fields shown on listing cards in search results.
const LIST_VENDOR_FIELDS = "businessName avgRating reviewCount serviceArea.city trustScore";

// Public listing pages are visible once the listing is active AND its
// vendor is verified; the owner (or an admin) can always see it — e.g.
// to preview a listing while still awaiting verification.
async function getListingForOwnerOrPublic(id, requester) {
  const listing = await Listing.findById(id).populate("vendorId", PUBLIC_VENDOR_FIELDS);
  if (!listing) throw new ApiError(404, "Listing not found");

  const isOwner = requester && String(listing.vendorId.userId) === String(requester.id);
  const isPubliclyVisible = listing.isActive && listing.vendorId.isVerified;

  if (!isPubliclyVisible && !isOwner && requester?.role !== "admin") {
    throw new ApiError(404, "Listing not found");
  }

  // Vendor analytics: count views by anyone but the owner. Fire-and-forget
  // atomic increment — never slows down or fails the page.
  if (!isOwner && requester?.role !== "admin") {
    Listing.updateOne({ _id: listing._id }, { $inc: { views: 1 } }).catch(() => {});
  }

  return listing;
}

// --- Admin moderation & featured placements -------------------------------

async function adminListListings({ q, status, page = 1, limit = 25 } = {}) {
  const filter = {};
  if (status === "hidden") filter["moderation.hidden"] = true;
  else if (status === "featured") filter.featuredUntil = { $gt: new Date() };
  else if (status === "active") filter.isActive = true;
  if (typeof q === "string" && q.trim()) filter.title = new RegExp(escapeRegex(q.trim()), "i");
  const size = Math.min(100, Math.max(1, Number(limit) || 25));
  const pageNum = Math.max(1, Number(page) || 1);
  const [listings, total] = await Promise.all([
    Listing.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * size).limit(size).populate("vendorId", "businessName isVerified trustScore userId"),
    Listing.countDocuments(filter),
  ]);
  return { listings, total, page: pageNum, limit: size };
}

async function moderateListing(admin, id, { action, reason = "", days } = {}) {
  const listing = await Listing.findById(id).populate("vendorId", "userId businessName");
  if (!listing) throw new ApiError(404, "Listing not found");
  const note = String(reason || "").trim();

  if (action === "hide") {
    if (!note) throw new ApiError(400, "Give the vendor a reason for hiding this listing");
    listing.isActive = false;
    listing.featuredUntil = null;
    listing.moderation = { hidden: true, reason: note, at: new Date(), by: admin.id };
  } else if (action === "unhide") {
    listing.isActive = true;
    listing.moderation = { hidden: false, reason: "", at: new Date(), by: admin.id };
  } else if (action === "feature") {
    const n = Number(days);
    if (![7, 14, 30, 90].includes(n)) throw new ApiError(400, "Feature for 7, 14, 30 or 90 days");
    if (!listing.isActive) throw new ApiError(400, "Only active listings can be featured");
    // Extending an active placement adds to its end date.
    const from = listing.featuredUntil && listing.featuredUntil > new Date() ? listing.featuredUntil : new Date();
    listing.featuredUntil = new Date(from.getTime() + n * 24 * 60 * 60 * 1000);
  } else if (action === "unfeature") {
    listing.featuredUntil = null;
  } else {
    throw new ApiError(400, "Unknown moderation action");
  }
  await listing.save();

  if (action === "hide" || action === "unhide") {
    const notificationService = require("./notificationService");
    await notificationService
      .createNotification(listing.vendorId.userId, action === "hide" ? "listing_hidden" : "listing_restored", { listingId: listing._id, title: listing.title, reason: note })
      .catch((err) => console.error("Notification failed:", err.message));
  }
  return listing;
}

async function updateListing(id, requester, updates) {
  const listing = await Listing.findById(id).populate("vendorId", "userId");
  if (!listing) throw new ApiError(404, "Listing not found");
  assertListingOwnerOrAdmin(listing, requester);
  assertPhotos(updates.photos, listing.photos);

  for (const field of WRITABLE_FIELDS) {
    if (updates[field] !== undefined) listing[field] = updates[field];
  }
  if (updates.isActive !== undefined) {
    // An admin-hidden listing stays hidden until an admin restores it.
    if (updates.isActive && listing.moderation?.hidden && requester.role !== "admin") {
      throw new ApiError(403, `This listing was hidden by our team: ${listing.moderation.reason || "contact support"}`);
    }
    listing.isActive = updates.isActive;
  }

  await listing.save();
  return listing;
}

async function deleteListing(id, requester) {
  const listing = await Listing.findById(id).populate("vendorId", "userId");
  if (!listing) throw new ApiError(404, "Listing not found");
  assertListingOwnerOrAdmin(listing, requester);

  await listing.deleteOne();
}

function getMyListings(vendorProfile) {
  return Listing.find({ vendorId: vendorProfile._id }).sort({ createdAt: -1 });
}

function assertListingOwnerOrAdmin(listing, requester) {
  const isOwner = requester && String(listing.vendorId.userId) === String(requester.id);
  if (!isOwner && requester?.role !== "admin") {
    throw new ApiError(403, "You do not have access to this listing");
  }
}

// Exposes the recurring weekly rule and, given a date, the actual bookable
// start times: the rule's window sliced into durationMinutes-sized slots,
// minus whatever's already accepted on the vendor's calendar that day.
// (Pending requests don't block a slot — see bookingService's conflict
// check for why.)
async function getAvailability(id, dateStr) {
  const listing = await Listing.findById(id);
  if (!listing || !listing.isActive) throw new ApiError(404, "Listing not found");

  const result = { availabilityRules: listing.availabilityRules };
  if (!dateStr) return result;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Invalid date");
  result.date = dateStr;

  result.isAvailableDay = listing.availabilityRules.daysOfWeek.includes(date.getUTCDay());
  if (!result.isAvailableDay) {
    result.slots = [];
    return result;
  }

  // The vendor's days off override the weekly rule.
  const vendor = await VendorProfile.findById(listing.vendorId).select("timeOff");
  if (blockingEntry(vendor?.timeOff, date)) {
    result.isAvailableDay = false;
    result.timeOff = true;
    result.slots = [];
    return result;
  }

  const candidateSlots = generateSlotsForWindow(
    listing.availabilityRules.startTime,
    listing.availabilityRules.endTime,
    listing.durationMinutes
  );

  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const acceptedBookings = await Booking.find({
    vendorId: listing.vendorId,
    status: "accepted",
    "slot.date": { $gte: dayStart, $lt: dayEnd },
  });

  result.slots = candidateSlots.filter(
    (slot) =>
      !acceptedBookings.some((b) => doRangesOverlap(slot.startTime, slot.endTime, b.slot.startTime, b.slot.endTime))
  );

  return result;
}

// The free-text `q` filter matches with a case-insensitive regex rather
// than a MongoDB $text index. $text only matches whole words, so a search
// for "photo" would miss "Photography" — exactly the partial match a
// search box is expected to make. It's applied on top of indexed filters;
// at large scale move it to Atlas Search (see docs/CODE_REVIEW.md).
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MAX_PAGE = 500; // deep skip() is a DoS vector; nobody pages past this
const EARTH_RADIUS_KM = 6378.1;

const SORTS = {
  // Featured placements first (expired ones are cleared every 10 minutes by
  // jobs/clearExpiredFeatures), then provider trust, then newest.
  recommended: { featuredUntil: -1, vendorTrust: -1, createdAt: -1 },
  rating: { vendorRating: -1, vendorReviewCount: -1, createdAt: -1 },
  price_asc: { price: 1, createdAt: -1 },
  price_desc: { price: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

// Every filter and sort runs on fields stored on the listing itself
// (denormalized from the vendor by listingSync), so this is one indexed
// query + one count — no per-request load of every vendor, no in-memory
// sorting, and correct ranking across the whole catalogue.
async function searchListings(query) {
  const { q, category, minPrice, maxPrice, minRating, lat, lng, radiusKm, date, vendorId, sort = "recommended", page = 1, limit = 12 } = query;

  const filter = { isActive: true, vendorVerified: true };
  if (typeof category === "string" && category) filter.category = category;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (minRating) filter.vendorRating = { $gte: Number(minRating) };
  if (lat != null && lng != null && lat !== "" && lng !== "") {
    const radius = Math.min(200, Math.max(1, Number(radiusKm) || 25));
    filter.location = { $geoWithin: { $centerSphere: [[Number(lng), Number(lat)], radius / EARTH_RADIUS_KM] } };
  }

  if (vendorId) {
    if (typeof vendorId !== "string" || !mongoose.isValidObjectId(vendorId)) throw new ApiError(400, "Invalid vendorId");
    filter.vendorId = vendorId;
  }

  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "Invalid date");
    filter["availabilityRules.daysOfWeek"] = parsed.getUTCDay();
    // Vendors on time off that day — a small set, so excluding them is cheap.
    const day = toUtcDay(parsed);
    const away = await VendorProfile.find({ timeOff: { $elemMatch: { from: { $lte: day }, to: { $gte: day } } } }).distinct("_id");
    if (away.length) {
      if (filter.vendorId) {
        if (away.some((id) => String(id) === String(filter.vendorId))) return { listings: [], page: 1, limit: Number(limit) || 12, total: 0 };
      } else {
        filter.vendorId = { $nin: away };
      }
    }
  }

  const term = typeof q === "string" ? q.trim().slice(0, 100) : "";
  if (term) {
    const rx = new RegExp(escapeRegex(term), "i");
    filter.$or = [{ title: rx }, { description: rx }, { category: rx }, { vendorName: rx }];
  }

  const pageNum = Math.min(MAX_PAGE, Math.max(1, Number(page) || 1));
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 12));
  const sortSpec = SORTS[sort] || SORTS.recommended;

  const [listings, total] = await Promise.all([
    Listing.find(filter).sort(sortSpec).skip((pageNum - 1) * pageSize).limit(pageSize).populate("vendorId", LIST_VENDOR_FIELDS),
    Listing.countDocuments(filter),
  ]);
  return { listings, page: pageNum, limit: pageSize, total };
}

module.exports = {
  createListing,
  getListingForOwnerOrPublic,
  updateListing,
  deleteListing,
  getMyListings,
  getAvailability,
  adminListListings,
  moderateListing,
  searchListings,
};
