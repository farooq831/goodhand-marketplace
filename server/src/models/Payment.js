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
});

paymentSchema.index({ bookingId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
