const vendorService = require("../services/vendorService");
const adminService = require("../services/adminService");
const payoutService = require("../services/payoutService");
const auditService = require("../services/auditService");

async function getPendingVendors(req, res, next) {
  try {
    res.json({ vendors: await vendorService.getVerificationQueue(), changeItems: vendorService.CHANGE_ITEMS });
  } catch (err) {
    next(err);
  }
}

async function getDisputes(req, res, next) {
  try { res.json({ disputes: await adminService.getDisputes() }); } catch (err) { next(err); }
}

async function resolveDispute(req, res, next) {
  try {
    const result = await adminService.resolveDispute(req.params.id, req.user, req.body.action, req.body.note);
    await auditService.record("admin.dispute_resolved", { actor: req.user, targetType: "booking", targetId: req.params.id, details: { action: req.body.action, note: req.body.note }, req });
    res.json(result);
  } catch (err) { next(err); }
}

async function getAnalytics(req, res, next) {
  try { res.json({ analytics: await adminService.getAnalytics() }); } catch (err) { next(err); }
}

async function setUserStatus(req, res, next) {
  try {
    const user = await adminService.setUserStatus(req.user, req.params.id, req.body.status);
    await auditService.record(user.status === "suspended" ? "admin.user_suspended" : "admin.user_reactivated", { actor: req.user, targetType: "user", targetId: user._id, details: { email: user.email }, req });
    res.json({ user });
  } catch (err) { next(err); }
}

// Paginated + searchable: this used to return every user in one response,
// which at scale would load the whole collection into memory.
async function getUsers(req, res, next) {
  try {
    res.json(await adminService.listUsers(req.query));
  } catch (err) { next(err); }
}

async function getPendingPayouts(req, res, next) {
  try { res.json({ payouts: await payoutService.getPendingPayouts() }); } catch (err) { next(err); }
}

async function getPayoutHistory(req, res, next) {
  try { res.json({ payouts: await payoutService.getPayoutHistory() }); } catch (err) { next(err); }
}

async function markPayoutPaid(req, res, next) {
  try {
    const payout = await payoutService.markPaid(req.user, req.body || {});
    await auditService.record("admin.payout_marked_paid", { actor: req.user, targetType: "vendor", targetId: payout.vendorId, details: { total: payout.total, count: payout.count, reference: payout.reference }, req });
    res.json({ payout });
  } catch (err) { next(err); }
}

async function getListings(req, res, next) {
  try { res.json(await require("../services/listingService").adminListListings(req.query)); } catch (err) { next(err); }
}

async function moderateListing(req, res, next) {
  try {
    const listing = await require("../services/listingService").moderateListing(req.user, req.params.id, req.body || {});
    await auditService.record("admin.listing_" + req.body?.action, { actor: req.user, targetType: "listing", targetId: listing._id, details: { title: listing.title, reason: req.body?.reason, days: req.body?.days }, req });
    res.json({ listing });
  } catch (err) { next(err); }
}

async function getAuditLog(req, res, next) {
  try { res.json(await auditService.getAuditLog(req.query)); } catch (err) { next(err); }
}

async function getSecurity(req, res, next) {
  try { res.json(await auditService.getSuspiciousActivity()); } catch (err) { next(err); }
}

module.exports = { getPendingVendors, getDisputes, resolveDispute, getAnalytics, setUserStatus, getUsers, getPendingPayouts, getPayoutHistory, markPayoutPaid, getAuditLog, getSecurity, getListings, moderateListing };
