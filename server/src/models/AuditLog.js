const mongoose = require("mongoose");

// Append-only record of security events and admin decisions: who did what,
// to what, from where. Never updated or deleted by application code.
const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g. "auth.login_failed", "admin.user_suspended"
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorEmail: { type: String, default: "" }, // kept even when there's no account (failed logins)
  targetType: { type: String, default: "" }, // "user" | "vendor" | "booking" | "payment"
  targetId: { type: String, default: "" },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ ip: 1, createdAt: -1 });
// Keep a year of history; MongoDB removes older entries automatically. A
// single-field index serves both sort directions, so this also covers
// "newest first" listing.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
