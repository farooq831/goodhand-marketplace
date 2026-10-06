const jwt = require("jsonwebtoken");

// Architecture.md §5: short-lived access token, longer-lived refresh
// token issued alongside it (carried in an httpOnly cookie by the caller).
function generateAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });
}

function generateRefreshToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
}

module.exports = { generateAccessToken, generateRefreshToken };
