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
    // Legacy untyped document URLs. Superseded by `documents`; the startup
    // backfill (vendorService.backfillVerification) moves them across as
    // type "other". Never exposed publicly.
    verificationDocs: { type: [String], default: [] },

    // --- Verification (private: only the owner and admins ever see these) ---
    cnicNumber: { type: String, trim: true, default: "" },
    documents: {
      type: [
        {
          type: { type: String, enum: ["cnic_front", "cnic_back", "business_proof", "other"], required: true },
          url: { type: String, required: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // pending → (changes_requested ⇄ pending) → approved. `isVerified` below
    // stays the search-facing boolean and is true exactly when "approved".
    verificationStatus: {
      type: String,
      enum: ["pending", "changes_requested", "approved"],
      default: "pending",
    },
    // Append-only audit trail of the review conversation.
    reviewHistory: {
      type: [
        {
          action: { type: String, enum: ["submitted", "changes_requested", "resubmitted", "approved"], required: true },
          items: { type: [String], default: [] }, // CHANGE_ITEMS keys, for changes_requested
          note: { type: String, default: "" },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // Where the admin sends this vendor's released earnings. Private.
    payoutMethod: {
      type: { type: String, enum: ["bank", "jazzcash", "easypaisa", null], default: null },
      accountTitle: { type: String, trim: true, default: "" },
      accountNumber: { type: String, trim: true, default: "" }, // IBAN / account no., or mobile wallet number
      bankName: { type: String, trim: true, default: "" },
    },

    // Days off (holidays, illness, travel). Dates are UTC midnights, both
    // ends inclusive — the same convention as Booking.slot.date. Applies to
    // all of the vendor's listings.
    timeOff: {
      type: [
        {
          from: { type: Date, required: true },
          to: { type: Date, required: true },
          reason: { type: String, trim: true, maxlength: 120, default: "" },
        },
      ],
      default: [],
    },

    // Public gallery of past work (shown on the vendor profile).
    portfolio: {
      type: [{ url: { type: String, required: true }, caption: { type: String, trim: true, maxlength: 120, default: "" } }],
      default: [],
    },
    // 0-100, maintained by trustService — drives "Recommended" ranking.
    trustScore: { type: Number, default: 60, min: 0, max: 100 },

    isVerified: { type: Boolean, default: false },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

vendorProfileSchema.index({ "serviceArea.location": "2dsphere" });
vendorProfileSchema.index({ category: 1 });
// Search allowlist (verified, rating filter) and the admin verification queue.
vendorProfileSchema.index({ isVerified: 1, avgRating: -1 });
vendorProfileSchema.index({ isVerified: 1, trustScore: -1 });
vendorProfileSchema.index({ verificationStatus: 1, createdAt: 1 });

module.exports = mongoose.model("VendorProfile", vendorProfileSchema);
