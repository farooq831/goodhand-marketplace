const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");
const ApiError = require("../utils/ApiError");

const FOLDERS = {
  listing: "local-services/listings",
  verification: "local-services/verification",
  avatar: "local-services/avatars",
  work: "local-services/work",
};

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const cloudinaryConfigured = () =>
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

// Where the dev fallback stores files; server.js serves it at /uploads.
const LOCAL_UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

// Development only: with no Cloudinary account, keep files on local disk so
// uploads (CNIC photos, work files, listing photos) can still be tested.
// Not used in production — a host like Render wipes its disk on each deploy.
// Names are random, so a URL can't be guessed from another.
function saveLocally(req, dataUrl, kind) {
  const match = /^data:([\w/.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new ApiError(400, "Malformed file data");
  const ext = EXTENSIONS[match[1]];
  if (!ext) throw new ApiError(400, "Unsupported file type — use an image, PDF, or Word document");

  const dir = path.join(LOCAL_UPLOAD_DIR, kind);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(match[2], "base64"));
  return `${req.protocol}://${req.get("host")}/uploads/${kind}/${name}`;
}

async function upload(req, res, next) {
  try {
    const { dataUrl, kind = "listing" } = req.body;
    if (!FOLDERS[kind]) throw new ApiError(400, "Invalid upload kind");
    if (!dataUrl?.startsWith("data:")) throw new ApiError(400, "A file data URL is required");

    if (!cloudinaryConfigured()) {
      if (process.env.NODE_ENV === "production") throw new ApiError(503, "Cloudinary upload is not configured");
      return res.status(201).json({ url: saveLocally(req, dataUrl, kind) });
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

module.exports = { upload, LOCAL_UPLOAD_DIR };
