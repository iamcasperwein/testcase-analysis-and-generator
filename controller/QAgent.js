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

const inferDocType = (value = "") => {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "ADDITIONAL";
  if (/(^|\b)RFC(\b|$)/i.test(normalized)) return "RFC";
  if (/(^|\b)FIGMA(\b|$)/i.test(normalized)) return "FIGMA";
  if (/(^|\b)PRD(\b|$)/i.test(normalized)) return "PRD";
  return normalized.replace(/\s+/g, " ");
};

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findCoreDocumentPath = (uploadsDir, promptId, docType) => {
  const safePromptId = escapeRegExp(promptId);
  const safeDocType = escapeRegExp(String(docType || "").toUpperCase());
  const exactPattern = new RegExp(`^${safePromptId}_${safeDocType}\\.[^.]+$`, "i");

  try {
    const files = fs.readdirSync(uploadsDir).filter((file) => exactPattern.test(file));
    if (!files.length) return "";
    return path.join(uploadsDir, files[0]);
  } catch (_) {
    return "";
  }
};

const inferAdditionalDocumentsFromUploads = (uploadsDir, promptId, existingAdditionalDocs = []) => {
  const existing = Array.isArray(existingAdditionalDocs) ? existingAdditionalDocs : [];
  if (existing.length) {
    return existing.map((doc, index) => {
      const next = { ...doc };
      if (!String(next.path || "").trim() && next.filename) {
        const candidate = path.join(uploadsDir, next.filename);
        if (fs.existsSync(candidate)) {
          next.path = candidate;
        }
      }
      if (!next.name) {
        next.name = next.originalName || next.filename || `additional-${index + 1}`;
      }
      if (!next.docType) {
        next.docType = "ADDITIONAL";
      }
      return next;
    });
  }

  const safePromptId = escapeRegExp(promptId);
  const additionalPattern = new RegExp(`^${safePromptId}_(.+)_\\d+\\.[^.]+$`, "i");

  try {
    return fs
      .readdirSync(uploadsDir)
      .map((file) => {
        const match = file.match(additionalPattern);
        if (!match) return null;
        const inferredType = String(match[1] || "ADDITIONAL").replace(/_/g, " ").trim().toUpperCase();
        return {
          docType: inferredType || "ADDITIONAL",
          name: file,
          filename: file,
          originalName: file,
          path: path.join(uploadsDir, file),
          content: "",
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
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

    // Rename PRD file
    const prdFile = files.prd?.[0] ? renameUploadedFile(files.prd[0], promptId, "prd") : null;
    const prdFileInfo = FileExtractor.getFileInfo(prdFile);

    // Process additional docs (RFC iOS, RFC Android, Figma, custom, etc.)
    const additionalDocFiles = Array.isArray(files.additionalDocs) ? files.additionalDocs : [];

    // docTypes and docNames are parallel arrays sent from the FE
    const docTypes = Array.isArray(body.docTypes)
      ? body.docTypes
      : body.docTypes ? [body.docTypes] : [];
    const docNames = Array.isArray(body.docNames)
      ? body.docNames
      : body.docNames ? [body.docNames] : [];

    const additionalDocuments = additionalDocFiles.map((file, idx) => {
      const rawDocType = String(docTypes[idx] || "").trim();
      const customName = String(docNames[idx] || file.originalname || "").trim();
      const docType = inferDocType(rawDocType || customName || file.originalname || "ADDITIONAL");
      const ext = path.extname(file.originalname);
      const newFilename = `${promptId}_${docType.replace(/[^A-Z0-9]/g, "_")}_${idx}${ext}`;
      const newPath = path.join(path.dirname(file.path), newFilename);
      try {
        fs.renameSync(file.path, newPath);
        file.path = newPath;
        file.filename = newFilename;
      } catch (_) {}
      return {
        docType,
        name: customName || file.originalname,
        path: file.path,
        originalName: file.originalname,
        content: "",
      };
    });

    const additionalDocInfos = additionalDocFiles.map((file) => FileExtractor.getFileInfo(file));

    const payload = {
      ...body,
      promptId,
      uploadedFiles: {
        prd: prdFileInfo,
        additionalDocs: additionalDocInfos,
      },
      documents: {
        prd: {
          name: prdFileInfo?.originalName || body.prdUrl || "",
          path: prdFileInfo?.uploadPath || "",
        },
        rfc: { name: "", path: "", content: "" },
        figma: { name: "", path: "", content: "" },
      },
      additionalDocuments,
    };

    console.log("Received askAi request:", JSON.stringify({
      promptId,
      agent: payload.agent,
      projectName: payload.projectName,
      feature: payload.feature,
      additionalDocuments: payload.additionalDocuments?.map(d => ({ docType: d.docType, name: d.name })),
      hasPrdFile: !!prdFileInfo,
      prdUrl: payload.prdUrl || null,
    }, null, 2));

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
      data: { promptId, status: "QUEUED" },
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
    const uploadsDir = path.join(__dirname, "../data/uploads");
    for (const docType of ["prd", "rfc", "figma"]) {
      payload.documents[docType].path = findCoreDocumentPath(uploadsDir, promptId, docType);
    }

    payload.additionalDocuments = inferAdditionalDocumentsFromUploads(
      uploadsDir,
      promptId,
      record.additionalDocuments,
    );

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