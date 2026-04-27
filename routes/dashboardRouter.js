const express = require("express")
const router = express.Router()

const Dashboard = require("../controller/Dashboard")

router.get("/", Dashboard.getDashboard)
router.get("/prompts", Dashboard.getPrompts)

module.exports = router