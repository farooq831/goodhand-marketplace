// Shared date logic for vendor time off. Booking dates and time-off bounds
// are both stored as UTC midnights, so comparisons are on whole days.

function toUtcDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** The time-off entry covering `date`, if any. */
function blockingEntry(timeOff = [], date) {
  const day = toUtcDay(date);
  if (!day) return null;
  return timeOff.find((entry) => entry.from <= day && day <= entry.to) || null;
}

/** Mongo condition: no time-off entry covers `day` (for VendorProfile queries). */
function notOnTimeOff(day) {
  return { $not: { $elemMatch: { from: { $lte: day }, to: { $gte: day } } } };
}

module.exports = { toUtcDay, blockingEntry, notOnTimeOff };
