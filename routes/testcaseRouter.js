const express = require("express")
const router = express.Router()

const TestCase = require("../controller/TestCase")

router.get("/getAnalyzeResult/:promptId", TestCase.getAnalyzeResult)

router.post("/add", TestCase.addTestCase)
router.post("/edit", TestCase.editTestCase)
router.put("/edit", TestCase.editTestCase)
router.put("/editSection", TestCase.editSectionName)
router.delete("/deleteTestCase/:promptId/:testcaseId", TestCase.deleteTestCase)

router.get("/:promptId", TestCase.getTestCases)

module.exports = router