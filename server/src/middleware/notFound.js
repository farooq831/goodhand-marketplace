/**
 * Catches requests to routes that don't exist and forwards a 404
 * into the error-handling middleware instead of letting Express
 * fall through to its default HTML error page.
 */
function notFound(req, res, next) {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

module.exports = notFound;
