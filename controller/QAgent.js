const QAgentService = require("../service/QAgentService");
const FileExtractor = require("../utils/FileExtractor");
const path = require("path");
const fs = require("fs");
const { ulid } = require("ulid");

const FIELD_TO_DOC_TYPE = {
  prd: "PRD",
  rfc: "RFC",
  figma: "FIGMA",
};

const renameUploadedFile = (file, promptId, fieldName) => {
  if (!file) return null;

  const docType = FIELD_TO_DOC_TYPE[fieldName] || "UNKNOWN";
  const ext = path.extname(file.originalname);
  const newFilename = `${promptId}_${docType}${ext}`;
  const oldPath = file.path;
  const newPath = path.join(path.dirname(oldPath), newFilename);

  // Rename the file synchronously
  try {
    fs.renameSync(oldPath, newPath);
    // Update file object with new path
    file.path = newPath;
    file.filename = newFilename;
    return file;
  } catch (err) {
    console.error(`Failed to rename file ${oldPath} to ${newPath}:`, err.message);
    return file; // Return original file if rename fails
  }
};

const askAi = async (req, res) => {
  try {
    const body = req.body || {};
    const files = req.files || {};

  // Generate promptId once for this submission
    const promptId = ulid();

    // Rename uploaded files with format: {promptId}_{docType}.{ext}
    const prdFile = files.prd?.[0] ? renameUploadedFile(files.prd[0], promptId, "prd") : null;
    const rfcFile = files.rfc?.[0] ? renameUploadedFile(files.rfc[0], promptId, "rfc") : null;
    const figmaFile = files.figma?.[0] ? renameUploadedFile(files.figma[0], promptId, "figma") : null;

    // Get file info
    const prdFileInfo = FileExtractor.getFileInfo(prdFile);
    const rfcFileInfo = FileExtractor.getFileInfo(rfcFile);
    const figmaFileInfo = FileExtractor.getFileInfo(figmaFile);

    const payload = {
      ...body,
      promptId, // Pass the generated promptId
      uploadedFiles: {
        prd: prdFileInfo,
        rfc: rfcFileInfo,
        figma: figmaFileInfo,
      },
      documents: {
        prd: {
          name: prdFileInfo?.originalName || body.prdUrl || "",
          path: prdFileInfo?.uploadPath || "",
        },
        rfc: {
          name: rfcFileInfo?.originalName || body.rfcUrl || "",
          path: rfcFileInfo?.uploadPath || "",
        },
        figma: {
          name: figmaFileInfo?.originalName || body.figmaUrl || "",
          path: figmaFileInfo?.uploadPath || "",
        },
      },
    };

    console.log("Received askAi request with payload:", JSON.stringify(payload, null, 2));

    // Run processing in background so FE gets immediate response.
    QAgentService.processSubmission(payload)
      .then((result) => {
        console.log(`[QAgentController] Background submission completed: promptId=${result.promptId}, status=${result.status}, testCaseCount=${result.testCaseCount}`);
      })
      .catch((error) => {
        console.error(`[QAgentController] Background submission failed: promptId=${payload.promptId}, error=${error.message}`);
      });

    res.status(202).json({
      success: true,
      message: "Prompt accepted. Processing started in background.",
      data: {
        promptId,
        status: "QUEUED",
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      data: error.promptId ? { promptId: error.promptId } : undefined,
    });
  }
};


const retryPrompt = async (req, res) => {
  try {
    const { promptId } = req.params;
    if (!promptId) {
      return res.status(400).json({ success: false, error: "promptId is required" });
    }

    // Lookup existing record to rebuild payload
    const records = QAgentService.readPromptData();
    const record = records.find((r) => String(r.promptId || "") === String(promptId));
    if (!record) {
      return res.status(404).json({ success: false, error: `Prompt not found: ${promptId}` });
    }
    if (!/FAILED|ERROR/i.test(record.status || "")) {
      return res.status(400).json({ success: false, error: `Prompt is not failed (status: ${record.status})` });
    }

    // Rebuild payload from existing record
    const payload = {
      promptId,
      projectName: record.projectName || "",
      feature: record.projectName || "",
      agent: record.agent || "claude",
      documents: {
        prd: { name: record.prdUrl || "", path: "", content: "" },
        rfc: { name: record.rfcUrl || "", path: "", content: "" },
        figma: { name: record.figmaUrl || "", path: "", content: "" },
      },
      prdUrl: record.prdUrl || "",
      rfcUrl: record.rfcUrl || "",
      figmaUrl: record.figmaUrl || "",
    };

    // Attach uploaded file paths if they exist
    const path = require("path");
    const fs = require("fs");
    const uploadsDir = path.join(__dirname, "../data/uploads");
    for (const docType of ["prd", "rfc", "figma"]) {
      const pattern = `${promptId}_${docType.toUpperCase()}`;
      try {
        const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith(pattern));
        if (files.length > 0) {
          payload.documents[docType].path = path.join(uploadsDir, files[0]);
        }
      } catch (_) { /* ignore */ }
    }

    // Reuse existing processSubmission with isRetry flag
    QAgentService.processSubmission(payload, { isRetry: true })
      .then((result) => {
        console.log(`[QAgentController] Retry completed: promptId=${result.promptId}, status=${result.status}, testCaseCount=${result.testCaseCount}`);
      })
      .catch((error) => {
        console.error(`[QAgentController] Retry failed: promptId=${promptId}, error=${error.message}`);
      });

    res.status(202).json({
      success: true,
      message: "Retry accepted. Processing started in background.",
      data: { promptId, status: "RETRYING" },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  askAi,
  retryPrompt,
};