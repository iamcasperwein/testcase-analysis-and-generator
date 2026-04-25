const express = require("express")
const router = express.Router()

const TestCase = require("../controller/TestCase")

router.get("/:promptId", TestCase.getTestCases)

module.exports = router