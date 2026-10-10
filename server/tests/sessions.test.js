import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { User, makeUser } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const authService = require("../src/services/authService.js");
const AuditLog = require("../src/models/AuditLog.js");

const sessionsOf = async (id) => (await User.findById(id).select("sessions")).sessions;

describe("refresh sessions", () => {
  it("rotation invalidates the previous refresh token (outside the grace window)", async () => {
    const user = await makeUser({ password: "Password1234" });
    const { refreshToken: first } = await authService.login({ email: user.email, password: "Password1234" });
    const { refreshToken: second } = await authService.refresh(first);
    expect(second).not.toBe(first);

    // Simulate the grace window having passed.
    await User.updateOne({ _id: user._id }, { $set: { "sessions.0.rotatedAt": new Date(Date.now() - 60_000) } });
    await expect(authService.refresh(first)).rejects.toMatchObject({ statusCode: 401 });
    // Reuse revoked the whole session — the legitimate token is dead too, and it was audited.
    await expect(authService.refresh(second)).rejects.toMatchObject({ statusCode: 401 });
    expect(await sessionsOf(user._id)).toHaveLength(0);
    expect(await AuditLog.countDocuments({ action: "auth.refresh_reuse" })).toBe(1);
  });

  it("two tabs refreshing at the same moment both stay signed in", async () => {
    const user = await makeUser({ password: "Password1234" });
    const { refreshToken } = await authService.login({ email: user.email, password: "Password1234" });
    const results = await Promise.allSettled([authService.refresh(refreshToken), authService.refresh(refreshToken)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await sessionsOf(user._id)).toHaveLength(1);
  });

  it("each device has its own session; logout ends only that one", async () => {
    const user = await makeUser({ password: "Password1234" });
    const phone = await authService.login({ email: user.email, password: "Password1234" }, { userAgent: "phone" });
    const laptop = await authService.login({ email: user.email, password: "Password1234" }, { userAgent: "laptop" });
    expect(await sessionsOf(user._id)).toHaveLength(2);
    await authService.logout(phone.refreshToken);
    await expect(authService.refresh(phone.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    await expect(authService.refresh(laptop.refreshToken)).resolves.toBeTruthy();
  });

  it("keeps at most 10 sessions", async () => {
    const user = await makeUser({ password: "Password1234" });
    for (let i = 0; i < 12; i++) await authService.login({ email: user.email, password: "Password1234" });
    expect(await sessionsOf(user._id)).toHaveLength(10);
  });
});

describe("Google account linking (pre-hijack defence)", () => {
  it("wipes a password set on an unverified account when the real owner signs in with Google", async () => {
    // Attacker registered the victim's address and set a password; never verified.
    const hijacked = await makeUser({ email: "victim@gmail.com", password: "AttackerPass1", emailVerified: false });
    await authService.login({ email: "victim@gmail.com", password: "AttackerPass1" }); // attacker's session

    await authService.linkGoogleAccount({ googleId: "g-123", email: "victim@gmail.com", name: "Victim" });

    await expect(authService.login({ email: "victim@gmail.com", password: "AttackerPass1" })).rejects.toMatchObject({ statusCode: 401 });
    const after = await User.findById(hijacked._id).select("+passwordHash +sessions");
    expect(after.passwordHash).toBeNull();
    expect(after.emailVerified).toBe(true);
    expect(after.sessions).toHaveLength(1); // only the Google sign-in's own session
  });

  it("keeps the password of an already-verified account when linking Google", async () => {
    const user = await makeUser({ email: "owner@gmail.com", password: "OwnerPass123", emailVerified: true });
    await authService.linkGoogleAccount({ googleId: "g-456", email: "owner@gmail.com", name: "Owner" });
    const after = await User.findById(user._id).select("+passwordHash");
    expect(await bcrypt.compare("OwnerPass123", after.passwordHash)).toBe(true);
  });
});
