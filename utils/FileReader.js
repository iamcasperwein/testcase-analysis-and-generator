const fs = require('fs');
const path = require('path');

function readDataFile(fileName) {
    const filePath = path.join(__dirname, '../data', fileName);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return data;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        throw error;
    }
}

function writeDataFile(fileName, data) {
    const filePath = path.join(__dirname, '../data', fileName);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const content = typeof data === 'string' ? data : JSON.stringify(data, null, 4);
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error.message);
        throw error;
    }
}

module.exports = { readDataFile, writeDataFile };