const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateTokens");
const { OAuth2Client } = require("google-auth-library");
const emailService = require("./emailService");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Never let a client register themselves as "admin".
const ALLOWED_SIGNUP_ROLES = ["customer", "vendor"];

async function register({ name, email, password, role }) {
  if (!name || !email || !password) {
    throw new ApiError(400, "name, email, and password are required");
  }
  if (password.length < 8) {
    throw new ApiError(400, "password must be at least 8 characters");
  }

  const safeRole = ALLOWED_SIGNUP_ROLES.includes(role) ? role : "customer";
  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await User.create({ name, email, passwordHash, role: safeRole });
  } catch (err) {
    // Race-safe duplicate check: rely on the unique index instead of a
    // separate findOne (which would leave a TOCTOU gap).
    if (err.code === 11000) {
      throw new ApiError(409, "An account with this email already exists");
    }
    throw err;
  }

  await sendVerificationEmail(user).catch((err) => console.error("Verification email failed:", err.message));
  return issueTokens(user);
}

async function login({ email, password }) {
  if (!email || !password) {
    throw new ApiError(400, "email and password are required");
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !user.passwordHash) {
    // Same message whether the email doesn't exist or the account is
    // Google-only — don't leak which one it is.
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.status === "suspended") {
    throw new ApiError(403, "This account has been suspended");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  return issueTokens(user);
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new ApiError(401, "Missing refresh token");
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(payload.id);
  // tv missing on tokens issued before tokenVersion existed counts as 0.
  if (!user || user.status === "suspended" || (payload.tv || 0) !== (user.tokenVersion || 0)) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // Rotate both tokens on every refresh (Architecture.md §5).
  return issueTokens(user);
}

async function loginWithGoogle(credential) {
  if (!credential || !process.env.GOOGLE_CLIENT_ID) throw new ApiError(503, "Google login is not configured");
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
  } catch (err) {
    throw new ApiError(401, "Invalid Google credential");
  }
  const { sub: googleId, email, name, picture } = ticket.getPayload();
  let user = await User.findOne({ $or: [{ googleId }, { email }] });
  if (user?.status === "suspended") throw new ApiError(403, "This account has been suspended");
  // Google has already verified the address.
  if (!user) user = await User.create({ googleId, email, name, avatarUrl: picture || null, emailVerified: true });
  else if (!user.googleId) {
    user.googleId = googleId;
    user.emailVerified = true;
    if (!user.avatarUrl && picture) user.avatarUrl = picture;
    await user.save();
  }
  return issueTokens(user);
}

// Raw token goes in the emailed link; only its hash is stored.
function makeToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}
const hashToken = (raw) => crypto.createHash("sha256").update(String(raw)).digest("hex");

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const appUrl = emailService.appUrl;

async function sendVerificationEmail(user) {
  if (user.emailVerified) return;
  const { raw, hash } = makeToken();
  await User.updateOne({ _id: user._id }, { emailVerifyTokenHash: hash, emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS) });
  await emailService.sendAccountEmail(user, "Confirm your email for Goodhand", [
    "Welcome to Goodhand! Please confirm this is your email address:",
    "",
    appUrl(`/verify-email?token=${raw}`),
    "",
    "The link is valid for 24 hours. If you didn't create an account, you can ignore this email.",
  ], "verify_email");
}

async function resendVerification(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  if (user.emailVerified) return { alreadyVerified: true };
  await sendVerificationEmail(user);
  return { sent: true };
}

async function verifyEmail(token) {
  if (!token) throw new ApiError(400, "Verification token is required");
  const user = await User.findOne({ emailVerifyTokenHash: hashToken(token), emailVerifyExpires: { $gt: new Date() } });
  if (!user) throw new ApiError(400, "This verification link is invalid or has expired. Request a new one.");
  user.emailVerified = true;
  user.emailVerifyTokenHash = null;
  user.emailVerifyExpires = null;
  await user.save();
  return user;
}

// Always succeeds from the caller's point of view, so the endpoint can't be
// used to find out which emails have accounts.
async function forgotPassword(email) {
  if (!email) throw new ApiError(400, "Email is required");
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || user.status === "suspended") return;
  const { raw, hash } = makeToken();
  await User.updateOne({ _id: user._id }, { passwordResetTokenHash: hash, passwordResetExpires: new Date(Date.now() + RESET_TTL_MS) });
  await emailService.sendAccountEmail(user, "Reset your Goodhand password", [
    "We received a request to reset your password. Choose a new one here:",
    "",
    appUrl(`/reset-password?token=${raw}`),
    "",
    "The link is valid for 1 hour and can be used once. If you didn't ask for this, ignore this email — your password stays the same.",
  ], "password_reset");
}

async function resetPassword(token, password) {
  if (!token) throw new ApiError(400, "Reset token is required");
  if (!password || password.length < 8) throw new ApiError(400, "password must be at least 8 characters");
  const user = await User.findOne({ passwordResetTokenHash: hashToken(token), passwordResetExpires: { $gt: new Date() } });
  if (!user) throw new ApiError(400, "This reset link is invalid or has expired. Request a new one.");

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  // Clicking the emailed link proves inbox access.
  user.emailVerified = true;
  // Signs out every existing session — if someone else knew the old
  // password, their refresh token stops working now.
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
}

// Accounts created before email verification existed are grandfathered in.
async function backfillEmailVerified() {
  await User.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } });
}

function issueTokens(user) {
  return {
    user,
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
}

module.exports = {
  register,
  login,
  loginWithGoogle,
  refresh,
  resendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  backfillEmailVerified,
};
