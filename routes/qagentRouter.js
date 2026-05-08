const express = require("express")
const router = express.Router()
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const QAgent = require("../controller/QAgent")

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../data/uploads")
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir)
    },
    filename: (req, file, cb) => {
        // Save with timestamp to avoid collisions
        const timestamp = Date.now()
        const ext = path.extname(file.originalname)
        const name = path.basename(file.originalname, ext)
        cb(null, `${name}-${timestamp}${ext}`)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
})

router.post("/ask", upload.fields([
    { name: "prd", maxCount: 1 },
    { name: "additionalDocs", maxCount: 20 },
]), QAgent.askAi)

router.post("/retry/:promptId", QAgent.retryPrompt)

module.exports = router