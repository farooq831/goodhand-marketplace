const vendorService = require("../services/vendorService");
const auditService = require("../services/auditService");

async function create(req, res, next) {
  try {
    const profile = await vendorService.createProfile(req.user.id, req.body);
    res.status(201).json({ vendorProfile: profile });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const profile = await vendorService.getById(req.params.id);
    res.json({ vendorProfile: profile });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const profile = await vendorService.updateProfile(req.params.id, req.user, req.body);
    res.json({ vendorProfile: profile });
  } catch (err) {
    next(err);
  }
}

async function verify(req, res, next) {
  try {
    const profile = await vendorService.verifyVendor(req.params.id, req.user, req.body?.note);
    await auditService.record("admin.vendor_approved", { actor: req.user, targetType: "vendor", targetId: profile._id, details: { businessName: profile.businessName }, req });
    res.json({ vendorProfile: profile });
  } catch (err) {
    next(err);
  }
}

async function requestChanges(req, res, next) {
  try {
    const profile = await vendorService.requestChanges(req.params.id, req.user, req.body || {});
    await auditService.record("admin.vendor_changes_requested", { actor: req.user, targetType: "vendor", targetId: profile._id, details: { items: req.body?.items, note: req.body?.note }, req });
    res.json({ vendorProfile: profile });
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    const profile = await vendorService.getByUserId(req.user.id);
    res.json({ vendorProfile: profile }); // null if the vendor hasn't created one yet
  } catch (err) {
    next(err);
  }
}

async function addTimeOff(req, res, next) {
  try {
    res.status(201).json(await vendorService.addTimeOff(req.user.id, req.body || {}));
  } catch (err) {
    next(err);
  }
}

async function removeTimeOff(req, res, next) {
  try {
    res.json(await vendorService.removeTimeOff(req.user.id, req.params.entryId));
  } catch (err) {
    next(err);
  }
}

async function getMyStats(req, res, next) {
  try {
    res.json({ stats: await vendorService.getMyStats(req.user.id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, update, verify, requestChanges, getMine, addTimeOff, removeTimeOff, getMyStats };
