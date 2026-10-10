const mongoose = require("mongoose");

// Architecture.md §3 `payments` collection / §7 escrow flow.
// Deliberately no timestamps option — the doc only tracks heldAt/releasedAt,
// not a generic createdAt/updatedAt pair.
const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  stripePaymentIntentId: { type: String, required: true, unique: true },
  // Full booking price held in escrow. Vendor payout at release time is
  // amount - commissionAmount.
  amount: { type: Number, required: true },
  commissionAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["held", "released", "refunded", "disputed"],
    default: "held",
  },
  heldAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
  // Money actually leaving the platform for the vendor (PRD §6: manual
  // payouts in v1). Only meaningful once status is "released". The method
  // is snapshotted so later edits to the vendor's details don't rewrite
  // where a past payout went.
  payout: {
    status: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
    paidAt: { type: Date, default: null },
    reference: { type: String, trim: true, default: "" },
    method: { type: String, default: "" },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
});

paymentSchema.index({ bookingId: 1 });
// Payout queue / history and the release job.
paymentSchema.index({ status: 1, "payout.status": 1, releasedAt: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
