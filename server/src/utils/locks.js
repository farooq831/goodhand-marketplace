const mongoose = require("mongoose");
const ApiError = require("./ApiError");

// A tiny distributed mutex on MongoDB: a document with a unique key exists
// only while someone holds the lock. Works across any number of API
// instances without Redis or transactions. Locks expire (TTL + an explicit
// staleness check) so a crashed holder can't block forever.
const lockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Lock = mongoose.models.Lock || mongoose.model("Lock", lockSchema);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withLock(key, fn, { ttlMs = 15000, waitMs = 3000 } = {}) {
  // The mutex IS the unique index. Mongoose builds indexes asynchronously,
  // so on a fresh deploy/database the first requests could run before it
  // exists and the "lock" would silently allow everyone in. Model.init()
  // resolves once the indexes are built (cached after the first call).
  await Lock.init();
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await Lock.create({ key, expiresAt: new Date(Date.now() + ttlMs) });
      break;
    } catch (err) {
      if (err.code !== 11000) throw err;
      // Clear a lock whose holder died without releasing it.
      await Lock.deleteOne({ key, expiresAt: { $lt: new Date() } });
      if (Date.now() > deadline) throw new ApiError(409, "Someone else is updating this schedule right now — please try again");
      await sleep(25 + Math.random() * 50);
    }
  }
  try {
    return await fn();
  } finally {
    await Lock.deleteOne({ key }).catch(() => {});
  }
}

// Serializes everything that can claim a vendor's time on one day.
function vendorDayKey(vendorId, date) {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return `vendor-day:${vendorId}:${day.toISOString().slice(0, 10)}`;
}

module.exports = { withLock, vendorDayKey, Lock };
