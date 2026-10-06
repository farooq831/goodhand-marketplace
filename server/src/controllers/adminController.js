const VendorProfile = require("../models/VendorProfile");
const adminService = require("../services/adminService");

async function getPendingVendors(req, res, next) {
  try {
    const vendors = await VendorProfile.find({ isVerified: false })
      .sort({ createdAt: 1 })
      .populate("userId", "name email status");
    res.json({ vendors });
  } catch (err) {
    next(err);
  }
}

async function getDisputes(req, res, next) {
  try { res.json({ disputes: await adminService.getDisputes() }); } catch (err) { next(err); }
}

async function resolveDispute(req, res, next) {
  try {
    res.json(await adminService.resolveDispute(req.params.id, req.user, req.body.action, req.body.note));
  } catch (err) { next(err); }
}

async function getAnalytics(req, res, next) {
  try { res.json({ analytics: await adminService.getAnalytics() }); } catch (err) { next(err); }
}

async function setUserStatus(req, res, next) {
  try { res.json({ user: await adminService.setUserStatus(req.params.id, req.body.status) }); } catch (err) { next(err); }
}

async function getUsers(req, res, next) {
  try {
    const User = require("../models/User");
    const users = await User.find({ role: { $in: ["customer", "vendor"] } }).sort({ createdAt: -1 }).select("name email role status isVerified");
    res.json({ users });
  } catch (err) { next(err); }
}

module.exports = { getPendingVendors, getDisputes, resolveDispute, getAnalytics, setUserStatus, getUsers };
