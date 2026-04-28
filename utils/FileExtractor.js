// Simple file info extractor - files are already saved to disk by multer
const getFileInfo = (file) => {
    if (!file) return null;
    
    return {
        fieldName: file.fieldname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadPath: file.path, // Full path where file was saved
        filename: file.filename, // Just the filename in uploads directory
    };
};

module.exports = { getFileInfo };
