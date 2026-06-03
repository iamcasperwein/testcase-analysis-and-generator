const FileReader = require("../../utils/FileReader");

const getPromptData = async () => {
    try {
        const raw = FileReader.readDataFile("promptdata.json");
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
};

const getPromptList = async () => {
    const prompts = await getPromptData();
    return prompts.map(p => {
        let turnaroundMs = null;
        if (p.startAt && p.endAt) {
            const diff = new Date(p.endAt).getTime() - new Date(p.startAt).getTime();
            if (diff > 0) turnaroundMs = diff;
        }
        return {
            promptId:      p.promptId,
            projectName:   p.projectName || null,
            platforms:     Array.isArray(p.platforms) ? p.platforms : [],
            status:        p.status || null,
            agent:         p.agent || null,
            model:         p.model || null,
            testCaseCount: p.testCaseCount ?? null,
            createdAt:     p.createdAt || p.startAt || null,
            turnaroundMs,
            failureNote:   p.failureNote || null,
            errorMessage:  p.errorMessage || null,
        };
    });
};

module.exports = {
    getPromptData,
    getPromptList,
};
