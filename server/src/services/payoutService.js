const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const VendorProfile = require("../models/VendorProfile");
const ApiError = require("../utils/ApiError");
const notificationService = require("./notificationService");

// PRD §6: payouts to vendors are manual in v1 — an admin sends the money by
// bank transfer / JazzCash / Easypaisa outside the app, then records it
// here so both sides have a trail. "Owed" = released from escrow, not yet
// paid out. The vendor's share is amount − commission.

const net = (payment) => Math.round((payment.amount - payment.commissionAmount) * 100) / 100;

function describeMethod(method) {
  if (!method?.type) return "";
  if (method.type === "bank") return `${method.bankName} · ${method.accountNumber} · ${method.accountTitle}`;
  const wallet = method.type === "jazzcash" ? "JazzCash" : "Easypaisa";
  return `${wallet} · ${method.accountNumber} · ${method.accountTitle}`;
}

// Released payments joined to their booking's vendor.
async function releasedWithVendors(payoutStatus) {
  const payments = await Payment.find({ status: "released", "payout.status": payoutStatus })
    .sort(payoutStatus === "paid" ? { "payout.paidAt": -1 } : { releasedAt: 1 })
    .limit(payoutStatus === "paid" ? 100 : 1000)
    .populate({
      path: "bookingId",
      select: "vendorId listingId customerId slot",
      populate: [{ path: "listingId", select: "title" }, { path: "customerId", select: "name" }],
    })
    .lean();
  return payments.filter((p) => p.bookingId?.vendorId);
}

async function getPendingPayouts() {
  const payments = await releasedWithVendors("unpaid");
  const vendorIds = [...new Set(payments.map((p) => String(p.bookingId.vendorId)))];
  const vendors = await VendorProfile.find({ _id: { $in: vendorIds } })
    .select("businessName payoutMethod userId")
    .populate("userId", "name email phone")
    .lean();
  const byId = new Map(vendors.map((v) => [String(v._id), v]));

  const groups = new Map();
  for (const payment of payments) {
    const key = String(payment.bookingId.vendorId);
    if (!groups.has(key)) groups.set(key, { vendor: byId.get(key) || { _id: key, businessName: "Unknown vendor" }, payments: [], total: 0 });
    const group = groups.get(key);
    const amount = net(payment);
    group.payments.push({
      _id: payment._id,
      bookingId: payment.bookingId._id,
      title: payment.bookingId.listingId?.title || "Booking",
      customer: payment.bookingId.customerId?.name || "",
      releasedAt: payment.releasedAt,
      amount: payment.amount,
      commission: payment.commissionAmount,
      net: amount,
    });
    group.total = Math.round((group.total + amount) * 100) / 100;
  }
  // Largest balances first — those vendors are waiting on the most money.
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

async function getPayoutHistory() {
  const payments = await releasedWithVendors("paid");
  const vendorIds = [...new Set(payments.map((p) => String(p.bookingId.vendorId)))];
  const vendors = await VendorProfile.find({ _id: { $in: vendorIds } }).select("businessName").lean();
  const names = new Map(vendors.map((v) => [String(v._id), v.businessName]));
  return payments.map((p) => ({
    _id: p._id,
    vendorName: names.get(String(p.bookingId.vendorId)) || "",
    title: p.bookingId.listingId?.title || "Booking",
    net: net(p),
    paidAt: p.payout.paidAt,
    reference: p.payout.reference,
    method: p.payout.method,
  }));
}

async function markPaid(requester, { vendorId, paymentIds, reference } = {}) {
  const ref = String(reference || "").trim();
  if (!ref) throw new ApiError(400, "Enter the transaction reference from your bank or wallet transfer");
  if (!vendorId || !mongoose.isValidObjectId(vendorId)) throw new ApiError(400, "vendorId is required");
  if (!Array.isArray(paymentIds) || !paymentIds.length) throw new ApiError(400, "Select at least one payment");

  const vendor = await VendorProfile.findById(vendorId).select("userId businessName payoutMethod");
  if (!vendor) throw new ApiError(404, "Vendor not found");

  // All-or-nothing: every payment must be released, unpaid, and this vendor's.
  const payments = await Payment.find({ _id: { $in: paymentIds } });
  if (payments.length !== new Set(paymentIds.map(String)).size) throw new ApiError(404, "One or more payments were not found");
  const bookings = await Booking.find({ _id: { $in: payments.map((p) => p.bookingId) } }).select("vendorId");
  const vendorOf = new Map(bookings.map((b) => [String(b._id), String(b.vendorId)]));
  for (const payment of payments) {
    if (payment.status !== "released") throw new ApiError(400, "Only released payments can be paid out");
    if (payment.payout?.status === "paid") throw new ApiError(409, "One of these payments has already been paid out");
    if (vendorOf.get(String(payment.bookingId)) !== String(vendorId)) throw new ApiError(400, "All payments must belong to this vendor");
  }

  const paidAt = new Date();
  const method = describeMethod(vendor.payoutMethod);
  // Guarded update so a double-click (or two admins) can't pay twice.
  const result = await Payment.updateMany(
    { _id: { $in: payments.map((p) => p._id) }, status: "released", "payout.status": { $ne: "paid" } },
    { $set: { "payout.status": "paid", "payout.paidAt": paidAt, "payout.reference": ref, "payout.method": method, "payout.paidBy": requester.id } }
  );
  if (result.modifiedCount !== payments.length) throw new ApiError(409, "Some of these payments were just paid out by someone else — refresh and try again");

  const total = Math.round(payments.reduce((sum, p) => sum + net(p), 0) * 100) / 100;
  await notificationService
    .createNotification(vendor.userId, "payout_sent", { amount: total, reference: ref, count: payments.length, method })
    .catch((err) => console.error("Notification failed:", err.message));
  return { vendorId, total, count: payments.length, reference: ref, paidAt };
}

module.exports = { getPendingPayouts, getPayoutHistory, markPaid, describeMethod };
