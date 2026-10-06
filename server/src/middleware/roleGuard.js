const ApiError = require("../utils/ApiError");

// Usage: router.patch("/:id/verify", authenticate, requireRole("admin"), ...)
// Must run after `authenticate` so req.user is populated.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden: insufficient role"));
    }
    next();
  };
}

module.exports = requireRole;
