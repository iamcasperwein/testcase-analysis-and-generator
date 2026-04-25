const TestCaseService = require("../service/TestCaseService");

const getTestCases = async (req, res) => {
  try {
    const tcs = await TestCaseService.getTestCases("result1.json");
    res.status(200).json({ success: true, data: JSON.parse(tcs) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


module.exports = {
  getTestCases
};