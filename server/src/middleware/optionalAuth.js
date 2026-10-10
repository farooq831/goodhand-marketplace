const jwt = require("jsonwebtoken");

// Like `authenticate`, but never rejects — just leaves req.user undefined
// if there's no token or it doesn't verify. For endpoints that are public
// but behave differently for the resource's owner or an admin (e.g. a
// listing detail page showing an unpublished listing to its own vendor).
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    } catch {
      // invalid/expired — treat the request as anonymous rather than failing
    }
  }
  next();
}

module.exports = optionalAuth;
