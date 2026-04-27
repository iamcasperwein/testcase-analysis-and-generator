const { GoogleGenerativeAI } = require("@google/generative-ai");
const { buildTestCaseGenerationPrompt } = require("../prompts");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

const generateFromPrompt = async (prompt) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
};

const generateTestCases = async (input = {}) => {
    const prompt = buildTestCaseGenerationPrompt(input);

    return generateFromPrompt(prompt);
};

module.exports = {
    generateFromPrompt,
    generateTestCases,
};
