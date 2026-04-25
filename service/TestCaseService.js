const FileReader = require("../utils/FileReader");

const getTestCases = async (path) => {
    const data = FileReader.readDataFile(path);
    return data;
}


module.exports = {
    getTestCases
}