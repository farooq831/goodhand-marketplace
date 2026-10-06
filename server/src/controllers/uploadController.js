const cloudinary = require("../config/cloudinary");
const ApiError = require("../utils/ApiError");

const FOLDERS = {
  listing: "local-services/listings",
  verification: "local-services/verification",
  avatar: "local-services/avatars",
  work: "local-services/work",
};

async function upload(req, res, next) {
  try {
    const { dataUrl, kind = "listing" } = req.body;
    if (!FOLDERS[kind]) throw new ApiError(400, "Invalid upload kind");
    if (!dataUrl?.startsWith("data:")) throw new ApiError(400, "A file data URL is required");
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new ApiError(503, "Cloudinary upload is not configured");
    }
    const resourceType = dataUrl.startsWith("data:image/") ? "image" : "raw";
    const result = await cloudinary.uploader.upload(dataUrl, { folder: FOLDERS[kind], resource_type: resourceType });
    const url = resourceType === "raw"
      ? result.secure_url.replace("/image/upload/", "/raw/upload/")
      : result.secure_url;
    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
}

module.exports = { upload };
