const rateLimit = require("express-rate-limit");

// Off under test so the suite can hammer endpoints freely.
const skip = () => process.env.NODE_ENV === "test";

const make = (options) =>
  rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip,
    handler: (req, res, _next, opts) => res.status(429).json({ message: opts.message }),
    ...options,
  });

// Password guessing: only *failed* logins count, so normal use is never
// throttled but brute force is stopped after a handful of wrong guesses.
const loginLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  skipSuccessfulRequests: true,
  message: "Too many failed login attempts. Please wait 15 minutes and try again.",
});

// Account creation spam.
const registerLimiter = make({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: "Too many accounts created from this network. Please try again later.",
});

// Endpoints that send email — stop them being used to flood an inbox.
const emailLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many email requests. Please wait a few minutes and try again.",
});

// Broad safety net for the whole API.
const apiLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  message: "Too many requests. Please slow down.",
});

module.exports = { loginLimiter, registerLimiter, emailLimiter, apiLimiter };
