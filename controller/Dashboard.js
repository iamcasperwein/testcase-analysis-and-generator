const DashboardService = require("../service/DashboardService");
const path = require("path");
const fs = require("fs");

const DEFAULT_MODELS = Object.freeze({
    copilot: String(process.env.GITHUB_MODEL || "openai/gpt-5-chat").trim(),
    claude: String(process.env.CLAUDE_MODEL || "claude-sonnet-4-6").trim(),
    gemini: String(process.env.GEMINI_MODEL || "models/gemini-2.5-flash").trim(),
});

const resolveModelName = (prompt = {}) => {
    const explicitModel = String(prompt.model || prompt.modelName || "").trim();
    if (explicitModel) return explicitModel;

    const agent = String(prompt.agent || "").trim().toLowerCase();
    return DEFAULT_MODELS[agent] || null;
};

const getDashboard = async (req, res) => {
    try {
        const prompts = await DashboardService.getPromptData();

        const total      = prompts.length;
        const completed  = prompts.filter(p => /COMPLETED|DONE/i.test(p.status || "")).length;
        const inProgress = prompts.filter(p => /PROCESSING|IN_PROGRESS/i.test(p.status || "")).length;

        const turnarounds = prompts
            .filter(p => p.startAt && p.endAt)
            .map(p => new Date(p.endAt) - new Date(p.startAt))
            .filter(ms => ms > 0);

        const avgTurnaroundMs = turnarounds.length
            ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length)
            : null;

        const totalTestCases = prompts.reduce((acc, p) => acc + (p.testCaseCount ?? 0), 0);

        res.status(200).json({
            success: true,
            data: {
                totalPrompts: total,
                completed,
                inProgress,
                avgTurnaroundMs,
                totalTestCases: totalTestCases || null,
                prompts: prompts.map(p => ({
                    promptId:      p.promptId,
                    projectName:   p.projectName || null,
                    status:        p.status || null,
                    model:         resolveModelName(p),
                    testCaseCount: p.testCaseCount ?? null,
                    turnaroundMs:  (p.startAt && p.endAt)
                        ? Math.max(0, new Date(p.endAt) - new Date(p.startAt))
                        : null,
                    createdAt: p.startAt || null,
                    failureNote: p.failureNote || p.errorMessage || null,
                })),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getPrompts = async (req, res) => {
    try {
        const list = await DashboardService.getPromptList();
        res.status(200).json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getPromptLog = async (req, res) => {
    try {
        const { promptId } = req.params;
        if (!promptId) {
            return res.status(400).json({ success: false, error: "promptId is required" });
        }

        const logPath = path.join(__dirname, "../data/runtime", `${promptId}.txt`);
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({ success: false, error: "Log file not found for this prompt." });
        }

        const content = fs.readFileSync(logPath, "utf8");
        res.status(200).json({ success: true, data: { promptId, log: content } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getDashboard,
    getPrompts,
    getPromptLog,
};
