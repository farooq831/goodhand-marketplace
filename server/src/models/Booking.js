const mongoose = require("mongoose");

// `note` and `files` turn this from a bare status log into the booking's
// evidence trail — it's what an admin reads to adjudicate a dispute. `note`
// carries whichever reason the transition required (revision request,
// dispute reason, admin resolution rationale); `files` carries that
// delivery's attachments, so a revision loop's earlier deliveries survive
// even though `submittedFiles` below only ever holds the latest one.
const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, required: true, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, default: null, trim: true, maxlength: 2000 },
    files: { type: [String], default: [] },
  },
  { _id: false }
);

// Architecture.md §3 `bookings` collection / §6 booking state machine.
const bookingSchema = new mongoose.Schema(
  {
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "VendorProfile", required: true },
    slot: {
      date: { type: Date, required: true },
      startTime: { type: String, required: true }, // "HH:mm"
      endTime: { type: String, required: true },
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "submitted", "completed", "declined", "cancelled", "disputed"],
      default: "pending",
    },
    // Copied from the listing at booking time — the listing's price can
    // change later without touching what was actually agreed to.
    price: { type: Number, required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    // The most recent delivery only. Every delivery (including superseded
    // ones from before a revision request) is kept on the corresponding
    // `submitted` statusHistory entry's `files`.
    submittedFiles: { type: [String], default: [] },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
  },
  { timestamps: true }
);

bookingSchema.index({ vendorId: 1, "slot.date": 1 });
bookingSchema.index({ customerId: 1 });
bookingSchema.index({ status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
