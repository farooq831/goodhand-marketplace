const mongoose = require("mongoose");
const User = require("../models/User");
const Listing = require("../models/Listing");
const VendorProfile = require("../models/VendorProfile");
const ApiError = require("../utils/ApiError");

// Customer shortlists: saved services (listings) and saved providers.
const FIELD = { listings: "savedListings", vendors: "savedVendors" };
const MAX_SAVED = 200;

function fieldFor(kind) {
  const field = FIELD[kind];
  if (!field) throw new ApiError(400, "kind must be listings or vendors");
  return field;
}

async function getSaved(userId) {
  const user = await User.findById(userId).select("savedListings savedVendors");
  if (!user) throw new ApiError(404, "User not found");
  // Only what's still publicly visible — a hidden listing or a vendor that
  // lost verification quietly drops out instead of showing a dead link.
  const [listings, vendors] = await Promise.all([
    Listing.find({ _id: { $in: user.savedListings }, isActive: true })
      .populate("vendorId", "businessName avgRating reviewCount serviceArea.city trustScore isVerified")
      .then((rows) => rows.filter((l) => l.vendorId?.isVerified)),
    VendorProfile.find({ _id: { $in: user.savedVendors }, isVerified: true }).select("businessName category avgRating reviewCount serviceArea.city trustScore"),
  ]);
  return { listings, vendors, listingIds: user.savedListings.map(String), vendorIds: user.savedVendors.map(String) };
}

async function save(userId, kind, id) {
  const field = fieldFor(kind);
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid id");
  const Model = kind === "listings" ? Listing : VendorProfile;
  if (!(await Model.exists({ _id: id }))) throw new ApiError(404, "Not found");
  const result = await User.updateOne(
    { _id: userId, [`${field}.${MAX_SAVED - 1}`]: { $exists: false } },
    { $addToSet: { [field]: id } }
  );
  if (!result.matchedCount) throw new ApiError(400, `You can save up to ${MAX_SAVED} items`);
  return { saved: true };
}

async function unsave(userId, kind, id) {
  const field = fieldFor(kind);
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid id");
  await User.updateOne({ _id: userId }, { $pull: { [field]: id } });
  return { saved: false };
}

module.exports = { getSaved, save, unsave };
