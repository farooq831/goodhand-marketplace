const cloudinary = require("cloudinary").v2;

// Configured from env; upload helpers (listing photos, vendor docs,
// avatars) will be added alongside the features that need them.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
