// NoSQL operator injection guard. Express parses `?status[$ne]=x` and JSON
// bodies like {"email": {"$gt": ""}} into objects, which Mongoose would pass
// straight to MongoDB as query operators. Every key that starts with "$" or
// contains "." is dropped from body, query and params before any route runs,
// so client input can only ever be data, never a query operator.

const MAX_DEPTH = 10;

function isUnsafeKey(key) {
  return key.startsWith("$") || key.includes(".");
}

function clean(value, depth = 0) {
  if (depth > MAX_DEPTH) return undefined;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const key of Object.keys(value)) {
      if (isUnsafeKey(key)) delete value[key];
      else value[key] = clean(value[key], depth + 1);
    }
  }
  return value;
}

function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) clean(req.body);
  if (req.query) clean(req.query);
  if (req.params) clean(req.params);
  next();
}

module.exports = sanitizeRequest;
module.exports.clean = clean;
