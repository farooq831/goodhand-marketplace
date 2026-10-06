// Thrown from services/controllers with an explicit HTTP status; the
// shared errorHandler middleware reads `statusCode` off any error it
// catches, so this is all that's needed to produce a clean response.
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = ApiError;
