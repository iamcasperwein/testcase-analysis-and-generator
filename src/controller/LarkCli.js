/**
 * LarkCli Controller - Handles lark-cli management endpoints.
 *
 * Endpoints:
 *   GET  /lark-cli/status         - Check installation, config, auth status
 *   POST /lark-cli/install        - Install @larksuite/cli globally
 *   POST /lark-cli/auth-login     - Initiate auth login (returns verification URL)
 *   POST /lark-cli/auth-poll      - Poll auth completion with device code
 *   POST /lark-cli/send-analysis/:promptId - Create Lark doc from test analysis
 *   PUT  /lark-cli/provider       - Switch provider (cli/sdk)
 */

const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const LarkCliService = require("../service/LarkCliService");
const ConfigLoader = require("../utils/ConfigLoader");

const DATA_DIR = path.resolve(__dirname, "../../data");
const ANALYSIS_DIR = path.join(DATA_DIR, "analyze");

// --- In-memory state for setup flow ---
let _setupProcess = null; // child process for config init --new
let _setupState = "idle"; // idle | installing | configuring | awaiting_config | auth | awaiting_auth | done | error
let _setupError = null;
let _setupConfigUrl = null;
let _setupAuthUrl = null;
let _setupDeviceCode = null;
let _setupInFlight = false; // mutex guard for concurrent setup calls

/** Transition to terminal state and release mutex */
function setSetupTerminal(state, error) {
    _setupState = state;
    if (error) _setupError = error;
    _setupInFlight = false;
}

// Cleanup spawned processes on server shutdown
function cleanupSetupProcess() {
    if (_setupProcess) {
        try { _setupProcess.kill(); } catch {}
        _setupProcess = null;
    }
}
process.on("exit", cleanupSetupProcess);
process.on("SIGTERM", cleanupSetupProcess);
process.on("SIGINT", cleanupSetupProcess);

// --- Helpers ---

const execCommand = (cmd, args, options = {}) => {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, {
            timeout: options.timeout || 120000,
            maxBuffer: 5 * 1024 * 1024,
            encoding: "utf8",
            env: { ...process.env },
            shell: options.shell || false,
        }, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr, exitCode: error?.code || 0 });
        });
    });
};

// --- Handlers ---

/**
 * GET /lark-cli/status
 * Returns installation, config, and auth status.
 */
const getStatus = async (req, res) => {
    try {
        const installStatus = await LarkCliService.checkInstalled();
        let configStatus = { configured: false, appId: "", hasUsers: false };

        if (installStatus.installed) {
            configStatus = await LarkCliService.checkConfig();
        }

        const provider = ConfigLoader.get("larkProvider", "cli").toLowerCase();

        res.json({
            installed: installStatus.installed,
            version: installStatus.version,
            configured: configStatus.configured,
            appId: configStatus.appId,
            authenticated: configStatus.hasUsers,
            provider: provider === "sdk" ? "sdk" : "cli",
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to check lark-cli status", details: err.message });
    }
};

/**
 * POST /lark-cli/install
 * Installs @larksuite/cli globally via npm.
 */
const install = async (req, res) => {
    try {
        // Check if already installed
        const status = await LarkCliService.checkInstalled();
        if (status.installed) {
            return res.json({
                success: true,
                message: `lark-cli already installed (v${status.version})`,
                version: status.version,
                alreadyInstalled: true,
            });
        }

        const { error, stdout, stderr } = await execCommand(
            "npm",
            ["install", "-g", "@larksuite/cli"],
            { timeout: 120000 }
        );

        if (error && error.code !== 0) {
            return res.status(500).json({
                success: false,
                error: "Installation failed",
                details: stderr || error.message,
                stdout,
            });
        }

        // Verify installation
        const verifyStatus = await LarkCliService.checkInstalled();

        res.json({
            success: verifyStatus.installed,
            message: verifyStatus.installed
                ? `lark-cli installed successfully (v${verifyStatus.version})`
                : "Installation completed but lark-cli not found in PATH",
            version: verifyStatus.version,
            stdout,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: "Installation failed", details: err.message });
    }
};

/**
 * POST /lark-cli/auth-login
 * Initiates lark-cli auth login with --no-wait.
 * Returns verification_url and device_code for the FE to display.
 *
 * Body: { scopes?: string }
 */
const authLogin = async (req, res) => {
    try {
        const defaultDomain = "docs,wiki";
        const domain = req.body?.domain || defaultDomain;

        const args = ["auth", "login", "--domain", domain, "--no-wait", "--json"];

        const stdout = await LarkCliService.execLarkCli(args, { timeout: 30000 });
        let result;
        try {
            result = JSON.parse(stdout);
        } catch {
            // lark-cli might output non-JSON on first run
            return res.status(500).json({
                success: false,
                error: "Unexpected lark-cli output",
                raw: stdout,
            });
        }

        const verificationUrl = result.verification_url || result.verification_uri_complete || "";
        const deviceCode = result.device_code || "";

        if (!verificationUrl) {
            return res.status(500).json({
                success: false,
                error: "No verification URL returned",
                raw: result,
            });
        }

        res.json({
            success: true,
            verificationUrl,
            deviceCode,
            expiresIn: result.expires_in || 300,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: "Auth login initiation failed",
            details: err.message,
        });
    }
};

/**
 * POST /lark-cli/auth-poll
 * Polls auth completion using device code.
 *
 * Body: { deviceCode: string }
 */
const authPoll = async (req, res) => {
    const { deviceCode } = req.body || {};

    if (!deviceCode) {
        return res.status(400).json({ success: false, error: "deviceCode is required" });
    }

    try {
        const args = ["auth", "login", "--device-code", deviceCode];
        const stdout = await LarkCliService.execLarkCli(args, { timeout: 30000 });

        // If command succeeds, auth is complete
        res.json({
            success: true,
            status: "authenticated",
            message: "Authentication successful",
            raw: stdout.trim(),
        });
    } catch (err) {
        // auth might still be pending (user hasn't approved yet)
        const msg = err.message || "";
        if (msg.includes("pending") || msg.includes("authorization_pending") || msg.includes("slow_down")) {
            return res.json({
                success: true,
                status: "pending",
                message: "Waiting for user to authorize...",
            });
        }

        if (msg.includes("expired")) {
            return res.json({
                success: false,
                status: "expired",
                message: "Authorization request expired. Please try again.",
            });
        }

        res.status(500).json({
            success: false,
            status: "error",
            error: "Auth polling failed",
            details: err.message,
        });
    }
};

/**
 * POST /lark-cli/send-analysis/:promptId
 * Creates a new Lark document from the test analysis content.
 *
 * Body: { title?: string }
 */
const sendAnalysis = async (req, res) => {
    const { promptId } = req.params;

    if (!promptId) {
        return res.status(400).json({ success: false, error: "promptId is required" });
    }

    // Validate promptId to prevent path traversal
    if (/[\/\\]|\.\./.test(promptId)) {
        return res.status(400).json({ success: false, error: "Invalid promptId" });
    }

    // Read analysis file
    const analysisFile = path.join(ANALYSIS_DIR, `${promptId}.md`);

    // Double-check resolved path is within ANALYSIS_DIR
    if (!path.resolve(analysisFile).startsWith(path.resolve(ANALYSIS_DIR))) {
        return res.status(400).json({ success: false, error: "Invalid promptId" });
    }

    if (!fs.existsSync(analysisFile)) {
        return res.status(404).json({
            success: false,
            error: "Analysis file not found",
            promptId,
        });
    }

    try {
        const content = fs.readFileSync(analysisFile, "utf8");

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                error: "Analysis file is empty",
                promptId,
            });
        }

        const title = req.body?.title || `Test Analysis - ${promptId}`;

        const result = await LarkCliService.createDocument(title, content);

        res.json({
            success: true,
            message: "Analysis published to Lark document",
            url: result.url,
            documentId: result.documentId,
            promptId,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: "Failed to create Lark document",
            details: err.message,
            promptId,
        });
    }
};

/**
 * PUT /lark-cli/provider
 * Switch between CLI and SDK provider.
 *
 * Body: { provider: "cli" | "sdk" }
 */
const setProvider = (req, res) => {
    const { provider } = req.body || {};

    if (!provider || !["cli", "sdk"].includes(provider)) {
        return res.status(400).json({
            success: false,
            error: 'provider must be "cli" or "sdk"',
        });
    }

    ConfigLoader.set("larkProvider", provider);

    res.json({
        success: true,
        provider,
        message: `Lark provider switched to: ${provider}`,
    });
};

/**
 * POST /lark-cli/setup
 * One-click setup: install lark-cli (if needed), run config init --new, then auth login.
 * Returns immediately with status. Use /lark-cli/setup-poll to track progress.
 */
const setup = async (req, res) => {
    try {
        // Mutex: reject concurrent setup calls
        if (_setupInFlight) {
            return res.status(409).json({
                success: false,
                state: _setupState,
                error: "Setup already in progress",
            });
        }
        _setupInFlight = true;

        // Reset state
        _setupError = null;
        _setupConfigUrl = null;
        _setupAuthUrl = null;
        _setupDeviceCode = null;

        // If already fully configured + authenticated, nothing to do
        const installStatus = await LarkCliService.checkInstalled();
        if (installStatus.installed) {
            const configStatus = await LarkCliService.checkConfig();
            if (configStatus.configured && configStatus.hasUsers) {
                setSetupTerminal("done");
                return res.json({ success: true, state: "done", message: "Already connected" });
            }
            // If configured but not authenticated, skip to auth
            if (configStatus.configured) {
                _setupState = "auth";
                await startAuthLogin();
                return res.json({
                    success: true,
                    state: _setupState,
                    authUrl: _setupAuthUrl,
                    message: "Open the link to authorize",
                });
            }
        }

        // Step 1: Install if needed
        if (!installStatus.installed) {
            _setupState = "installing";
            const { error, stderr } = await execCommand(
                "npm", ["install", "-g", "@larksuite/cli"], { timeout: 120000 }
            );
            if (error && error.code !== 0) {
                setSetupTerminal("error", `Installation failed: ${stderr || error.message}`);
                return res.status(500).json({ success: false, state: "error", error: _setupError });
            }
            // Verify
            const verify = await LarkCliService.checkInstalled();
            if (!verify.installed) {
                setSetupTerminal("error", "Installation completed but lark-cli not found in PATH");
                return res.status(500).json({ success: false, state: "error", error: _setupError });
            }
        }

        // Step 2: Config init --new (spawns background process, blocks until user completes in browser)
        _setupState = "configuring";
        startConfigInit();

        // Wait briefly for the URL to appear in stdout
        await new Promise(resolve => setTimeout(resolve, 3000));

        if (_setupConfigUrl) {
            _setupState = "awaiting_config";
            return res.json({
                success: true,
                state: "awaiting_config",
                configUrl: _setupConfigUrl,
                message: "Open the link to set up your Lark app",
            });
        }

        // URL might not be captured yet
        return res.json({
            success: true,
            state: "configuring",
            message: "Setting up Lark app configuration...",
        });

    } catch (err) {
        setSetupTerminal("error", err.message);
        res.status(500).json({ success: false, state: "error", error: err.message });
    }
};

/**
 * Spawn `lark-cli config init --new --brand lark` in background.
 * Captures URL from stdout. Process exits when user completes browser flow.
 */
function startConfigInit() {
    if (_setupProcess) {
        try { _setupProcess.kill(); } catch {}
    }

    const larkCliBin = LarkCliService.getLarkCliBin ? LarkCliService.getLarkCliBin() : "lark-cli";
    _setupProcess = spawn(larkCliBin, ["config", "init", "--new", "--brand", "lark"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
    });

    let stdout = "";

    _setupProcess.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        // Extract URL from output
        const urlMatch = stdout.match(/(https:\/\/open\.(larksuite|feishu)\.[^\s]+)/);
        if (urlMatch && !_setupConfigUrl) {
            _setupConfigUrl = urlMatch[1];
            _setupState = "awaiting_config";
        }
    });

    _setupProcess.stderr.on("data", (chunk) => {
        // Some CLI tools output to stderr
        const text = chunk.toString();
        const urlMatch = text.match(/(https:\/\/open\.(larksuite|feishu)\.[^\s]+)/);
        if (urlMatch && !_setupConfigUrl) {
            _setupConfigUrl = urlMatch[1];
            _setupState = "awaiting_config";
        }
    });

    _setupProcess.on("close", async (code) => {
        _setupProcess = null;
        if (code === 0) {
            // Config init completed — now start auth login
            _setupState = "auth";
            try {
                await startAuthLogin();
            } catch (err) {
                setSetupTerminal("error", `Auth login failed: ${err.message}`);
            }
        } else {
            setSetupTerminal("error", `Config init exited with code ${code}`);
        }
    });
}

/**
 * Start auth login --no-wait --json and capture the verification URL.
 */
async function startAuthLogin() {
    const args = ["auth", "login", "--domain", "docs,wiki", "--no-wait", "--json"];

    const stdout = await LarkCliService.execLarkCli(args, { timeout: 30000 });
    let result;
    try {
        result = JSON.parse(stdout);
    } catch {
        throw new Error(`Unexpected auth output: ${stdout}`);
    }

    if (result.ok === false && result.error) {
        throw new Error(result.error.message || "Auth login failed");
    }

    _setupAuthUrl = result.verification_url || result.verification_uri_complete || "";
    _setupDeviceCode = result.device_code || "";

    if (!_setupAuthUrl) {
        throw new Error("No verification URL returned from auth login");
    }

    _setupState = "awaiting_auth";
}

/**
 * GET /lark-cli/setup-poll
 * Poll the setup progress. Frontend calls this every few seconds.
 */
const setupPoll = async (req, res) => {
    // If state is awaiting_auth, try polling the device code
    if (_setupState === "awaiting_auth" && _setupDeviceCode) {
        try {
            const args = ["auth", "login", "--device-code", _setupDeviceCode, "--json"];
            const stdout = await LarkCliService.execLarkCli(args, { timeout: 10000 });
            // Parse stdout — might be JSON with ok: true/false
            let result;
            try { result = JSON.parse(stdout); } catch { result = null; }

            if (result && result.ok === false) {
                // CLI returned structured error
                const errMsg = (result.error?.message || "").toLowerCase();
                if (errMsg.includes("pending") || errMsg.includes("authorization_pending") || errMsg.includes("slow_down")) {
                    return res.json({
                        success: true,
                        state: "awaiting_auth",
                        authUrl: _setupAuthUrl,
                        message: "Waiting for authorization...",
                    });
                }
                if (errMsg.includes("expired") || errMsg.includes("invalid")) {
                    setSetupTerminal("error", "Authorization expired or invalid. Please restart setup.");
                    return res.json({ success: false, state: "error", error: _setupError });
                }
                // Other structured error
                setSetupTerminal("error", result.error?.message || "Auth failed");
                return res.json({ success: false, state: "error", error: _setupError });
            }

            // Success — auth complete
            setSetupTerminal("done");
            return res.json({
                success: true,
                state: "done",
                message: "Connected! Lark integration is ready.",
            });
        } catch (err) {
            const msg = (err.message || "").toLowerCase();
            if (msg.includes("pending") || msg.includes("authorization_pending") || msg.includes("slow_down") || msg.includes("waiting")) {
                // Still waiting
                return res.json({
                    success: true,
                    state: "awaiting_auth",
                    authUrl: _setupAuthUrl,
                    message: "Waiting for authorization...",
                });
            }
            if (msg.includes("expired") || msg.includes("expire") || msg.includes("invalid")) {
                setSetupTerminal("error", "Authorization expired or invalid. Please restart setup.");
                return res.json({ success: false, state: "error", error: _setupError });
            }
            // Unknown error — report as error so user knows to retry
            console.error("[LarkCli setupPoll] device-code poll error:", err.message);
            setSetupTerminal("error", err.message || "Unknown auth error");
            return res.json({
                success: false,
                state: "error",
                error: _setupError,
            });
        }
    }

    // If configuring, check if process finished and we now have auth
    if (_setupState === "configuring" || _setupState === "awaiting_config") {
        // Check if config URL is now available
        if (_setupConfigUrl && _setupState === "configuring") {
            _setupState = "awaiting_config";
        }
    }

    // If state transitioned to auth/awaiting_auth after config completed
    if (_setupState === "auth") {
        // startAuthLogin might still be running; return current state
        return res.json({
            success: true,
            state: "auth",
            message: "Starting authorization...",
        });
    }

    res.json({
        success: true,
        state: _setupState,
        configUrl: _setupConfigUrl || null,
        authUrl: _setupAuthUrl || null,
        error: _setupError || null,
        message: getSetupMessage(_setupState),
    });
};

function getSetupMessage(state) {
    switch (state) {
        case "idle": return "Ready to set up";
        case "installing": return "Installing lark-cli...";
        case "configuring": return "Setting up Lark app...";
        case "awaiting_config": return "Open the link to set up your Lark app";
        case "auth": return "Starting authorization...";
        case "awaiting_auth": return "Open the link to authorize";
        case "done": return "Connected!";
        case "error": return _setupError || "Setup failed";
        default: return "";
    }
}

module.exports = {
    getStatus,
    install,
    authLogin,
    authPoll,
    setup,
    setupPoll,
    sendAnalysis,
    setProvider,
};
