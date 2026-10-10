const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const VendorProfile = require("../models/VendorProfile");
const Booking = require("../models/Booking");
const ApiError = require("../utils/ApiError");
const { toUtcDay, blockingEntry, notOnTimeOff } = require("../utils/timeOff");
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

  const payload = { vendorId: vendorProfile._id };
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

// Rating lives on the vendor, not the listing, so a DB-level sort by
// rating would need a $lookup aggregation. This bounded in-memory sort is
// the cheaper correct-enough approach at portfolio scale.
const MAX_RATING_SORT_CANDIDATES = 300;

// The free-text `q` filter matches with a case-insensitive regex rather
// than a MongoDB $text index. $text only matches whole words, so a search
// for "photo" would miss "Photography" — exactly the partial match a
// search box is expected to make. The cost is a collection scan, which is
// the same tradeoff MAX_RATING_SORT_CANDIDATES above already accepts.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchListings(query) {
  const {
    q,
    category,
    minPrice,
    maxPrice,
    minRating,
    lat,
    lng,
    radiusKm,
    date,
    vendorId,
    sort = "recommended",
    page = 1,
    limit = 12,
  } = query;

  const term = typeof q === "string" ? q.trim() : "";
  const termRegex = term ? new RegExp(escapeRegex(term), "i") : null;

  const listingFilter = { isActive: true };
  if (category) listingFilter.category = category;
  if (minPrice || maxPrice) {
    listingFilter.price = {};
    if (minPrice) listingFilter.price.$gte = Number(minPrice);
    if (maxPrice) listingFilter.price.$lte = Number(maxPrice);
  }
  let availableDay = null;
  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "Invalid date");
    listingFilter["availabilityRules.daysOfWeek"] = parsed.getUTCDay();
    availableDay = toUtcDay(parsed);
  }

  if (vendorId) {
    // Same visibility rule as the general search: only approved vendors'
    // listings are public. This branch used to skip it, so anyone with an
    // unapproved vendor's id could list that vendor's services.
    if (typeof vendorId !== "string" || !mongoose.isValidObjectId(vendorId)) throw new ApiError(400, "Invalid vendorId");
    const approved = await VendorProfile.exists({ _id: vendorId, isVerified: true });
    if (!approved) return { listings: [], page: 1, limit: Number(limit) || 12, total: 0 };
    listingFilter.vendorId = vendorId;
    if (availableDay) {
      const away = await VendorProfile.exists({ _id: vendorId, timeOff: { $elemMatch: { from: { $lte: availableDay }, to: { $gte: availableDay } } } });
      if (away) return { listings: [], page: 1, limit: Number(limit) || 12, total: 0 };
    }
    // A single vendor's own page — nothing to match a business name against.
    if (termRegex) {
      listingFilter.$or = [
        { title: termRegex },
        { description: termRegex },
        { category: termRegex },
      ];
    }
  } else {
    // Rating/location filters live on VendorProfile — resolve them into a
    // vendorId allowlist rather than joining on every search.
    const vendorFilter = { isVerified: true };
    if (minRating) vendorFilter.avgRating = { $gte: Number(minRating) };
    // "Available on <date>" also means the vendor isn't on time off then.
    if (availableDay) vendorFilter.timeOff = notOnTimeOff(availableDay);
    if (lat != null && lng != null) {
      vendorFilter["serviceArea.location"] = {
        $near: {
          $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          $maxDistance: (Number(radiusKm) || 25) * 1000,
        },
      };
    }
    const vendors = await VendorProfile.find(vendorFilter).select("_id businessName");
    listingFilter.vendorId = { $in: vendors.map((v) => v._id) };

    if (termRegex) {
      // Business-name matches come out of the allowlist we already fetched,
      // so "Bright Path" finds that vendor's listings without a second
      // round-trip. $or is ANDed with the vendorId allowlist above, and this
      // subset of it, so the verified/rating/geo visibility rules still hold.
      const nameMatched = vendors.filter((v) => termRegex.test(v.businessName)).map((v) => v._id);
      listingFilter.$or = [
        { title: termRegex },
        { description: termRegex },
        { category: termRegex },
        ...(nameMatched.length ? [{ vendorId: { $in: nameMatched } }] : []),
      ];
    }
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 12));

  // "recommended" (the default) and "rating" rank by vendor-level fields, so
  // they sort a bounded candidate set in memory — the same tradeoff as before.
  if (sort === "rating" || sort === "recommended" || !sort) {
    const candidates = await Listing.find(listingFilter)
      .sort({ createdAt: -1 })
      .limit(MAX_RATING_SORT_CANDIDATES)
      .populate("vendorId", LIST_VENDOR_FIELDS);

    if (sort === "rating") {
      candidates.sort((a, b) => (b.vendorId?.avgRating || 0) - (a.vendorId?.avgRating || 0));
    } else {
      // Paid featured placements first, then the provider trust score.
      const now = Date.now();
      const featured = (l) => (l.featuredUntil && l.featuredUntil.getTime() > now ? 1 : 0);
      candidates.sort((a, b) => featured(b) - featured(a) || (b.vendorId?.trustScore ?? 60) - (a.vendorId?.trustScore ?? 60) || b.createdAt - a.createdAt);
    }
    const start = (pageNum - 1) * pageSize;
    return {
      listings: candidates.slice(start, start + pageSize),
      page: pageNum,
      limit: pageSize,
      total: candidates.length,
    };
  }

  const sortSpec =
    sort === "price_asc" ? { price: 1 } : sort === "price_desc" ? { price: -1 } : { createdAt: -1 };

  const [listings, total] = await Promise.all([
    Listing.find(listingFilter)
      .sort(sortSpec)
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .populate("vendorId", LIST_VENDOR_FIELDS),
    Listing.countDocuments(listingFilter),
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
