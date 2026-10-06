const Booking = require("../models/Booking");
const Message = require("../models/Message");
const ApiError = require("../utils/ApiError");
const { resolveBookingRequesterRole } = require("../utils/bookingAccess");
const VendorProfile = require("../models/VendorProfile");
const notificationService = require("./notificationService");

async function getAuthorizedBooking(bookingId, requester) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  const { isCustomer, isVendor } = await resolveBookingRequesterRole(booking, requester);
  if (!isCustomer && !isVendor && requester.role !== "admin") {
    throw new ApiError(404, "Booking not found");
  }

  return booking;
}

async function getMessages(bookingId, requester) {
  await getAuthorizedBooking(bookingId, requester);
  // `role` so the UI can mark platform-support messages as official in the
  // shared customer/vendor/admin dispute thread.
  return Message.find({ bookingId }).sort({ createdAt: 1 }).populate("senderId", "name role");
}

async function createMessage(bookingId, requester, text) {
  const booking = await getAuthorizedBooking(bookingId, requester);
  if (typeof text !== "string" || !text.trim()) {
    throw new ApiError(400, "Message text is required");
  }

  const message = await Message.create({
    bookingId,
    senderId: requester.id,
    text: text.trim(),
  });

  // The thread is three-way during a dispute, so "notify the other one"
  // has three cases, not two: an admin posting is party to neither side
  // and must reach both. Getting this wrong silently notified only the
  // customer whenever support replied.
  const vendorProfile = await VendorProfile.findById(booking.vendorId).select("userId");
  const senderIsCustomer = String(booking.customerId) === String(requester.id);
  const senderIsVendor = String(vendorProfile?.userId) === String(requester.id);
  const recipientIds = senderIsCustomer
    ? [vendorProfile?.userId]
    : senderIsVendor
      ? [booking.customerId]
      : [booking.customerId, vendorProfile?.userId];

  await Promise.all(
    recipientIds.map((id) =>
      notificationService
        .createNotification(id, "message_received", { bookingId: booking._id })
        .catch((err) => console.error("Notification failed for message:", err.message))
    )
  );
  return message.populate("senderId", "name role");
}

module.exports = { getMessages, createMessage };
