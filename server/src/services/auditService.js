const crypto = require("crypto");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const notificationService = require("./notificationService");

// Where a request came from. `trust proxy` is set in server.js, so req.ip is
// the real client behind Render/Vercel's proxy.
function requestContext(req) {
  return {
    ip: req?.ip || "",
    userAgent: String(req?.get?.("user-agent") || "").slice(0, 300),
  };
}

// Never throws: an audit failure must not break the action being audited.
async function record(action, { actor, actorEmail = "", targetType = "", targetId = "", details = {}, req } = {}) {
  try {
    await AuditLog.create({
      action,
      actorId: actor?.id || actor?._id || null,
      actorEmail: actorEmail || actor?.email || "",
      targetType,
      targetId: targetId ? String(targetId) : "",
      details,
      ...requestContext(req),
    });
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
}

// --- Device tracking -------------------------------------------------------

// A device is identified by its browser/OS string. IPs change constantly on
// mobile networks, so they're recorded but not part of the identity.
const deviceId = (userAgent) => crypto.createHash("sha256").update(userAgent || "unknown").digest("hex").slice(0, 32);

function describeDevice(userAgent = "") {
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "a browser";
  const os = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "an unknown device";
  return `${browser} on ${os}`;
}

const MAX_DEVICES = 10;

// Called after a successful sign-in. Remembers the device and, if this
// account has signed in before from somewhere else, alerts the owner — the
// "was this you?" check that catches stolen passwords.
async function trackSignIn(user, req) {
  const { ip, userAgent } = requestContext(req);
  const id = deviceId(userAgent);
  try {
    const fresh = await User.findById(user._id).select("knownDevices");
    const devices = fresh?.knownDevices || [];
    const known = devices.find((d) => d.key === id);
    if (known) {
      await User.updateOne({ _id: user._id, "knownDevices.key": id }, { $set: { "knownDevices.$.lastSeenAt": new Date(), "knownDevices.$.ip": ip } });
      return { newDevice: false };
    }
    const next = [...devices, { key: id, label: describeDevice(userAgent), ip, firstSeenAt: new Date(), lastSeenAt: new Date() }]
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, MAX_DEVICES);
    await User.updateOne({ _id: user._id }, { $set: { knownDevices: next } });
    if (devices.length > 0) {
      await notificationService
        .createNotification(user._id, "new_sign_in", { device: describeDevice(userAgent), ip, at: new Date().toISOString() })
        .catch((err) => console.error("Sign-in alert failed:", err.message));
      await record("auth.new_device", { actor: user, details: { device: describeDevice(userAgent) }, req });
    }
    return { newDevice: devices.length > 0 };
  } catch (err) {
    console.error("Device tracking failed:", err.message);
    return { newDevice: false };
  }
}

// --- Admin views -----------------------------------------------------------

async function getAuditLog({ action, page = 1, limit = 50 } = {}) {
  const filter = {};
  if (typeof action === "string" && action) filter.action = action.endsWith(".") ? { $regex: `^${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } : action;
  const size = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (Math.min(1000, Math.max(1, Number(page) || 1)) - 1) * size;
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(size).populate("actorId", "name email role").lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { entries, total, page: Math.max(1, Number(page) || 1), limit: size };
}

// Failed sign-ins in the last 24h, grouped by account and by network —
// a burst against one email is password guessing; a burst from one IP
// across many emails is credential stuffing.
async function getSuspiciousActivity() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const match = { action: "auth.login_failed", createdAt: { $gte: since } };
  const [byEmail, byIp, newDevices] = await Promise.all([
    AuditLog.aggregate([{ $match: match }, { $group: { _id: "$actorEmail", count: { $sum: 1 }, ips: { $addToSet: "$ip" }, last: { $max: "$createdAt" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
    AuditLog.aggregate([{ $match: match }, { $group: { _id: "$ip", count: { $sum: 1 }, emails: { $addToSet: "$actorEmail" }, last: { $max: "$createdAt" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
    AuditLog.countDocuments({ action: "auth.new_device", createdAt: { $gte: since } }),
  ]);
  const shape = (rows, key, listKey) => rows.map((r) => ({ [key]: r._id, count: r.count, [listKey]: (r[listKey] || []).slice(0, 5), distinct: (r[listKey] || []).length, last: r.last, flagged: r.count >= 5 || (r[listKey] || []).length >= 5 }));
  return { byEmail: shape(byEmail, "email", "ips"), byIp: shape(byIp, "ip", "emails"), newDevices };
}

module.exports = { record, trackSignIn, getAuditLog, getSuspiciousActivity, requestContext, describeDevice };
