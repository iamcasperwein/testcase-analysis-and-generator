const express = require("express")
const router = express.Router()

const Testrail = require("../controller/Testrail")

router.get("/getsections", Testrail.getSections)
router.post("/posttestcases", Testrail.postTestCases)

module.exports = router