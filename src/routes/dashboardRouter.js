const express = require("express")
const router = express.Router()

const Dashboard = require("../controller/Dashboard")

router.get("/", Dashboard.getDashboard)
router.get("/prompts", Dashboard.getPrompts)
router.get("/log/:promptId", Dashboard.getPromptLog)
router.get("/products", Dashboard.getProducts)
router.get("/prompt/:promptId/:stage", Dashboard.getPromptSnapshot)

module.exports = router