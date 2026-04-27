const FileReader = require("../utils/FileReader");

const getTestCases = async (promptId) => {
    const data = FileReader.readDataFile(`testcases/${promptId}.json`);
    return data;
}

const getAnalyzeData = async (promptId) => {
    try {
        return FileReader.readDataFile(`analyze/${promptId}.txt`);
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getTestCases,
    getAnalyzeData,
}