const Booking = require("../models/Booking");
const Message = require("../models/Message");
const Payment = require("../models/Payment");
const User = require("../models/User");
const VendorProfile = require("../models/VendorProfile");
const ApiError = require("../utils/ApiError");
const paymentService = require("./paymentService");
const bookingService = require("./bookingService");

async function getDisputes() {
  const disputes = await Booking.find({ status: "disputed" })
    .sort({ updatedAt: -1 })
    .populate("listingId", "title")
    .populate("customerId", "name email")
    .populate("vendorId", "businessName userId")
    .populate("paymentId", "amount commissionAmount status");

  // Enough context for the queue row to be worth reading — the reason the
  // dispute was opened, and how much evidence is waiting behind it. One
  // count query per dispute is an N+1, but an open-dispute queue is
  // inherently small (same tradeoff vendorService already takes).
  return Promise.all(
    disputes.map(async (booking) => {
      const disputeEntry = [...booking.statusHistory].reverse().find((entry) => entry.status === "disputed");
      return {
        ...booking.toObject(),
        disputeReason: disputeEntry?.note || null,
        disputeOpenedAt: disputeEntry?.changedAt || booking.updatedAt,
        messageCount: await Message.countDocuments({ bookingId: booking._id }),
        deliveryCount: booking.statusHistory.filter((entry) => entry.status === "submitted").length,
      };
    })
  );
}

// Routed through the booking state machine rather than moving money
// directly: the old version released or refunded but left the booking at
// "disputed", so the queue never emptied and a second click died inside
// paymentService on a non-"held" payment. Going through
// updateBookingStatus also gets statusHistory, the event message, the
// socket push and both parties' notifications for free.
async function resolveDispute(bookingId, requester, action, note) {
  if (!["release", "refund"].includes(action)) throw new ApiError(400, "Action must be release or refund");
  if (typeof note !== "string" || !note.trim()) {
    throw new ApiError(400, "A resolution note is required so the decision is auditable");
  }

  const existing = await Booking.findOne({ _id: bookingId, status: "disputed" });
  if (!existing) throw new ApiError(404, "Disputed booking not found");

  if (action === "release") {
    const booking = await bookingService.updateBookingStatus(bookingId, requester, "completed", { note });
    const payment = await paymentService.releasePayment(bookingId);
    return { booking, payment };
  }

  // The refund rides updateBookingStatus's existing cancelled/declined
  // side-effect rather than being called again here. That side-effect
  // swallows its errors by design (a user-initiated cancel shouldn't fail
  // over a payment hiccup), which is wrong for an admin ruling — so
  // re-read the payment and fail loudly if the money didn't actually move.
  const booking = await bookingService.updateBookingStatus(bookingId, requester, "cancelled", { note });
  const payment = await Payment.findOne({ bookingId });
  if (payment && payment.status !== "refunded") {
    throw new ApiError(502, `Booking was cancelled but the refund did not complete (payment is "${payment.status}") — retry the refund from Stripe`);
  }
  return { booking, payment };
}

// Bookings that represent committed spend: the vendor took the job and it
// hasn't been unwound. "submitted" (work delivered, awaiting approval) was
// missing here before, so GMV dipped every time a vendor delivered.
const GMV_STATUSES = ["accepted", "submitted", "completed", "disputed"];

async function getAnalytics() {
  const [bookingVolume, gmv, activeVendors, pendingVendors, statusCounts, paymentTotals, recentTransactions] = await Promise.all([
    Booking.countDocuments(),
    Booking.aggregate([
      { $match: { status: { $in: GMV_STATUSES } } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]),
    VendorProfile.countDocuments({ isVerified: true }),
    VendorProfile.countDocuments({ isVerified: false }),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $group: { _id: "$status", amount: { $sum: "$amount" }, commission: { $sum: "$commissionAmount" }, count: { $sum: 1 } } },
    ]),
    // PRD §5.9 "view all transactions" — the latest money movements with
    // enough booking context to recognise them.
    Payment.find()
      .sort({ heldAt: -1, _id: -1 })
      .limit(15)
      .populate({
        path: "bookingId",
        select: "status listingId customerId vendorId",
        populate: [
          { path: "listingId", select: "title" },
          { path: "customerId", select: "name" },
          { path: "vendorId", select: "businessName" },
        ],
      })
      .lean(),
  ]);

  const byPaymentStatus = Object.fromEntries(paymentTotals.map((row) => [row._id, row]));
  return {
    bookingVolume,
    gmv: gmv[0]?.total || 0,
    activeVendors,
    pendingVendors,
    bookingsByStatus: Object.fromEntries(statusCounts.map((row) => [row._id, row.count])),
    escrowHeld: byPaymentStatus.held?.amount || 0,
    released: byPaymentStatus.released?.amount || 0,
    refunded: byPaymentStatus.refunded?.amount || 0,
    // The platform only earns its cut on money that actually reached the vendor.
    commissionEarned: byPaymentStatus.released?.commission || 0,
    recentTransactions,
  };
}

async function setUserStatus(userId, status) {
  if (!["active", "suspended"].includes(status)) throw new ApiError(400, "Status must be active or suspended");
  const user = await User.findByIdAndUpdate(userId, { status }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, "User not found");
  return user;
}

module.exports = { getDisputes, resolveDispute, getAnalytics, setUserStatus };
