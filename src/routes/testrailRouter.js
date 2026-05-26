const express = require("express")
const router = express.Router()

const Testrail = require("../controller/Testrail")
const TestrailSyncConfig = require("../controller/TestrailSyncConfig")

router.get("/getsuites", Testrail.getSuites)
router.get("/getsections", Testrail.getSections)
router.post("/posttestcases", Testrail.postTestCases)

router.get("/syncconfig", TestrailSyncConfig.getAll)
router.post("/syncconfig", TestrailSyncConfig.upsert)
router.delete("/syncconfig/:platformGroup", TestrailSyncConfig.remove)

module.exports = router