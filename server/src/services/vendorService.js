const VendorProfile = require("../models/VendorProfile");
const User = require("../models/User");
const Booking = require("../models/Booking");
const ApiError = require("../utils/ApiError");
const { toUtcDay } = require("../utils/timeOff");
const notificationService = require("./notificationService");
const trustService = require("./trustService");

const DOC_TYPES = ["cnic_front", "cnic_back", "business_proof", "other"];

// What an admin can ask a vendor to fix. Keys are stored on the review
// history; the client and the email carry the human-readable labels.
const CHANGE_ITEMS = {
  cnic_front: "CNIC front photo — missing or unclear",
  cnic_back: "CNIC back photo — missing or unclear",
  cnic_number: "CNIC number — missing or doesn't match the card",
  business_proof: "Business proof — missing or unclear",
  business_name: "Business name — incorrect or incomplete",
  description: "Description — too short or unclear",
  service_area: "City / service area — missing or incorrect",
  category: "Category — doesn't match your services",
};

// Pakistani CNIC: 13 digits, conventionally written 12345-1234567-1.
const CNIC_PATTERN = /^\d{5}-?\d{7}-?\d$/;

function normalizeCnic(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (!CNIC_PATTERN.test(trimmed)) throw new ApiError(400, "CNIC number must be 13 digits, e.g. 35202-1234567-1");
  const digits = trimmed.replace(/-/g, "");
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

// Pakistani mobile wallet (JazzCash / Easypaisa): 03XXXXXXXXX, optionally +92.
const WALLET_PATTERN = /^(?:\+?92|0)3\d{9}$/;
// Pakistani IBAN: PK + 2 check digits + 4-letter bank code + 16 digits.
const IBAN_PATTERN = /^PK\d{2}[A-Z]{4}\d{16}$/;

function normalizePayoutMethod(input) {
  if (!input || !input.type) return { type: null, accountTitle: "", accountNumber: "", bankName: "" };
  if (!["bank", "jazzcash", "easypaisa"].includes(input.type)) throw new ApiError(400, "Payout method must be bank, JazzCash, or Easypaisa");
  const accountTitle = String(input.accountTitle || "").trim();
  if (!accountTitle) throw new ApiError(400, "Account title is required");
  const raw = String(input.accountNumber || "").replace(/[\s-]/g, "").toUpperCase();

  if (input.type === "bank") {
    const bankName = String(input.bankName || "").trim();
    if (!bankName) throw new ApiError(400, "Bank name is required");
    if (!IBAN_PATTERN.test(raw)) throw new ApiError(400, "Enter a valid 24-character IBAN, e.g. PK36SCBL0000001123456702");
    return { type: "bank", accountTitle, accountNumber: raw, bankName };
  }
  if (!WALLET_PATTERN.test(raw)) throw new ApiError(400, "Enter a valid mobile wallet number, e.g. 03001234567");
  return { type: input.type, accountTitle, accountNumber: raw.replace(/^\+?92/, "0"), bankName: "" };
}

function normalizeDocuments(documents) {
  if (!Array.isArray(documents)) throw new ApiError(400, "documents must be an array");
  return documents.map((doc) => {
    if (!doc || !DOC_TYPES.includes(doc.type)) throw new ApiError(400, "Each document needs a valid type");
    if (typeof doc.url !== "string" || !/^https?:\/\//.test(doc.url)) throw new ApiError(400, "Each document needs a valid URL");
    return { type: doc.type, url: doc.url, uploadedAt: doc.uploadedAt || new Date() };
  });
}

async function createProfile(userId, data) {
  const { businessName, category, description, city, lat, lng } = data;
  if (!businessName || !category) {
    throw new ApiError(400, "businessName and category are required");
  }

  let profile;
  try {
    profile = await VendorProfile.create({
      userId,
      businessName,
      category,
      description,
      cnicNumber: normalizeCnic(data.cnicNumber),
      documents: data.documents ? normalizeDocuments(data.documents) : [],
      verificationStatus: "pending",
      reviewHistory: [{ action: "submitted", by: userId }],
      serviceArea: {
        city: city || null,
        location:
          lat != null && lng != null
            ? { type: "Point", coordinates: [Number(lng), Number(lat)] }
            : undefined,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "A vendor profile already exists for this account");
    }
    throw err;
  }

  await notificationService
    .notifyRole("admin", "vendor_submitted", { vendorProfileId: profile._id, businessName: profile.businessName })
    .catch((err) => console.error("Notification failed:", err.message));
  return profile;
}

// PRD §5.3 / Design.md §4 both put a response rate on the vendor profile:
// the share of booking requests this vendor actually answered.
//
// `cancelled` is deliberately excluded from both halves — a customer can
// cancel a pending request before the vendor ever had a chance to respond,
// and that shouldn't count against them either way. Everything past
// `pending` counts as answered; `pending` itself is the unanswered backlog.
//
// Computed on read rather than denormalized onto the schema: it's only ever
// shown on this one page, so there's no search-sort case to justify another
// field to keep in sync (unlike avgRating/reviewCount).
const RESPONDED_STATUSES = ["accepted", "declined", "submitted", "completed", "disputed"];

async function getResponseRate(vendorProfileId) {
  const [responded, pending] = await Promise.all([
    Booking.countDocuments({ vendorId: vendorProfileId, status: { $in: RESPONDED_STATUSES } }),
    Booking.countDocuments({ vendorId: vendorProfileId, status: "pending" }),
  ]);

  const total = responded + pending;
  // null, not 0 — a brand-new vendor hasn't earned a bad score yet, and the
  // UI shows "New" for it instead of a misleading 0%.
  if (!total) return null;
  return Math.round((responded / total) * 100);
}

// Identity documents and the review conversation are for the owner and
// admins only. The public profile used to return the whole document —
// including verification uploads — to anyone who knew the vendor's id.
const PRIVATE_FIELDS = ["cnicNumber", "documents", "verificationDocs", "reviewHistory", "verificationStatus", "timeOff", "payoutMethod"];

function toPublic(profileObject) {
  const copy = { ...profileObject };
  for (const field of PRIVATE_FIELDS) delete copy[field];
  return copy;
}

async function getById(id) {
  const profile = await VendorProfile.findById(id).populate(
    "userId",
    "name avatarUrl isVerified"
  );
  if (!profile) throw new ApiError(404, "Vendor profile not found");

  const responseRate = await getResponseRate(profile._id);
  return { ...toPublic(profile.toObject()), responseRate };
}

function getByUserId(userId) {
  return VendorProfile.findOne({ userId });
}

const UPDATABLE_FIELDS = ["businessName", "category", "description"];

async function updateProfile(profileId, requester, updates) {
  const profile = await VendorProfile.findById(profileId);
  if (!profile) throw new ApiError(404, "Vendor profile not found");
  assertOwnerOrAdmin(profile, requester);

  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) profile[field] = updates[field];
  }
  if (updates.city !== undefined) profile.serviceArea.city = updates.city;
  if (updates.lat != null && updates.lng != null) {
    profile.serviceArea.location = {
      type: "Point",
      coordinates: [Number(updates.lng), Number(updates.lat)],
    };
  }
  if (updates.cnicNumber !== undefined) profile.cnicNumber = normalizeCnic(updates.cnicNumber);
  if (updates.documents !== undefined) profile.documents = normalizeDocuments(updates.documents);
  if (updates.payoutMethod !== undefined) profile.payoutMethod = normalizePayoutMethod(updates.payoutMethod);
  if (updates.portfolio !== undefined) {
    if (!Array.isArray(updates.portfolio) || updates.portfolio.length > 12) throw new ApiError(400, "Portfolio can have up to 12 items");
    profile.portfolio = updates.portfolio.map((item) => {
      if (typeof item?.url !== "string" || !/^https?:\/\//.test(item.url)) throw new ApiError(400, "Each portfolio item needs a valid image URL");
      return { url: item.url, caption: String(item.caption || "").trim().slice(0, 120) };
    });
  }

  // The vendor saving their profile after the admin asked for changes is
  // the resubmission — no separate step to forget. It goes back into the
  // admin's queue and the admins are told.
  const isOwner = String(profile.userId) === String(requester.id);
  const resubmitted = isOwner && profile.verificationStatus === "changes_requested";
  if (resubmitted) {
    profile.verificationStatus = "pending";
    profile.reviewHistory.push({ action: "resubmitted", by: requester.id, note: String(updates.resubmitNote || "").trim() });
  }

  await profile.save();
  // Name/location changes must reach the listings search uses.
  await require("./listingSync").syncListingsForVendor(profile._id);

  if (resubmitted) {
    await notificationService
      .notifyRole("admin", "vendor_resubmitted", { vendorProfileId: profile._id, businessName: profile.businessName })
      .catch((err) => console.error("Notification failed:", err.message));
  }
  return profile;
}

// Both User.isVerified (source of truth, Architecture.md §3) and the
// denormalized VendorProfile.isVerified used by search move together.
async function setVerified(profile, value) {
  profile.isVerified = value;
  await User.findByIdAndUpdate(profile.userId, { isVerified: value });
}

async function verifyVendor(profileId, requester, note = "") {
  const profile = await VendorProfile.findById(profileId);
  if (!profile) throw new ApiError(404, "Vendor profile not found");
  if (profile.verificationStatus === "approved") throw new ApiError(409, "This vendor is already approved");

  profile.verificationStatus = "approved";
  profile.reviewHistory.push({ action: "approved", by: requester?.id, note: String(note || "").trim() });
  await setVerified(profile, true);
  await profile.save();
  await trustService.recomputeTrustScore(profile._id);

  await notificationService
    .createNotification(profile.userId, "vendor_approved", { vendorProfileId: profile._id, businessName: profile.businessName })
    .catch((err) => console.error("Notification failed:", err.message));
  return profile;
}

async function requestChanges(profileId, requester, { items = [], note = "" } = {}) {
  const profile = await VendorProfile.findById(profileId);
  if (!profile) throw new ApiError(404, "Vendor profile not found");

  const keys = Array.isArray(items) ? [...new Set(items)] : [];
  const unknown = keys.filter((key) => !CHANGE_ITEMS[key]);
  if (unknown.length) throw new ApiError(400, `Unknown change item: ${unknown.join(", ")}`);
  const trimmedNote = String(note || "").trim();
  if (!keys.length && !trimmedNote) {
    throw new ApiError(400, "Pick at least one thing to fix or write a note for the vendor");
  }

  profile.verificationStatus = "changes_requested";
  profile.reviewHistory.push({ action: "changes_requested", items: keys, note: trimmedNote, by: requester.id });
  // Asking for changes on an already-live vendor takes them out of search
  // until they comply — otherwise the request has no teeth.
  if (profile.isVerified) await setVerified(profile, false);
  await profile.save();
  await require("./listingSync").syncListingsForVendor(profile._id);

  // The payload carries readable text so the email can list exactly what
  // to fix (emailService formats vendor_changes_requested specially).
  await notificationService
    .createNotification(profile.userId, "vendor_changes_requested", {
      vendorProfileId: profile._id,
      businessName: profile.businessName,
      items: keys.map((key) => CHANGE_ITEMS[key]),
      note: trimmedNote,
    })
    .catch((err) => console.error("Notification failed:", err.message));
  return profile;
}

// --- Provider analytics -----------------------------------------------------

async function getMyStats(userId) {
  const profile = await myProfileOrThrow(userId);
  const Listing = require("../models/Listing");
  const Payment = require("../models/Payment");
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [listingAgg, statusCounts, bookingIds] = await Promise.all([
    Listing.aggregate([{ $match: { vendorId: profile._id } }, { $group: { _id: null, views: { $sum: "$views" }, total: { $sum: 1 }, active: { $sum: { $cond: ["$isActive", 1, 0] } } } }]),
    Booking.aggregate([{ $match: { vendorId: profile._id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Booking.find({ vendorId: profile._id }).distinct("_id"),
  ]);
  const earned = await Payment.aggregate([
    { $match: { bookingId: { $in: bookingIds }, status: "released", releasedAt: { $gte: monthStart } } },
    { $group: { _id: null, net: { $sum: { $subtract: ["$amount", "$commissionAmount"] } } } },
  ]);
  const count = (s) => statusCounts.find((r) => r._id === s)?.n || 0;
  const requests = statusCounts.reduce((sum, r) => sum + r.n, 0);
  const accepted = count("accepted") + count("submitted") + count("completed") + count("disputed");
  const answered = accepted + count("declined");
  const settled = count("completed") + count("cancelled") + count("disputed");
  const views = listingAgg[0]?.views || 0;
  return {
    views,
    listings: listingAgg[0]?.total || 0,
    activeListings: listingAgg[0]?.active || 0,
    requests,
    conversionRate: views ? Math.round((requests / views) * 1000) / 10 : null, // % of views that became a request
    acceptanceRate: answered ? Math.round((accepted / answered) * 100) : null,
    completionRate: settled ? Math.round((count("completed") / settled) * 100) : null,
    pending: count("pending"),
    trustScore: profile.trustScore,
    avgRating: profile.avgRating,
    reviewCount: profile.reviewCount,
    earnedThisMonth: Math.round((earned[0]?.net || 0) * 100) / 100,
  };
}

// --- Time off -------------------------------------------------------------

const MAX_TIME_OFF_DAYS = 366;

async function myProfileOrThrow(userId) {
  const profile = await VendorProfile.findOne({ userId });
  if (!profile) throw new ApiError(404, "Create your vendor profile first");
  return profile;
}

// Existing bookings aren't cancelled automatically — that would surprise
// customers. They're returned so the vendor can contact them or cancel.
async function addTimeOff(userId, { from, to, reason = "" } = {}) {
  const profile = await myProfileOrThrow(userId);
  const start = toUtcDay(from);
  const end = toUtcDay(to || from);
  if (!start || !end) throw new ApiError(400, "Please choose valid dates");
  if (end < start) throw new ApiError(400, "The end date must be on or after the start date");
  const today = toUtcDay(new Date());
  if (end < today) throw new ApiError(400, "Those dates have already passed");
  if ((end - start) / 86400000 + 1 > MAX_TIME_OFF_DAYS) throw new ApiError(400, "Time off can be at most a year at a time");

  profile.timeOff.push({ from: start, to: end, reason: String(reason).trim().slice(0, 120) });
  profile.timeOff.sort((a, b) => a.from - b.from);
  await profile.save();

  const conflicts = await Booking.find({
    vendorId: profile._id,
    status: { $in: ["pending", "accepted"] },
    "slot.date": { $gte: start, $lte: end },
  })
    .sort({ "slot.date": 1 })
    .populate("listingId", "title")
    .populate("customerId", "name");

  return { timeOff: profile.timeOff, conflicts };
}

async function removeTimeOff(userId, entryId) {
  const profile = await myProfileOrThrow(userId);
  const before = profile.timeOff.length;
  profile.timeOff = profile.timeOff.filter((entry) => String(entry._id) !== String(entryId));
  if (profile.timeOff.length === before) throw new ApiError(404, "Time off entry not found");
  await profile.save();
  return { timeOff: profile.timeOff };
}

// Admin verification queue: everyone not yet approved, with the owner's
// contact details and everything needed to decide without another click.
async function getVerificationQueue() {
  return VendorProfile.find({ verificationStatus: { $ne: "approved" } })
    .sort({ createdAt: 1 })
    .populate("userId", "name email phone status createdAt")
    .populate("reviewHistory.by", "name role");
}

// Profiles created before typed documents/verificationStatus existed.
// Idempotent; runs at server start.
async function backfillVerification() {
  const legacy = await VendorProfile.find({ $or: [{ "reviewHistory.0": { $exists: false } }, { verificationDocs: { $ne: [] } }] });
  for (const profile of legacy) {
    if (profile.verificationDocs?.length) {
      profile.documents.push(...profile.verificationDocs.map((url) => ({ type: "other", url })));
      profile.verificationDocs = [];
    }
    if (!profile.reviewHistory.length) {
      profile.verificationStatus = profile.isVerified ? "approved" : "pending";
      profile.reviewHistory.push({ action: "submitted", by: profile.userId, at: profile.createdAt });
    }
    await profile.save();
  }
}

function assertOwnerOrAdmin(profile, requester) {
  const isOwner = String(profile.userId) === String(requester.id);
  if (!isOwner && requester.role !== "admin") {
    throw new ApiError(403, "You do not have access to this vendor profile");
  }
}

module.exports = {
  createProfile,
  getById,
  getByUserId,
  updateProfile,
  verifyVendor,
  requestChanges,
  getVerificationQueue,
  backfillVerification,
  addTimeOff,
  getMyStats,
  removeTimeOff,
  CHANGE_ITEMS,
};
