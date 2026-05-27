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
    return prompts.map(p => ({
        promptId:    p.promptId,
        projectName: p.projectName || null,
        platforms:   Array.isArray(p.platforms) ? p.platforms : [],
        status:      p.status || null,
        agent:       p.agent || null,
        model:       p.model || null,
    }));
};

module.exports = {
    getPromptData,
    getPromptList,
};
