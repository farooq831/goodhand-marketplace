const User = require("../models/User");

// For actions that commit someone to a transaction (booking, applying as a
// vendor): the address must be real, or we can't reach them about it.
// Runs after `authenticate`, which only carries id + role from the JWT.
async function requireVerifiedEmail(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("emailVerified");
    if (!user?.emailVerified) {
      return res.status(403).json({ message: "Please verify your email address first — check your inbox for the link, or resend it from the banner at the top of the page." });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireVerifiedEmail;
