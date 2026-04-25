const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

const buildTestCasePrompt = ({ feature, platform, prdText, additionalContext }) => {
  return `
    You are a Senior QE Engineer.
    Generate test cases for mobile/web app in JSON format.

    Input:
    - Feature: ${feature || "N/A"}
    - Platform: ${platform || "mobile"}
    - PRD: ${prdText || "N/A"}
    - Additional Context: ${additionalContext || "N/A"}

    Output JSON schema:
        {
            "feature": "string",
            "testCases": [
               {
                    section: "string",
                    test cases: {
                        "id": "TC-001",
                        "title": "string",
                        "type": "positive|negative|edge",
                        "priority": "high|medium|low",
                        "preconditions": ["string"],
                        "steps": ["string"],
                        "expectedResult": "string"
                    }
                }
            ]
        }
    Only return valid JSON.
    `.trim();
    };

    const generateTestCases = async ({ feature, platform, prdText, additionalContext }) => {
    const prompt = buildTestCasePrompt({
        feature,
        platform,
        prdText,
        additionalContext,
    });

    const result = await model.generateContent(prompt);
    return result.response.text();
};

module.exports = {
    generateTestCases,
};
