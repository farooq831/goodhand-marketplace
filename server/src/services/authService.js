const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateTokens");
const { OAuth2Client } = require("google-auth-library");

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
  if (!user || user.status === "suspended") {
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
  if (!user) user = await User.create({ googleId, email, name, avatarUrl: picture || null, isVerified: true });
  else if (!user.googleId) {
    user.googleId = googleId;
    if (!user.avatarUrl && picture) user.avatarUrl = picture;
    await user.save();
  }
  return issueTokens(user);
}

function issueTokens(user) {
  return {
    user,
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
}

module.exports = { register, login, loginWithGoogle, refresh };
