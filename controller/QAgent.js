const QAgentService = require("../service/QAgentService");
const FileExtractor = require("../utils/FileExtractor");
const { resolveDocType } = require("../constants/docTypes");
const { isValidLarkUrl } = require("../service/LarkService");
const { ERROR_CODES: LARK_ERROR_CODES } = require("../constants/api/LarkApi");
const path = require("path");
const fs = require("fs");
const { ulid } = require("ulid");

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * On retry, reconstruct documents array from files on disk.
 */
const inferDocumentsFromUploads = (uploadsDir, promptId, existingDocuments = []) => {
	const existing = Array.isArray(existingDocuments) ? existingDocuments : [];

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
				next.name = next.originalName || next.filename || `document-${index + 1}`;
			}
			if (!next.docType) {
				next.docType = "OTHER";
			}
			return next;
		});
	}

	// Fallback: scan uploads directory for files matching this promptId
	const safePromptId = escapeRegExp(promptId);
	const pattern = new RegExp(`^${safePromptId}_(.+?)(?:_\\d+)?\\.[^.]+$`, "i");

	try {
		return fs
			.readdirSync(uploadsDir)
			.map((file) => {
				const match = file.match(pattern);
				if (!match) return null;
				const inferredType = resolveDocType(match[1]);
				return {
					docType: inferredType,
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

const askAi = async (req, res) => {
	try {
		const body = req.body || {};
		const files = req.files || {};

		const promptId = ulid();

		// All files come under "documents" field
		const uploadedFiles = Array.isArray(files.documents) ? files.documents : [];

		// Parallel arrays from FE: docTypes[], docNames[], docFormats[], docLinkUrls[]
		const docTypes = Array.isArray(body.docTypes)
			? body.docTypes
			: body.docTypes ? [body.docTypes] : [];
		const docNames = Array.isArray(body.docNames)
			? body.docNames
			: body.docNames ? [body.docNames] : [];
		const docFormats = Array.isArray(body.docFormats)
			? body.docFormats
			: body.docFormats ? [body.docFormats] : [];
		const docLinkUrls = Array.isArray(body.docLinkUrls)
			? body.docLinkUrls
			: body.docLinkUrls ? [body.docLinkUrls] : [];

		// Determine total document count from metadata arrays (not uploadedFiles)
		const totalDocs = Math.max(docTypes.length, docNames.length, docFormats.length, docLinkUrls.length);

		// Build unified documents array supporting both 'file' and 'link' formats
		const documents = [];
		let fileIndex = 0; // tracks which uploaded file maps to which doc slot

		for (let idx = 0; idx < totalDocs; idx++) {
			const format = String(docFormats[idx] || "file").trim().toLowerCase();
			const rawDocType = String(docTypes[idx] || "").trim();
			const customName = String(docNames[idx] || "").trim();

			if (format === "link") {
				// Link-based document
				const linkUrl = String(docLinkUrls[idx] || "").trim();
				const docType = resolveDocType(rawDocType || "OTHER");

				if (!linkUrl) {
					return res.status(400).json({
						success: false,
						error: `Document row ${idx + 1} (${docType}): link URL is required when format is "link".`,
						errorCode: "MISSING_LINK_URL",
						documentIndex: idx,
					});
				}

				if (!isValidLarkUrl(linkUrl)) {
					return res.status(400).json({
						success: false,
						error: `Document row ${idx + 1} (${docType}): only Lark doc/wiki URLs are supported (e.g. https://xxx.larksuite.com/docx/...).`,
						errorCode: "INVALID_LARK_URL",
						documentIndex: idx,
					});
				}

				documents.push({
					docType,
					name: customName || `${docType} (link)`,
					format: "link",
					linkUrl,
					path: "",
					originalName: "",
					content: "", // will be fetched during enrichment
				});
			} else {
				// File-based document (existing behavior)
				const file = uploadedFiles[fileIndex];
				fileIndex++;

				if (!file) {
					// No file provided for this slot - skip
					continue;
				}

				const docType = resolveDocType(rawDocType || customName || file.originalname || "OTHER");

				// Rename file: {promptId}_{DOCTYPE}_{index}.ext
				const ext = path.extname(file.originalname);
				const newFilename = `${promptId}_${docType}_${idx}${ext}`;
				const newPath = path.join(path.dirname(file.path), newFilename);
				try {
					fs.renameSync(file.path, newPath);
					file.path = newPath;
					file.filename = newFilename;
				} catch (_) {}

				const fileInfo = FileExtractor.getFileInfo(file);

				documents.push({
					docType,
					name: customName || file.originalname,
					format: "file",
					linkUrl: "",
					path: file.path,
					originalName: file.originalname,
					content: "",
					fileInfo,
				});
			}
		}

		// Validate: at least one PRD document is required
		const hasPrd = documents.some((d) => d.docType === "PRD");
		if (!hasPrd) {
			return res.status(400).json({
				success: false,
				error: "At least one PRD document is required.",
			});
		}

		const payload = {
			...body,
			promptId,
			documents,
		};

		console.log("Received askAi request:", JSON.stringify({
			promptId,
			agent: payload.agent,
			projectName: payload.projectName,
			feature: payload.feature,
			documents: documents.map((d) => ({ docType: d.docType, name: d.name })),
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

		const records = QAgentService.readPromptData();
		const record = records.find((r) => String(r.promptId || "") === String(promptId));
		if (!record) {
			return res.status(404).json({ success: false, error: `Prompt not found: ${promptId}` });
		}
		if (!/FAILED|ERROR/i.test(record.status || "")) {
			return res.status(400).json({ success: false, error: `Prompt is not failed (status: ${record.status})` });
		}

		const uploadsDir = path.join(__dirname, "../data/uploads");

		const payload = {
			promptId,
			projectName: record.projectName || "",
			feature: record.feature || record.projectName || "",
			agent: record.agent || "claude",
			model: record.model || "",
			platforms: record.platforms || [],
			documents: inferDocumentsFromUploads(uploadsDir, promptId, record.documents),
		};

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
