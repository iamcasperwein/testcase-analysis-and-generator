const express = require("express")
const router = express.Router()

const TestCase = require("../controller/TestCase")

router.get("/:promptId", TestCase.getTestCases)

router.get("/getAnalyzeResult/:promptId", TestCase.getAnalyzeData)


module.exports = router