/**
 * Catch-all Express error handler. Route/controller code can pass
 * errors to next(err) and this normalizes the response shape.
 */
function errorHandler(err, req, res, next) {
  let statusCode = res.statusCode !== 200 ? res.statusCode : err.statusCode || err.status || 500;

  // Mongoose schema validation and malformed ObjectIds (e.g. a garbage
  // :id in the URL) are client errors, not server errors.
  if (err.name === "ValidationError") statusCode = 400;
  if (err.name === "CastError") statusCode = 400;

  const isProduction = process.env.NODE_ENV === "production";
  const serverError = statusCode >= 500;

  // Unexpected failures: log everything server-side under the request id,
  // but never send internals (driver errors, file paths) to the client.
  if (serverError) {
    console.error(JSON.stringify({ level: "error", requestId: req.id, method: req.method, path: req.originalUrl, message: err.message, stack: err.stack }));
  }

  res.status(statusCode).json({
    message: serverError && isProduction ? "Something went wrong on our side. Please try again." : err.message || "Internal Server Error",
    requestId: req.id,
    stack: isProduction ? undefined : err.stack,
  });
}

module.exports = errorHandler;
