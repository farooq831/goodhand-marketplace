const crypto = require("crypto");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

// Server-side refresh sessions with rotation + reuse detection.
//
// Stateless JWT refresh tokens can't be revoked: "rotating" them used to
// issue a new token while the old one stayed valid for its full 7 days, so
// a stolen token worked in parallel with the victim's. Now each device has
// a session {sid, jti}; every refresh replaces the jti, and presenting an
// already-rotated jti (outside a short grace window for two tabs
// refreshing at once) is treated as theft: the whole session is revoked.

const MAX_SESSIONS = 10;
const GRACE_MS = 30 * 1000;
const newId = () => crypto.randomBytes(16).toString("hex");

async function createSession(userId, { userAgent = "", ip = "" } = {}) {
  const now = new Date();
  const session = { sid: newId(), jti: newId(), prevJti: null, rotatedAt: now, createdAt: now, lastUsedAt: now, userAgent: String(userAgent).slice(0, 300), ip };
  // Keep the most recent MAX_SESSIONS (oldest devices fall off).
  await User.updateOne({ _id: userId }, { $push: { sessions: { $each: [session], $sort: { lastUsedAt: -1 }, $slice: MAX_SESSIONS } } });
  return { sid: session.sid, jti: session.jti };
}

async function rotateSession(userId, sid, jti, { ip = "" } = {}, onReuse) {
  if (!sid || !jti) throw new ApiError(401, "Session expired — please log in again");
  const load = () => User.findOne({ _id: userId, "sessions.sid": sid }).select("sessions").lean().then((u) => u?.sessions.find((s) => s.sid === sid));

  let session = await load();
  if (!session) throw new ApiError(401, "Session expired — please log in again");

  if (session.jti === jti) {
    const now = new Date();
    const next = newId();
    const result = await User.updateOne(
      { _id: userId, sessions: { $elemMatch: { sid, jti } } },
      { $set: { "sessions.$.jti": next, "sessions.$.prevJti": jti, "sessions.$.rotatedAt": now, "sessions.$.lastUsedAt": now, "sessions.$.ip": ip } }
    );
    if (result.modifiedCount) return { sid, jti: next };
    session = await load(); // lost a race with another tab — fall through to the grace check
    if (!session) throw new ApiError(401, "Session expired — please log in again");
  }

  // Two tabs refreshing with the same cookie at once: the loser presents the
  // just-rotated jti. Within the grace window, hand it the current one.
  if (session.prevJti === jti && Date.now() - new Date(session.rotatedAt).getTime() < GRACE_MS) {
    return { sid, jti: session.jti };
  }

  // An old refresh token came back: someone kept a copy. Kill the session
  // so neither the thief nor the victim can continue without logging in.
  await User.updateOne({ _id: userId }, { $pull: { sessions: { sid } } });
  if (onReuse) await onReuse();
  throw new ApiError(401, "Your session was ended for security — please log in again");
}

async function revokeSession(userId, sid) {
  if (!userId || !sid) return;
  await User.updateOne({ _id: userId }, { $pull: { sessions: { sid } } });
}

async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $set: { sessions: [] } });
}

async function listSessions(userId) {
  const user = await User.findById(userId).select("sessions").lean();
  return (user?.sessions || []).map(({ sid, createdAt, lastUsedAt, userAgent, ip }) => ({ sid, createdAt, lastUsedAt, userAgent, ip }));
}

module.exports = { createSession, rotateSession, revokeSession, revokeAllSessions, listSessions };
