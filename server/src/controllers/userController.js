const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const Review = require("../models/Review");

async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return next(new ApiError(404, "User not found"));
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// Deliberately excludes email, role, passwordHash, status — those need
// their own dedicated flows (email change/verification, admin actions).
const UPDATABLE_FIELDS = ["name", "phone", "avatarUrl"];

async function updateMe(req, res, next) {
  try {
    const updates = {};
    for (const field of UPDATABLE_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    // Validate everything a user can set on themselves.
    if (updates.name !== undefined && (typeof updates.name !== "string" || !updates.name.trim() || updates.name.length > 80)) return next(new ApiError(400, "Name must be 1-80 characters"));
    if (updates.phone !== undefined && updates.phone !== null && updates.phone !== "" && !/^\+?[0-9][0-9\s-]{8,16}$/.test(String(updates.phone))) return next(new ApiError(400, "Enter a valid phone number"));
    if (updates.avatarUrl && !require("../utils/trustedUrl").isTrustedUploadUrl(updates.avatarUrl)) return next(new ApiError(400, "Profile photos must be uploaded through Goodhand"));

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!user) return next(new ApiError(404, "User not found"));
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function getPublicProfile(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select("name avatarUrl role");
    if (!user) return next(new ApiError(404, "User not found"));
    const reviews = await Review.find({ customerId: user._id, authorRole: "vendor" })
      .sort({ createdAt: -1 }).populate("vendorId", "businessName");
    res.json({ user, reviews });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, getPublicProfile };
