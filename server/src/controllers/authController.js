const authService = require("../services/authService");
const auditService = require("../services/auditService");

const REFRESH_COOKIE_NAME = "refreshToken";
// Scoped to /api/auth so the refresh token isn't sent on every request,
// only to the endpoints that actually need it (refresh-token, logout).
// In production the client and API live on different sites (e.g. Vercel +
// Render), and a "lax" cookie is never sent on those cross-site XHRs — the
// silent refresh would fail and every page reload would log the user out.
// "none" is what allows it, and browsers only accept "none" with secure.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "none" : "lax",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Device/IP for the session record (and reuse-detection audit).
const metaOf = (req) => ({ ...auditService.requestContext(req), req });

function sendAuthResponse(res, statusCode, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  res.status(statusCode).json({ user, accessToken });
}

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body, metaOf(req));
    await auditService.record("auth.registered", { actor: result.user, details: { role: result.user.role }, req });
    await auditService.trackSignIn(result.user, req);
    sendAuthResponse(res, 201, result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, metaOf(req));
    await auditService.record("auth.login", { actor: result.user, req });
    await auditService.trackSignIn(result.user, req);
    sendAuthResponse(res, 200, result);
  } catch (err) {
    // Failed attempts are what the admin Security page watches for.
    if (err.statusCode === 401 || err.statusCode === 403) {
      await auditService.record("auth.login_failed", { actorEmail: String(req.body?.email || "").toLowerCase().slice(0, 200), details: { reason: err.message }, req });
    }
    next(err);
  }
}

async function googleLogin(req, res, next) {
  try {
    const result = await authService.loginWithGoogle(req.body.credential, metaOf(req));
    await auditService.record("auth.login", { actor: result.user, details: { method: "google" }, req });
    await auditService.trackSignIn(result.user, req);
    sendAuthResponse(res, 200, result);
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const result = await authService.refresh(req.cookies[REFRESH_COOKIE_NAME], metaOf(req));
    sendAuthResponse(res, 200, result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  // End this device's server-side session, then drop the cookie.
  await authService.logout(req.cookies[REFRESH_COOKIE_NAME]);
  // Must repeat the attributes it was set with, or a SameSite=None cookie
  // is not cleared and logout silently fails in production.
  const { maxAge, ...clearOptions } = REFRESH_COOKIE_OPTIONS;
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
  res.status(204).send();
}

async function verifyEmail(req, res, next) {
  try {
    const user = await authService.verifyEmail(req.body?.token);
    await auditService.record("auth.email_verified", { actor: user, req });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function resendVerification(req, res, next) {
  try {
    res.json(await authService.resendVerification(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    await authService.forgotPassword(req.body?.email);
    // Same response whether or not the account exists.
    res.json({ message: "If an account exists for that email, a reset link has been sent." });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const user = await authService.resetPassword(req.body?.token, req.body?.password);
    await auditService.record("auth.password_reset", { actor: user, req });
    // Every old session was just revoked; drop this browser's cookie too.
    const { maxAge, ...clearOptions } = REFRESH_COOKIE_OPTIONS;
    res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
    res.json({ message: "Password updated. You can now log in with your new password." });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, googleLogin, refreshToken, logout, verifyEmail, resendVerification, forgotPassword, resetPassword };
