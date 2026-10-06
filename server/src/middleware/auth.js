const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");

// Verifies the access token from the Authorization header and attaches
// its payload ({ id, role }) as req.user. Socket auth in src/sockets
// verifies the same token with the same secret, independently.
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, "Not authenticated"));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch (err) {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

module.exports = authenticate;
