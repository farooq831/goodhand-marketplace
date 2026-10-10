import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { User, makeUser, makeVendor, makeListing, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const { clean } = require("../src/middleware/sanitizeRequest.js");
const listingService = require("../src/services/listingService.js");
const adminService = require("../src/services/adminService.js");
const auditService = require("../src/services/auditService.js");
const AuditLog = require("../src/models/AuditLog.js");

describe("NoSQL operator injection guard", () => {
  it("drops $-prefixed and dotted keys at any depth, keeps normal data", () => {
    const input = { email: { $gt: "" }, status: { $ne: "x" }, nested: { ok: 1, "a.b": 2, deeper: [{ $where: "1" , keep: "y" }] }, name: "Ali" };
    clean(input);
    expect(input).toEqual({ email: {}, status: {}, nested: { ok: 1, deeper: [{ keep: "y" }] }, name: "Ali" });
  });
});

describe("listing visibility", () => {
  it("a vendor-filtered search never shows an unapproved vendor's listings", async () => {
    const { profile: pending } = await makeVendor({ isVerified: false });
    await makeListing(pending);
    const { profile: approved } = await makeVendor();
    await makeListing(approved);

    expect((await listingService.searchListings({ vendorId: String(pending._id) })).total).toBe(0);
    expect((await listingService.searchListings({ vendorId: String(approved._id) })).total).toBe(1);
    await expect(listingService.searchListings({ vendorId: { $ne: "x" } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("account suspension guards", () => {
  it("admins can't suspend themselves or other admins, but can suspend customers", async () => {
    const admin = await makeUser({ role: "admin" });
    const otherAdmin = await makeUser({ role: "admin" });
    const customer = await makeUser();
    const req = requesterFor(admin);
    await expect(adminService.setUserStatus(req, admin._id, "suspended")).rejects.toMatchObject({ statusCode: 400 });
    await expect(adminService.setUserStatus(req, otherAdmin._id, "suspended")).rejects.toMatchObject({ statusCode: 403 });
    const user = await adminService.setUserStatus(req, customer._id, "suspended");
    expect(user.status).toBe("suspended");
  });
});

describe("login monitoring and device tracking", () => {
  const fakeReq = (ua, ip = "203.0.113.7") => ({ ip, get: (h) => (h === "user-agent" ? ua : undefined) });

  it("flags repeated failed logins by account and by network", async () => {
    for (let i = 0; i < 6; i++) await auditService.record("auth.login_failed", { actorEmail: "victim@example.com", req: fakeReq("curl/8") });
    for (const email of ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]) await auditService.record("auth.login_failed", { actorEmail: email, req: fakeReq("bot", "198.51.100.9") });

    const report = await auditService.getSuspiciousActivity();
    expect(report.byEmail.find((r) => r.email === "victim@example.com")).toMatchObject({ count: 6, flagged: true });
    expect(report.byIp.find((r) => r.ip === "198.51.100.9")).toMatchObject({ distinct: 5, flagged: true });
  });

  it("alerts the owner only when a second, different device signs in", async () => {
    const Notification = require("../src/models/Notification.js");
    const user = await makeUser();
    const chrome = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1";

    expect((await auditService.trackSignIn(user, fakeReq(chrome))).newDevice).toBe(false); // first ever device
    expect((await auditService.trackSignIn(user, fakeReq(chrome))).newDevice).toBe(false); // same device again
    expect((await auditService.trackSignIn(user, fakeReq(iphone))).newDevice).toBe(true);
    const alert = await Notification.findOne({ userId: user._id, type: "new_sign_in" });
    expect(alert.payload.device).toBe("Safari on iOS");
    expect((await User.findById(user._id).select("knownDevices")).knownDevices).toHaveLength(2);
    expect(await AuditLog.countDocuments({ action: "auth.new_device", actorId: user._id })).toBe(1);
  });
});
