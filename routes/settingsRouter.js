const express = require("express")
const router = express.Router()

const Settings = require("../controller/Settings")
const { DOC_TYPES } = require("../constants/docTypes")

router.get("/doc-types", (req, res) => {
    res.json({ success: true, data: DOC_TYPES })
})
router.get("/key", Settings.getSettingKeys)
router.get("/models", Settings.getModelCatalog)
router.get("/", Settings.getSettings)
router.post("/", Settings.createSettings)
router.put("/:key", Settings.updateSetting)
router.delete("/:key", Settings.deleteSetting)

module.exports = router