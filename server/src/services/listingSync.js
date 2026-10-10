const Listing = require("../models/Listing");
const VendorProfile = require("../models/VendorProfile");

// Search needs a few vendor-level facts (approved? trust? rating? name?
// location?) for every listing. Reading them from VendorProfile at query
// time meant loading every approved vendor's id into memory per search and
// sorting in Node. Instead they're copied onto each listing — the classic
// read-optimised denormalization — and kept in sync here whenever the
// vendor changes. Search then filters and sorts entirely on indexes.

function denormFrom(vendor) {
  const coords = vendor.serviceArea?.location?.coordinates;
  const hasLocation = Array.isArray(coords) && coords.length === 2;
  return {
    set: {
      vendorVerified: !!vendor.isVerified,
      vendorTrust: vendor.trustScore ?? 60,
      vendorRating: vendor.avgRating || 0,
      vendorReviewCount: vendor.reviewCount || 0,
      vendorName: vendor.businessName || "",
      ...(hasLocation ? { location: { type: "Point", coordinates: coords } } : {}),
    },
    unsetLocation: !hasLocation,
  };
}

// Never throws — a sync failure must not break the action that caused it;
// the nightly trust recompute re-syncs everything.
async function syncListingsForVendor(vendorOrId) {
  try {
    const vendor = vendorOrId?.businessName !== undefined && vendorOrId?.isVerified !== undefined
      ? vendorOrId
      : await VendorProfile.findById(vendorOrId).select("isVerified trustScore avgRating reviewCount businessName serviceArea").lean();
    if (!vendor) return;
    const { set, unsetLocation } = denormFrom(vendor);
    await Listing.updateMany({ vendorId: vendor._id }, { $set: set, ...(unsetLocation ? { $unset: { location: 1 } } : {}) });
  } catch (err) {
    console.error("Listing sync failed:", err.message);
  }
}

module.exports = { syncListingsForVendor, denormFrom };
