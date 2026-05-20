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

const getAnalyzeResult = async (req, res) => {
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

const editTestCase = async (req, res) => {
  try {
    const promptId = String(req.query.promptID || req.query.promptId || req.body.promptID || req.body.promptId || "").trim();
    const testcaseId = String(req.query.testcaseId || req.body.testcaseId || req.body.id || "").trim();

    if (!promptId || !testcaseId) {
      return res.status(400).json({
        success: false,
        error: "promptID and testcaseId are required",
      });
    }

    const result = await TestCaseService.editTestCase(promptId, testcaseId, req.body || {});
    res.status(200).json({
      success: true,
      message: "Test case updated successfully",
      data: result,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Test case data not found" });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteTestCase = async (req, res) => {
  try {
    const { promptId, testcaseId } = req.params;

    if (!promptId || !testcaseId) {
      return res.status(400).json({
        success: false,
        error: "promptId and testcaseId are required",
      });
    }

    const result = await TestCaseService.deleteTestCase(promptId, testcaseId);
    res.status(200).json({
      success: true,
      message: "Test case deleted successfully",
      data: result,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Test case data not found" });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: error.message });
  }
};

const addTestCase = async (req, res) => {
  try {
    const promptId = String(req.query.promptID || req.query.promptId || req.body.promptID || req.body.promptId || "").trim();
    const section = String(req.body.section || "").trim();

    if (!promptId) {
      return res.status(400).json({ success: false, error: "promptId is required" });
    }

    if (!section) {
      return res.status(400).json({ success: false, error: "section is required" });
    }

    const result = await TestCaseService.addTestCase(promptId, section, req.body || {});
    res.status(201).json({
      success: true,
      message: "Test case added successfully",
      data: result,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Test case data not found" });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: error.message });
  }
};

const editSectionName = async (req, res) => {
  try {
    const promptId = String(req.query.promptID || req.query.promptId || req.body.promptID || req.body.promptId || "").trim();
    const currentName = String(req.body.currentName || "").trim();
    const newName = String(req.body.newName || "").trim();
    const sectionId = req.body.sectionId != null ? req.body.sectionId : null;

    if (!promptId) {
      return res.status(400).json({ success: false, error: "promptId is required" });
    }

    if (!currentName || !newName) {
      return res.status(400).json({ success: false, error: "currentName and newName are required" });
    }

    const result = await TestCaseService.editSectionName(promptId, currentName, newName, sectionId);
    res.status(200).json({
      success: true,
      message: "Section renamed successfully",
      data: result,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Test case data not found" });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: error.message });
  }
};

const bulkMoveSection = async (req, res) => {
  try {
    const { promptId, testcaseIds, target, platformGroup } = req.body || {};

    if (!promptId || !Array.isArray(testcaseIds) || !testcaseIds.length) {
      return res.status(400).json({
        success: false,
        error: "promptId and testcaseIds[] are required",
      });
    }

    if (!target || !target.sectionName) {
      return res.status(400).json({
        success: false,
        error: "target.sectionName is required",
      });
    }

    const result = await TestCaseService.bulkMoveSection(
      String(promptId).trim(),
      testcaseIds,
      target,
      platformGroup || null
    );

    res.status(200).json({
      success: true,
      message: `${result.moved} test case(s) moved to "${result.targetSection}"`,
      data: result,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ success: false, error: "Test case data not found" });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getTestCases,
  getAnalyzeResult,
  editTestCase,
  deleteTestCase,
  addTestCase,
  editSectionName,
  bulkMoveSection,
};