const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  // "event" messages are written by bookingService on a lifecycle transition
  // (work delivered, revision requested, dispute opened/resolved) rather than
  // typed by a participant. Same collection so the thread reads as one
  // chronological story — the admin's dispute view depends on that — but the
  // UI renders them as system lines, not chat bubbles.
  kind: { type: String, enum: ["user", "event"], default: "user" },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ bookingId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
