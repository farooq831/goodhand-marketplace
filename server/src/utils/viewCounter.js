const Listing = require("../models/Listing");

// Listing views are counted in memory and written in one bulk operation
// every few seconds. A database write per page view would turn every popular
// listing into a write hotspot; a few lost counts on a crash are acceptable
// for an analytics number.
const pending = new Map(); // listingId -> count
const FLUSH_MS = 15000;
let timer = null;

function recordView(listingId) {
  const key = String(listingId);
  pending.set(key, (pending.get(key) || 0) + 1);
  if (!timer) {
    timer = setTimeout(flush, FLUSH_MS);
    timer.unref?.(); // never keep the process alive just for this
  }
}

async function flush() {
  timer = null;
  if (!pending.size) return;
  const ops = [...pending].map(([id, n]) => ({ updateOne: { filter: { _id: id }, update: { $inc: { views: n } } } }));
  pending.clear();
  try {
    await Listing.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.error("View counter flush failed:", err.message);
  }
}

module.exports = { recordView, flush };
