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

module.exports = { readDataFile };