const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(path.join(__dirname, '../data'));

const resolveSafePath = (fileName) => {
    const resolved = path.resolve(path.join(DATA_DIR, fileName));
    if (!resolved.startsWith(DATA_DIR + path.sep) && resolved !== DATA_DIR) {
        throw new Error(`Path traversal detected: ${fileName}`);
    }
    return resolved;
};

function readDataFile(fileName) {
    const filePath = resolveSafePath(fileName);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return data;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        throw error;
    }
}

function writeDataFile(fileName, data) {
    const filePath = resolveSafePath(fileName);
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