// "HH:mm" time-of-day helpers shared by listing availability and booking
// conflict checks. Kept as plain string math (no Date objects) since
// availabilityRules.startTime/endTime are stored as "HH:mm" strings.

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(time, minutesToAdd) {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

function doRangesOverlap(startA, endA, startB, endB) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

// Candidate booking start times within [windowStart, windowEnd) that fully
// fit `durationMinutes`, stepped by that same duration.
function generateSlotsForWindow(windowStart, windowEnd, durationMinutes) {
  const slots = [];
  let cursor = timeToMinutes(windowStart);
  const end = timeToMinutes(windowEnd);
  while (cursor + durationMinutes <= end) {
    slots.push({ startTime: minutesToTime(cursor), endTime: minutesToTime(cursor + durationMinutes) });
    cursor += durationMinutes;
  }
  return slots;
}

module.exports = { timeToMinutes, minutesToTime, addMinutes, doRangesOverlap, generateSlotsForWindow };
