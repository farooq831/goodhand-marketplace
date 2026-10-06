/**
 * Catch-all Express error handler. Route/controller code can pass
 * errors to next(err) and this normalizes the response shape.
 */
function errorHandler(err, req, res, next) {
  let statusCode = res.statusCode !== 200 ? res.statusCode : err.statusCode || 500;

  // Mongoose schema validation and malformed ObjectIds (e.g. a garbage
  // :id in the URL) are client errors, not server errors.
  if (err.name === "ValidationError") statusCode = 400;
  if (err.name === "CastError") statusCode = 400;

  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
}

module.exports = errorHandler;
