const DashboardService = require("../service/DashboardService");

const getDashboard = async (req, res) => {
    try {
        const prompts = await DashboardService.getPromptData();

        const total      = prompts.length;
        const completed  = prompts.filter(p => /completed|done/i.test(p.status || "")).length;
        const inProgress = prompts.filter(p => /processing|in_progress/i.test(p.status || "")).length;

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
                    testCaseCount: p.testCaseCount ?? null,
                    turnaroundMs:  (p.startAt && p.endAt)
                        ? Math.max(0, new Date(p.endAt) - new Date(p.startAt))
                        : null,
                    createdAt: p.startAt || null,
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

module.exports = {
    getDashboard,
    getPrompts,
};
