/**
 * larkCliRouter - Routes for lark-cli management and integration.
 */

const express = require("express");
const router = express.Router();
const LarkCliController = require("../controller/LarkCli");

// Status & setup
router.get("/status", LarkCliController.getStatus);
router.post("/install", LarkCliController.install);

// One-click setup flow
router.post("/setup", LarkCliController.setup);
router.get("/setup-poll", LarkCliController.setupPoll);

// Auth flow (legacy — kept for backward compat)
router.post("/auth-login", LarkCliController.authLogin);
router.post("/auth-poll", LarkCliController.authPoll);

// Provider management
router.put("/provider", LarkCliController.setProvider);

// Send analysis to Lark
router.post("/send-analysis/:promptId", LarkCliController.sendAnalysis);

module.exports = router;
