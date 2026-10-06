const express = require("express");
const authenticate = require("../middleware/auth");
const uploadController = require("../controllers/uploadController");

const router = express.Router();
router.post("/", authenticate, uploadController.upload);

module.exports = router;
