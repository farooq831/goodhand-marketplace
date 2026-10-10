const mongoose = require("mongoose");

// Architecture.md §3 `listings` collection.
const listingSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorProfile",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1 },
    photos: { type: [String], default: [] },
    availabilityRules: {
      daysOfWeek: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0=Sun .. 6=Sat
      startTime: { type: String, default: "09:00" }, // "HH:mm"
      endTime: { type: String, default: "17:00" },
    },
    // Where the work happens. "customer" (the default — home repair,
    // cleaning, home tuition) makes checkout collect the service address.
    serviceLocation: { type: String, enum: ["customer", "vendor", "online"], default: "customer" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Public search: active listings by category/price, and per-vendor pages.
listingSchema.index({ isActive: 1, category: 1, price: 1 });
listingSchema.index({ vendorId: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model("Listing", listingSchema);
