const errorHandler = (err, req, res, next) => {
    console.error(err);

    if (err.message && err.message.includes("Invalid image type")) {
        return res.status(400).json({
            message: err.message
        });
    }

    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
            message: "File size is too large. Maximum allowed size is 5 MB."
        });
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
            message: "Unexpected file field."
        });
    }

    return res.status(500).json({
        message: "Internal server error"
    });
};

module.exports = errorHandler;