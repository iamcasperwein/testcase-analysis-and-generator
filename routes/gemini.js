const express = require("express")
const router = express.Router()

const Gemini = require("../controller/Gemini")

router.post("/ask", Gemini.askAi)

module.exports = router