const Stripe = require("stripe");
const ApiError = require("../utils/ApiError");

// Keep non-payment features available when Stripe is not configured.
// Payment operations fail clearly at request time until a real key exists.
const stripe = process.env.STRIPE_SECRET_KEY
	? new Stripe(process.env.STRIPE_SECRET_KEY)
	: new Proxy({}, {
			get() {
				throw new ApiError(503, "Stripe payments are not configured");
			},
		});

module.exports = stripe;
