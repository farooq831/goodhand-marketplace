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
