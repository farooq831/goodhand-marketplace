const mongoose = require("mongoose");

// Architecture.md §3 `vendorProfiles` collection.
//
// `isVerified` denormalizes the same flag that lives on the owning User
// (the source of truth) — kept in sync by the admin verify endpoint,
// the same pattern Architecture.md already uses for avgRating/reviewCount
// ("denormalized for fast search sort"). Without it, every public search
// would need a join back to `users` just to filter out unapproved vendors.
const vendorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    businessName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    serviceArea: {
      city: { type: String, default: null },
      // GeoJSON Point — required shape for a 2dsphere index (the plain
      // [lng, lat] array in Architecture.md's doc-level schema is the
      // simplified version; this is the real Mongo requirement).
      //
      // Deliberately no `default` on `type` here: a vendor without
      // coordinates is the common case (city-only), and Mongoose applies
      // per-leaf defaults even when the whole `location` object is never
      // set, which used to produce a malformed `{ type: "Point" }` with
      // no coordinates — and the 2dsphere index rejects that on save.
      // vendorService only ever sets `type` and `coordinates` together.
      location: {
        type: { type: String, enum: ["Point"] },
        coordinates: { type: [Number], default: undefined }, // [lng, lat]
      },
    },
    verificationDocs: { type: [String], default: [] },
    isVerified: { type: Boolean, default: false },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

vendorProfileSchema.index({ "serviceArea.location": "2dsphere" });
vendorProfileSchema.index({ category: 1 });

module.exports = mongoose.model("VendorProfile", vendorProfileSchema);
