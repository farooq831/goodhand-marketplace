const VendorProfile = require("../models/VendorProfile");
const User = require("../models/User");
const Booking = require("../models/Booking");
const ApiError = require("../utils/ApiError");

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

async function getById(id) {
  const profile = await VendorProfile.findById(id).populate(
    "userId",
    "name avatarUrl isVerified"
  );
  if (!profile) throw new ApiError(404, "Vendor profile not found");

  const responseRate = await getResponseRate(profile._id);
  return { ...profile.toObject(), responseRate };
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
  if (Array.isArray(updates.verificationDocs)) {
    profile.verificationDocs = updates.verificationDocs;
  }

  await profile.save();
  return profile;
}

async function verifyVendor(profileId) {
  const profile = await VendorProfile.findById(profileId);
  if (!profile) throw new ApiError(404, "Vendor profile not found");

  profile.isVerified = true;
  await profile.save();

  // isVerified is tracked on both User (Architecture.md §3 users) and
  // here (denormalized for search) — keep both in sync.
  await User.findByIdAndUpdate(profile.userId, { isVerified: true });

  return profile;
}

function assertOwnerOrAdmin(profile, requester) {
  const isOwner = String(profile.userId) === String(requester.id);
  if (!isOwner && requester.role !== "admin") {
    throw new ApiError(403, "You do not have access to this vendor profile");
  }
}

module.exports = { createProfile, getById, getByUserId, updateProfile, verifyVendor };
