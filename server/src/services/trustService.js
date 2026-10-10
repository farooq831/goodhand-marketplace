const Booking = require("../models/Booking");
const Review = require("../models/Review");
const VendorProfile = require("../models/VendorProfile");

// Provider trust score (0-100) — the basis of "Recommended" ranking.
//
// A raw average lets one 5-star review outrank fifty 4.8s, so the rating
// part uses a Bayesian average pulled toward a 4.0 prior until a vendor
// has enough reviews to speak for themselves. Reliability (finishing what
// they accept, answering requests) matters as much as stars, and disputes
// cost points. Brand-new vendors start mid-pack, not at zero, so they can
// still be discovered.
const PRIOR_RATING = 4.0;
const PRIOR_WEIGHT = 5;

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

function scoreFrom({ ratingSum, ratingCount, completed, cancelled, disputed, declined, pending, isVerified, documentsComplete }) {
  const bayes = (PRIOR_RATING * PRIOR_WEIGHT + ratingSum) / (PRIOR_WEIGHT + ratingCount);
  const rating = clamp((bayes - 1) / 4); // 1..5 → 0..1

  const settled = completed + cancelled + disputed;
  const completion = settled ? completed / settled : 0.8;

  const responded = completed + cancelled + disputed + declined;
  const response = responded + pending ? responded / (responded + pending) : 0.8;

  const experience = clamp(completed / 20);
  const verification = (isVerified ? 0.7 : 0) + (documentsComplete ? 0.3 : 0);
  const disputeRate = settled ? disputed / settled : 0;

  const score = 40 * rating + 20 * completion + 15 * response + 10 * verification + 15 * experience - 30 * disputeRate;
  return Math.round(clamp(score, 0, 100));
}

async function computeTrustScore(vendorId) {
  const [profile, statusCounts, ratings] = await Promise.all([
    VendorProfile.findById(vendorId).select("isVerified documents"),
    Booking.aggregate([{ $match: { vendorId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Review.aggregate([{ $match: { vendorId, authorRole: "customer" } }, { $group: { _id: null, sum: { $sum: "$rating" }, count: { $sum: 1 } } }]),
  ]);
  if (!profile) return null;
  const count = (status) => statusCounts.find((s) => s._id === status)?.n || 0;
  const docTypes = new Set((profile.documents || []).map((d) => d.type));
  return scoreFrom({
    ratingSum: ratings[0]?.sum || 0,
    ratingCount: ratings[0]?.count || 0,
    completed: count("completed"),
    cancelled: count("cancelled"),
    disputed: count("disputed"),
    declined: count("declined"),
    pending: count("pending"),
    isVerified: profile.isVerified,
    documentsComplete: docTypes.has("cnic_front") && docTypes.has("cnic_back"),
  });
}

// Never throws — ranking freshness must not break the action that triggered it.
async function recomputeTrustScore(vendorId) {
  try {
    const score = await computeTrustScore(vendorId);
    if (score != null) await VendorProfile.updateOne({ _id: vendorId }, { trustScore: score });
    // Ratings, trust and approval all feed search ranking on the listings.
    await require("./listingSync").syncListingsForVendor(vendorId);
    return score;
  } catch (err) {
    console.error(`Trust score update failed for ${vendorId}:`, err.message);
    return null;
  }
}

async function recomputeAll() {
  const ids = await VendorProfile.find().distinct("_id");
  for (const id of ids) await recomputeTrustScore(id);
  return ids.length;
}

// Customer reliability, shown to a vendor deciding on a request: someone
// who often cancels or disputes is a risk worth knowing about.
async function customerStats(customerId) {
  const counts = await Booking.aggregate([{ $match: { customerId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  const count = (status) => counts.find((s) => s._id === status)?.n || 0;
  const completed = count("completed");
  const cancelled = count("cancelled");
  const disputed = count("disputed");
  const settled = completed + cancelled + disputed;
  return {
    completed,
    cancelled,
    disputed,
    reliability: settled >= 2 ? Math.round((completed / settled) * 100) : null, // null = too new to judge
  };
}

module.exports = { recomputeTrustScore, recomputeAll, computeTrustScore, customerStats, scoreFrom };
