const GeminiService = require("../service/GeminiService");
const TestCaseService = require("../service/TestCaseService");

const askAi = async (req, res) => {
  try {
    const {
      promptId,
      feature = "login/register flow",
      platform = "mobile",
      prdText,
      additionalContext,
      context,
      rawContent,
      prdUrl,
      rfcUrl,
      figmaUrl,
      documents,
    } = req.body || {};

    const prompt = await TestCaseService.getTestCaseGenerationPrompt({
      promptId,
      feature,
      platform,
      prdText,
      additionalContext,
      context,
      rawContent,
      prdUrl,
      rfcUrl,
      figmaUrl,
      documents,
    });

    const text = await GeminiService.generateFromPrompt(prompt);

    res.json({ success: true, data: text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


module.exports = {
  askAi
};