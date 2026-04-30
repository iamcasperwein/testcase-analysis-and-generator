const express = require("express")
const router = express.Router()

const Settings = require("../controller/Settings")

router.get("/key", Settings.getSettingKeys)
router.get("/", Settings.getSettings)
router.post("/", Settings.createSettings)
router.put("/:key", Settings.updateSetting)
router.delete("/:key", Settings.deleteSetting)

module.exports = router