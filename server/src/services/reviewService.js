const Booking = require("../models/Booking");
const Review = require("../models/Review");
const VendorProfile = require("../models/VendorProfile");
const ApiError = require("../utils/ApiError");
const notificationService = require("./notificationService");
const trustService = require("./trustService");

async function createReview(userId, { bookingId, rating, comment }) {
  if (!bookingId || rating == null || !comment?.trim()) {
    throw new ApiError(400, "bookingId, rating, and comment are required");
  }
  const booking = await Booking.findById(bookingId).populate("vendorId", "userId");
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }
  if (booking.status !== "completed") throw new ApiError(400, "Only completed bookings can be reviewed");

  const authorRole = String(booking.customerId) === String(userId) ? "customer" : "vendor";
  const vendorProfile = booking.vendorId;
  if (authorRole === "vendor" && String(vendorProfile.userId) !== String(userId)) {
    throw new ApiError(404, "Booking not found");
  }

  let review;
  try {
    review = await Review.create({ bookingId, customerId: booking.customerId, vendorId: booking.vendorId._id, authorRole, rating, comment });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, "This booking has already been reviewed");
    throw err;
  }
  if (authorRole === "customer") {
    await recomputeVendorRating(booking.vendorId._id);
    await notificationService.createNotification(booking.vendorId.userId, "review_received", { bookingId, rating })
      .catch((err) => console.error("Notification failed for review:", err.message));
  } else {
    await notificationService.createNotification(booking.customerId, "review_received", { bookingId, rating })
      .catch((err) => console.error("Notification failed for review:", err.message));
  }
  return review;
}

async function respondToReview(reviewId, vendorUserId, response) {
  if (!response?.trim()) throw new ApiError(400, "Response is required");
  const review = await Review.findById(reviewId).populate("vendorId", "userId");
  if (!review) throw new ApiError(404, "Review not found");
  if (String(review.vendorId.userId) !== String(vendorUserId)) throw new ApiError(403, "You do not have access to this review");
  if (review.vendorResponse) throw new ApiError(409, "This review already has a response");
  review.vendorResponse = response.trim();
  return review.save();
}

function getVendorReviews(vendorId) {
  return Review.find({ vendorId, authorRole: { $ne: "vendor" } }).sort({ createdAt: -1 }).limit(50).populate("customerId", "name avatarUrl");
}

function getCustomerReviews(customerId) {
  return Review.find({ customerId, authorRole: "vendor" }).sort({ createdAt: -1 }).limit(50).populate("vendorId", "businessName");
}

async function recomputeVendorRating(vendorId) {
  const [summary] = await Review.aggregate([
    { $match: { vendorId, authorRole: "customer" } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const updated = await VendorProfile.findByIdAndUpdate(vendorId, {
    avgRating: summary ? Math.round(summary.average * 100) / 100 : 0,
    reviewCount: summary?.count || 0,
  }, { new: true });
  await trustService.recomputeTrustScore(vendorId);
  return updated;
}

module.exports = { createReview, respondToReview, getVendorReviews, getCustomerReviews, recomputeVendorRating };
