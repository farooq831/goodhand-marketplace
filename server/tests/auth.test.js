import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { User, makeUser } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const authService = require("../src/services/authService.js");
const { generateRefreshToken } = require("../src/utils/generateTokens.js");

const sha256 = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

// The raw token only ever exists in the emailed link, so tests plant a
// known one by storing its hash the same way the service does.
async function plant(user, kind, { expiresInMs = 60_000 } = {}) {
  const raw = crypto.randomBytes(32).toString("hex");
  const fields = kind === "verify"
    ? { emailVerifyTokenHash: sha256(raw), emailVerifyExpires: new Date(Date.now() + expiresInMs) }
    : { passwordResetTokenHash: sha256(raw), passwordResetExpires: new Date(Date.now() + expiresInMs) };
  await User.updateOne({ _id: user._id }, fields);
  return raw;
}

describe("email verification", () => {
  it("new sign-ups start unverified and receive a stored (hashed) token", async () => {
    const { user } = await authService.register({ name: "New", email: "new.user@example.com", password: "Password1234" });
    expect(user.emailVerified).toBe(false);
    const stored = await User.findById(user._id).select("+emailVerifyTokenHash +emailVerifyExpires");
    expect(stored.emailVerifyTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.emailVerifyExpires.getTime()).toBeGreaterThan(Date.now());
  });

  it("a valid token verifies the email and can't be reused", async () => {
    const user = await makeUser({ emailVerified: false });
    const raw = await plant(user, "verify");
    await authService.verifyEmail(raw);
    expect((await User.findById(user._id)).emailVerified).toBe(true);
    await expect(authService.verifyEmail(raw)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("an expired or made-up token is rejected", async () => {
    const user = await makeUser({ emailVerified: false });
    const raw = await plant(user, "verify", { expiresInMs: -1000 });
    await expect(authService.verifyEmail(raw)).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.verifyEmail("not-a-real-token")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("serialized users never include token hashes or the token version", async () => {
    const user = await makeUser();
    await plant(user, "reset");
    const json = JSON.parse(JSON.stringify(await User.findById(user._id).select("+passwordResetTokenHash +passwordHash")));
    for (const field of ["passwordHash", "passwordResetTokenHash", "passwordResetExpires", "tokenVersion"]) expect(json).not.toHaveProperty(field);
  });
});

describe("password reset", () => {
  it("forgot-password for an unknown email quietly does nothing", async () => {
    await expect(authService.forgotPassword("nobody@example.com")).resolves.toBeUndefined();
  });

  it("forgot-password stores a 1-hour token for a real account", async () => {
    const user = await makeUser();
    await authService.forgotPassword(user.email.toUpperCase());
    const stored = await User.findById(user._id).select("+passwordResetTokenHash +passwordResetExpires");
    expect(stored.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const minutes = (stored.passwordResetExpires - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(55);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it("resetting changes the password, is single-use, and signs out existing sessions", async () => {
    const user = await makeUser({ password: "OldPassword1" });
    const sessionService = require("../src/services/sessionService.js");
    const oldRefresh = generateRefreshToken(await User.findById(user._id), await sessionService.createSession(user._id));
    await expect(authService.refresh(oldRefresh)).resolves.toBeTruthy();

    const raw = await plant(user, "reset");
    await authService.resetPassword(raw, "NewPassword1");

    const after = await User.findById(user._id).select("+passwordHash");
    expect(await bcrypt.compare("NewPassword1", after.passwordHash)).toBe(true);
    await expect(authService.login({ email: user.email, password: "OldPassword1" })).rejects.toMatchObject({ statusCode: 401 });
    await expect(authService.login({ email: user.email, password: "NewPassword1" })).resolves.toBeTruthy();
    // The refresh token issued before the reset no longer works.
    await expect(authService.refresh(oldRefresh)).rejects.toMatchObject({ statusCode: 401 });
    await expect(authService.resetPassword(raw, "Another1234")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a too-short password and an expired link", async () => {
    const user = await makeUser();
    const raw = await plant(user, "reset");
    await expect(authService.resetPassword(raw, "short")).rejects.toMatchObject({ statusCode: 400 });
    const expired = await plant(user, "reset", { expiresInMs: -1000 });
    await expect(authService.resetPassword(expired, "LongEnough1")).rejects.toMatchObject({ statusCode: 400 });
  });
});
