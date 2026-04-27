const FileReader = require("../utils/FileReader");

const getPromptData = async () => {
    try {
        const raw = FileReader.readDataFile("promptdata.json");
        return JSON.parse(raw);
    } catch (error) {
        throw error;
    }
};

const getPromptList = async () => {
    const prompts = await getPromptData();
    return prompts.map(p => ({
        promptId:    p.promptId,
        projectName: p.projectName || null,
    }));
};

module.exports = {
    getPromptData,
    getPromptList,
};
