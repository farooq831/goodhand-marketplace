const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "VendorProfile", required: true },
  authorRole: { type: String, enum: ["customer", "vendor"], default: "customer" },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, maxlength: 2000 },
  vendorResponse: { type: String, default: null, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

reviewSchema.index({ bookingId: 1, authorRole: 1 }, { unique: true });
reviewSchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
