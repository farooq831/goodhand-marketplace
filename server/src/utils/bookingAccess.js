const VendorProfile = require("../models/VendorProfile");

// Shared by bookingService and paymentService — both need to know whether
// a requester is the customer or vendor on a given booking. Pulled out
// here so paymentService can reuse it without requiring bookingService
// (which itself needs paymentService, for the refund side-effect in
// updateBookingStatus — a cycle otherwise).
async function resolveBookingRequesterRole(booking, requester) {
  // Called with both a raw booking and one with customerId/vendorId
  // populated into full documents — unwrap ._id when populated rather
  // than stringifying the whole document.
  const customerId = booking.customerId?._id ?? booking.customerId;
  const vendorId = booking.vendorId?._id ?? booking.vendorId;

  const isCustomer = String(customerId) === String(requester.id);
  let isVendor = false;
  if (requester.role === "vendor") {
    const vendorProfile = await VendorProfile.findOne({ userId: requester.id }).select("_id");
    isVendor = !!vendorProfile && String(vendorProfile._id) === String(vendorId);
  }
  return { isCustomer, isVendor };
}

module.exports = { resolveBookingRequesterRole };
