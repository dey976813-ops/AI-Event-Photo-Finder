const multer = require("multer");

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid image type. Only JPEG, PNG, and WebP images are allowed."));
        }
    }
});

const uploadSingleImage = upload.single("file");

const validateEventId = (req, res, next) => {
    if (!req.body.event_id) {
        return res.status(400).json({
            message: "event_id is required"
        });
    }

    next();
};

module.exports = {
    uploadSingleImage,
    validateEventId
};
