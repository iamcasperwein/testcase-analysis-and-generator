const fs = require("fs");
const path = require("path");
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

const getProducts = async () => {
    const raw = fs.readFileSync(
        path.join(__dirname, "../../prompts/references/productlist.json"),
        "utf8"
    );
    return JSON.parse(raw);
};

const getPromptSnapshot = async (promptId, stage) => {
    const validStages = ["analysis", "testcases"];
    if (!validStages.includes(stage)) {
        throw new Error(`Invalid stage: '${stage}'. Valid values: ${validStages.join(", ")}`);
    }
    try {
        return FileReader.readDataFile(`runtime/prompts/${promptId}-${stage}.txt`);
    } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
    }
};

module.exports = {
    getPromptData,
    getPromptList,
    getProducts,
    getPromptSnapshot,
};
