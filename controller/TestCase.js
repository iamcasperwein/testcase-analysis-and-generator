const TestCaseService = require("../service/TestCaseService");

const getTestCases = async (req, res) => {
  try {
    const { promptId } = req.params;

    if (!promptId) {
      return res.status(400).json({ success: false, error: "promptId is required" });
    }

    const tcs = await TestCaseService.getTestCases(promptId);
    res.status(200).json({ success: true, data: JSON.parse(tcs) });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Test case data not found" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

const getAnalyzeData = async (req, res) => {
  try {
    const { promptId } = req.params;

    if (!promptId) {
      return res.status(400).json({ success: false, error: "promptId is required" });
    }

    const analysis = await TestCaseService.getAnalyzeData(promptId);
    res.status(200).json({ success: true, data: { promptId, analysis } });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Analyze data not found" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getTestCases,
  getAnalyzeData,
};