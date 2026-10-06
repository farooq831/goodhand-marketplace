const mongoose = require("mongoose");

// Architecture.md §3 `notifications` collection. `type` is deliberately a
// free-form string, not an enum — the doc lists it as illustrative
// ("booking_request" | "payment_confirmed" | etc.), and new event types
// (messages, reviews) get added as those features are built without a
// schema migration.
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
