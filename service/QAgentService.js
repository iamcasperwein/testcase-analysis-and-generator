const { ulid } = require("ulid");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { jsonrepair } = require("jsonrepair");
const FileReader = require("../utils/FileReader");
const { createActionLogger } = require("../utils/AppLogger");
const { validateContextFits } = require("../utils/TokenEstimator");
const { normalizePlatforms, VALID_PLATFORMS } = require("../prompts");
const TestCaseService = require("./TestCaseService");
const GeminiService = require("./ai/GeminiService");
const ClaudeService = require("./ai/ClaudeService");
const CopilotService = require("./ai/CopilotService");
const LiteLLMService = require("./ai/LiteLLMService");
const LarkService = require("./LarkService");
const FigmaService = require("./FigmaService");
const ConfigLoader = require("../utils/ConfigLoader");
const path = require("path");

const AGENTS = Object.freeze({
    claude: async ({ prompt, payload, model }) => ClaudeService.generateFromPrompt(prompt, {
        documents: payload?.documents,
        model,
    }),
    gemini: async ({ prompt, payload, model }) => GeminiService.generateFromPrompt(prompt, {
        documents: payload?.documents,
        model,
    }),
    copilot: async ({ prompt, payload, model }) => CopilotService.generateFromPrompt(prompt, {
        documents: payload?.documents,
        model,
    }),
    litellm: async ({ prompt, payload, model }) => LiteLLMService.generateFromPrompt(prompt, {
        documents: payload?.documents,
        model,
    }),
});

const getDefaultModels = () => ({
    copilot: ConfigLoader.get("GITHUB_MODEL", ""),
    claude: ConfigLoader.get("CLAUDE_MODEL", ""),
    gemini: ConfigLoader.get("GEMINI_MODEL", ""),
    litellm: ConfigLoader.get("LITELLM_MODEL", ""),
});

const resolveModelName = (agent = "", payload = {}) => {
    const explicitModel = String(payload?.model || payload?.modelName || "").trim();
    if (explicitModel) return explicitModel;

    const normalizedAgent = String(agent || "").trim().toLowerCase();
    return getDefaultModels()[normalizedAgent] || null;
};

const SubmissionValidationError = class extends Error {
    constructor(message) {
        super(message);
        this.name = "SubmissionValidationError";
        this.statusCode = 400;
    }
};

const normalizeAgentName = (value) => {
    const normalized = String(value || "claude").trim().toLowerCase();
    const aliases = {
        "github-copilot": "copilot",
        "github_copilot": "copilot",
        "githubcopilot": "copilot",
        "lite-llm": "litellm",
        "lite_llm": "litellm",
    };
    const agentName = aliases[normalized] || normalized;
    return AGENTS[agentName] ? agentName : "claude";
};

const PROMPT_DATA_LOCK = path.join(__dirname, "../data/promptdata.lock");
const LOCK_RETRY_MS = 50;
const LOCK_MAX_RETRIES = 40;
const LOCK_STALE_MS = 10000;

const acquireLock = () => {
    for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
        try {
            fs.writeFileSync(PROMPT_DATA_LOCK, String(Date.now()), { flag: "wx" });
            return true;
        } catch (err) {
            if (err.code === "EEXIST") {
                try {
                    const lockTime = Number(fs.readFileSync(PROMPT_DATA_LOCK, "utf8"));
                    if (Date.now() - lockTime > LOCK_STALE_MS) {
                        fs.unlinkSync(PROMPT_DATA_LOCK);
                        continue;
                    }
                } catch (_) { /* lock was removed between check and read — retry */ }

                const waitUntil = Date.now() + LOCK_RETRY_MS;
                while (Date.now() < waitUntil) { /* busy-wait */ }
                continue;
            }
            throw err;
        }
    }
    throw new Error("Could not acquire lock on promptdata.json after maximum retries");
};

const releaseLock = () => {
    try {
        fs.unlinkSync(PROMPT_DATA_LOCK);
    } catch (_) { /* already released */ }
};

const withPromptData = (callback) => {
    acquireLock();
    try {
        const records = readPromptData();
        const updated = callback(records);
        writePromptData(updated);
        return updated;
    } finally {
        releaseLock();
    }
};

const readPromptData = () => {
    try {
        const raw = FileReader.readDataFile("promptdata.json");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
};

const writePromptData = (records) => {
    FileReader.writeDataFile("promptdata.json", records);
};

const writePromptSnapshot = (promptId, stage, prompt) => {
    const safePromptId = String(promptId || "").trim();
    const safeStage = String(stage || "prompt").trim().toLowerCase();
    const text = String(prompt || "");

    if (!safePromptId || !text.trim()) {
        return;
    }

    FileReader.writeDataFile(`runtime/prompts/${safePromptId}-${safeStage}.txt`, text);
};

const appendPromptRecord = (record) => {
    withPromptData((records) => {
        records.push(record);
        return records;
    });
    return record;
};

const updatePromptRecord = (promptId, patch = {}) => {
    let updatedRecord = null;
    withPromptData((records) => {
        const recordIndex = records.findIndex((record) => String(record.promptId || "") === String(promptId));
        if (recordIndex === -1) return records;

        records[recordIndex] = {
            ...records[recordIndex],
            ...patch,
        };
        updatedRecord = records[recordIndex];
        return records;
    });
    return updatedRecord;
};

const stripMarkdownFences = (value = "") => {
    const text = String(value || "").trim();
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
};

const extractJsonPayload = (text = "") => {
    const content = stripMarkdownFences(text);

    try {
        return JSON.parse(content);
    } catch (firstError) {
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");

        if (start !== -1 && end !== -1 && end > start) {
            const candidate = content.slice(start, end + 1);
            try {
                return JSON.parse(candidate);
            } catch (_) {
                // Try repairing the JSON
                const repaired = jsonrepair(candidate);
                return JSON.parse(repaired);
            }
        }

        // Try repairing the full content as last resort
        const repaired = jsonrepair(content);
        return JSON.parse(repaired);
    }
};

const normalizeGeneratedTestCases = (generated, featureFallback = "", targetPlatforms = []) => {
    const testCaseSections = Array.isArray(generated?.testCases)
        ? generated.testCases
        : Array.isArray(generated?.testcases)
            ? generated.testcases
            : [];

    // If target platforms are specified, filter TC platforms against them; otherwise allow all valid platforms
    const allowedPlatforms = targetPlatforms.length > 0
        ? new Set(targetPlatforms)
        : new Set(VALID_PLATFORMS);

    // Flatten: each TC gets its own section metadata (shared sectionId within the same AI section group)
    const flatTestCases = [];
    for (const section of testCaseSections) {
        const sectionCases = Array.isArray(section?.testCases)
            ? section.testCases
            : Array.isArray(section?.testcases)
                ? section.testcases
                : [];

        const sectionName = String(section?.section || "Uncategorized").trim() || "Uncategorized";
        const sectionId = `sec_${ulid()}`;

        for (const tc of sectionCases) {
            flatTestCases.push({
                ...tc,
                platforms: Array.isArray(tc?.platforms)
                    ? tc.platforms.filter(p => allowedPlatforms.has(p))
                    : [],
                section: {
                    _default: {
                        name: sectionName,
                        sectionId,
                        suiteId: null,
                        sectionSource: "ai",
                    },
                },
            });
        }
    }

    return {
        feature: String(generated?.feature || featureFallback || "").trim(),
        platforms: Array.isArray(generated?.platforms) ? generated.platforms : [],
        assumptions: Array.isArray(generated?.assumptions) ? generated.assumptions : [],
        documentConflicts: Array.isArray(generated?.documentConflicts) ? generated.documentConflicts : [],
        testCases: flatTestCases,
    };
};

const createInitialRecord = ({ promptId, payload, agent, model }) => ({
    promptId,
    projectName: String(payload.projectName || payload.feature || "").trim() || null,
    feature: String(payload.feature || "").trim() || null,
    status: "RECEIVED",
    agent,
    model: String(model || payload?.model || "").trim() || null,
    platforms: Array.isArray(payload.platforms)
        ? payload.platforms
        : (typeof payload.platforms === "string" && payload.platforms.trim()
            ? payload.platforms.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
            : []),
    docType: String(payload.docType || "").trim() || null,
    documents: Array.isArray(payload.documents)
        ? payload.documents.map((doc = {}) => ({
            docType: String(doc.docType || "").trim(),
            name: String(doc.name || "").trim(),
            format: String(doc.format || "file").trim(),
            linkUrl: String(doc.linkUrl || "").trim(),
            filename: String(doc.filename || "").trim(),
            originalName: String(doc.originalName || "").trim(),
            path: String(doc.path || "").trim(),
        }))
        : [],
    createdAt: new Date().toISOString(),
    startAt: new Date().toISOString(),
    endAt: null,
    testCaseCount: null,
    resultAnalysis: `analyze/${promptId}.md`,
    resultTestCases: `testcases/${promptId}.json`,
    failureNote: null,
    errorMessage: null,
});

const extractTextFromFile = async (filePath = "", logger = null) => {
    if (!filePath) return "";
    logger?.step("Reading uploaded file for text extraction", { filePath });
    try {
        const buffer = fs.readFileSync(filePath);
        const isPdf = filePath.toLowerCase().endsWith(".pdf");
        if (isPdf) {
            logger?.step("Parsing PDF", { filePath, kb: Number((buffer.length / 1024).toFixed(1)) });
            const result = await pdfParse(buffer);
            const text = String(result.text || "").trim();
            logger?.success("PDF extracted", { filePath, chars: text.length });
            return text;
        }
        // Plain text / markdown / JSON files
        const text = buffer.toString("utf8").trim();
        logger?.success("Text file extracted", { filePath, chars: text.length });
        return text;
    } catch (err) {
        logger?.warn("File extraction failed", { filePath, error: err.message });
        return "";
    }
};

/**
 * Enrich all documents with extracted text from uploaded files or fetched from links.
 * Unified: works for any docType (PRD, RFC, FIGMA, etc.) and any format (file, link).
 */
const enrichDocuments = async (documents = [], logger = null) => {
    if (!Array.isArray(documents) || !documents.length) return [];
    logger?.start("Enriching documents");
    const enriched = [];
    for (const doc of documents) {
        if (String(doc.content || "").trim()) {
            logger?.step("Document already has content, skipping", { docType: doc.docType, chars: String(doc.content).length });
            enriched.push(doc);
            continue;
        }

        const format = String(doc.format || "file").toLowerCase();

        if (format === "link") {
            const linkUrl = String(doc.linkUrl || "").trim();
            if (!linkUrl) {
                logger?.warn("Link document has no URL, skipping", { docType: doc.docType });
                enriched.push(doc);
                continue;
            }

            // Route Figma URLs to FigmaService
            if (FigmaService.isFigmaUrl(linkUrl)) {
                logger?.step("Fetching Figma design document", { docType: doc.docType, linkUrl });
                try {
                    const figmaToken = ConfigLoader.get("FIGMA_ACCESS_TOKEN");
                    if (!figmaToken) {
                        throw Object.assign(new Error("FIGMA_ACCESS_TOKEN not configured. Set it in Settings."), { code: "FIGMA_TOKEN_MISSING" });
                    }
                    const result = await FigmaService.enrichFigmaDocument(linkUrl, figmaToken);
                    const content = result.content || "";
                    logger?.success("Figma document enriched", { docType: doc.docType, chars: content.length, hasImage: !!result.imageBuffer });

                    // Store raw Figma JSON for traceability
                    try {
                        const rawFileName = `fgm_${Date.now()}.json`;
                        FileReader.writeDataFile(`figma/${rawFileName}`, JSON.stringify(result.rawData, null, 2));
                        logger?.info("Figma raw data stored", { path: `data/figma/${rawFileName}` });
                    } catch (_) {}

                    const enrichedDoc = { ...doc, content };
                    // Attach image buffer for multimodal AI (Gemini/Claude)
                    if (result.imageBuffer) {
                        enrichedDoc.imageBuffer = result.imageBuffer;
                        enrichedDoc.imageMimeType = "image/png";
                    }
                    enriched.push(enrichedDoc);
                } catch (err) {
                    logger?.fail("Figma document fetch failed", {
                        docType: doc.docType,
                        linkUrl,
                        error: err.message,
                        errorCode: err.code || "FIGMA_FETCH_FAILED",
                    });
                    throw err;
                }
                continue;
            }

            // Fetch content from Lark URL
            logger?.step("Fetching document from link", { docType: doc.docType, linkUrl });
            try {
                const result = await LarkService.fetchContentFromUrl(linkUrl);
                const content = result.content || "";
                logger?.success("Link document fetched", { docType: doc.docType, chars: content.length });

                // Store fetched content to disk for traceability
                try {
                    const sanitizedName = `${doc.docType}_link_${Date.now()}.txt`;
                    FileReader.writeDataFile(`uploads/${sanitizedName}`, content);
                    logger?.info("Link content stored for traceability", { path: `uploads/${sanitizedName}` });
                } catch (_) {}

                enriched.push({ ...doc, content });
            } catch (err) {
                logger?.fail("Link document fetch failed", {
                    docType: doc.docType,
                    linkUrl,
                    error: err.message,
                    errorCode: err.code || "LARK_FETCH_FAILED",
                });
                // Hard stop: throw to terminate the entire submission
                throw err;
            }
            continue;
        }

        // File-based document (existing behavior)
        if (!String(doc.path || "").trim()) {
            logger?.step("Document has no path, skipping", { docType: doc.docType });
            enriched.push(doc);
            continue;
        }
        logger?.step("Extracting document", { docType: doc.docType, name: doc.name, path: doc.path });
        const extracted = await extractTextFromFile(doc.path, logger);
        enriched.push({ ...doc, content: extracted || "" });
        if (extracted) {
            logger?.success("Document enriched", { docType: doc.docType, chars: extracted.length });
        } else {
            logger?.warn("Document extraction returned empty", { docType: doc.docType, path: doc.path });
        }
    }
    logger?.success("Document enrichment completed", { total: enriched.length });
    return enriched;
};

const sanitizeSubmissionPayload = (payload = {}) => {
    const projectName = String(payload.projectName || payload.feature || "").trim();
    if (!projectName) {
        throw new SubmissionValidationError("projectName is required");
    }

    // Documents is now a unified array
    const documents = Array.isArray(payload.documents) ? payload.documents : [];

    // Validate: at least one PRD or some content
    const hasPrd = documents.some((d) => d.docType === "PRD" && (d.path || d.content || d.linkUrl));
    const rawContent = String(payload.rawContent || "").trim();

    if (!hasPrd && !rawContent) {
        throw new SubmissionValidationError("PRD is required. Upload a PRD file or provide PRD content.");
    }

    return {
        ...payload,
        agent: String(payload.agent || payload.agentName || "claude").trim().toLowerCase(),
        model: String(payload.model || payload.modelName || "").trim(),
        projectName,
        feature: String(payload.feature || projectName).trim(),
        platforms: normalizePlatforms(payload.platforms),
        documents,
        context: String(payload.context || "").trim(),
    };
};

const countTestCases = (data = {}) => {
    const testCases = Array.isArray(data.testCases) ? data.testCases : [];
    return testCases.length;
};

const processSubmission = async (payload = {}, { isRetry = false } = {}) => {
    const promptId = payload.promptId || ulid();
    const logger = createActionLogger({
        service: "QAgentService",
        action: isRetry ? "retrySubmission" : "processSubmission",
        promptId,
        fileName: `runtime/${promptId}.txt`,
        resetFile: !isRetry,
    });
    logger.start(isRetry ? "Retry initiated" : "Submission received", {
        payloadKeys: Object.keys(payload || {}),
    });

    let validatedPayload;
    try {
        validatedPayload = sanitizeSubmissionPayload(payload);
    } catch (error) {
        logger.fail(error, { stage: "sanitizeSubmissionPayload" });
        throw error;
    }
    logger.success("Payload validated", {
        projectName: validatedPayload.projectName,
        documents: (validatedPayload.documents || []).map(d => ({ docType: d.docType, name: d.name })),
    });

    const agent = normalizeAgentName(validatedPayload.agent || validatedPayload.agentName);
    const selectedModel = resolveModelName(agent, validatedPayload);
    validatedPayload.model = selectedModel || validatedPayload.model || "";
    logger.info("Agent selected", { promptId, agent, rawAgentValue: payload.agent });
    logger.info("Model selected", { promptId, model: selectedModel || null });

    const runSelectedAgent = async ({ prompt, payload, mode }) => {
        const handler = AGENTS[agent];
        if (!handler) {
            throw new Error(`Unknown agent "${agent}". Available agents: ${Object.keys(AGENTS).join(", ")}`);
        }

        // Warn if the prompt may exceed the model's safe context window
        const contextCheck = validateContextFits(prompt, selectedModel);
        if (!contextCheck.fits) {
            logger.warn("Prompt may exceed model context limit", {
                mode,
                estimated: contextCheck.estimated,
                safeLimit: contextCheck.safeLimit,
                excess: contextCheck.excess,
                model: selectedModel,
            });
        } else {
            logger.info("Context check passed", {
                mode,
                estimated: contextCheck.estimated,
                safeLimit: contextCheck.safeLimit,
                model: selectedModel,
            });
        }

        try {
            return await handler({ prompt, payload, promptId, mode, model: selectedModel });
        } catch (error) {
            const errorMsg = String(error.message || "");

            // Check if this is an auth/key issue vs a transient/service error
            const isAuthError = /api.key.*(invalid|not valid|missing|required|unauthorized)|401|403|authentication/i.test(errorMsg);
            const isConfigError = /not configured|is required/i.test(errorMsg);

            if (isAuthError || isConfigError) {
                const agentKeyMap = {
                    gemini: "GEMINI_API_KEY",
                    copilot: "GITHUB_TOKEN",
                    claude: "CLAUDE_API_KEY",
                    litellm: "LITELLM_API_KEY (optional) and LITELLM_BASE_URL",
                };
                const requiredKey = agentKeyMap[agent] || `API key for "${agent}"`;
                const msg = [
                    `Agent "${agent}" failed: ${errorMsg}`,
                    ``,
                    `To fix this, go to Settings and configure:`,
                    `  • ${requiredKey} — required for ${agent}`,
                ].join("\n");
                logger.fail(new Error(msg), { agent, mode });
                throw new Error(msg);
            }

            // For non-auth errors (rate limit, service unavailable, etc.), pass through as-is
            const msg = `Agent "${agent}" failed: ${errorMsg}`;
            logger.fail(new Error(msg), { agent, mode });
            throw new Error(msg);
        }
    };

    // Create prompt record BEFORE enrichment so failures are trackable
    if (!isRetry) {
        appendPromptRecord(createInitialRecord({ promptId, payload: validatedPayload, agent, model: selectedModel }));
        logger.success("Prompt record created", { status: "RECEIVED" });
    } else {
        updatePromptRecord(promptId, {
            status: "PROCESSING",
            model: selectedModel || null,
            endAt: null,
            failureNote: null,
            errorMessage: null,
        });
        logger.success("Prompt record updated for retry", { status: "PROCESSING" });
    }

    // Enrich documents with extracted text from uploaded files or Lark links
    logger.step("Enriching documents");
    try {
        validatedPayload.documents = await enrichDocuments(validatedPayload.documents, logger);
    } catch (enrichError) {
        const errorMsg = String(enrichError?.message || enrichError || "Document enrichment failed");
        logger.fail(enrichError, { stage: "enrichDocuments", promptId });
        updatePromptRecord(promptId, {
            status: "FAILED",
            endAt: new Date().toISOString(),
            failureNote: errorMsg,
            errorMessage: errorMsg,
        });
        enrichError.promptId = promptId;
        throw enrichError;
    }
    logger.success("Document enrichment complete", { totalDocs: validatedPayload.documents.length });

    updatePromptRecord(promptId, { status: isRetry ? "RETRYING" : "IN_PROGRESS", startAt: new Date().toISOString(), endAt: null, failureNote: null, errorMessage: null });
    logger.info("Status updated", { status: isRetry ? "RETRYING" : "IN_PROGRESS" });

    try {
        updatePromptRecord(promptId, { status: "PROCESSING" });
        logger.info("Status updated", { status: "PROCESSING" });

        // --- STEP 1: Analysis ---
        let analysisText = "";

        // On retry, try to reuse existing analysis
        if (isRetry) {
            try {
                analysisText = FileReader.readDataFile(`analyze/${promptId}.md`);
                logger.success("Step 1/3 - Reusing existing analysis (retry)", { chars: analysisText.length });
            } catch (_) {
                analysisText = "";
            }
        }

        if (!analysisText.trim()) {
            logger.step("Step 1/3 - Building analysis prompt");
            const analysisPrompt = await TestCaseService.getTestAnalysisPrompt({
                ...validatedPayload,
                promptId,
                feature: validatedPayload.feature,
                additionalContext: validatedPayload.additionalContext || validatedPayload.context || "",
            });
            logger.success("Step 1/3 - Analysis prompt built", { chars: analysisPrompt.length });
            writePromptSnapshot(promptId, "analysis", analysisPrompt);
            logger.info("Step 1/3 - Analysis prompt snapshot saved", { path: `runtime/prompts/${promptId}-analysis.txt` });

            logger.step("Step 1/3 - Sending analysis prompt", { agent });
            analysisText = await runSelectedAgent({ prompt: analysisPrompt, payload: validatedPayload, mode: "analysis" });
            logger.success("Step 1/3 - Analysis received", { chars: analysisText.length });

            FileReader.writeDataFile(`analyze/${promptId}.md`, analysisText);
            logger.success("Step 1/3 - Analysis saved", { path: `analyze/${promptId}.md` });
        }

        // --- STEP 2: Test Case Generation ---
        logger.step("Step 2/3 - Building test case generation prompt");
        const testCasePrompt = await TestCaseService.getTestCaseGenerationPrompt({
            ...validatedPayload,
            promptId,
            feature: validatedPayload.feature,
            additionalContext: validatedPayload.additionalContext || validatedPayload.context || "",
            analysisContext: analysisText,
        });
        logger.success("Step 2/3 - Test case prompt built", { chars: testCasePrompt.length });
        writePromptSnapshot(promptId, "testcases", testCasePrompt);
        logger.info("Step 2/3 - Test case prompt snapshot saved", { path: `runtime/prompts/${promptId}-testcases.txt` });

        logger.step("Step 2/3 - Sending test case prompt", { agent });
        const generatedText = await runSelectedAgent({ prompt: testCasePrompt, payload: validatedPayload, mode: "testcases" });
        logger.success("Step 2/3 - Test cases received", { chars: generatedText.length });

        // --- STEP 3: Parse & Save ---
        logger.step("Step 3/3 - Parsing generated test case JSON");
        const parsed = extractJsonPayload(generatedText);
        const normalizedTestCases = normalizeGeneratedTestCases(parsed, validatedPayload.feature || validatedPayload.projectName || "", validatedPayload.platforms || []);
        logger.success("Step 3/3 - Parsing completed", { sections: normalizedTestCases.testCases?.length || 0 });

        FileReader.writeDataFile(`testcases/${promptId}.json`, normalizedTestCases);
        logger.success("Step 3/3 - Test cases saved", { path: `testcases/${promptId}.json` });

        const totalTestCases = countTestCases(normalizedTestCases);
        const completedRecord = updatePromptRecord(promptId, {
            status: "COMPLETED",
            endAt: new Date().toISOString(),
            testCaseCount: totalTestCases,
            failureNote: null,
            errorMessage: null,
        });

        logger.success("Submission completed", { promptId, totalTestCases });

        return {
            promptId,
            agent,
            status: completedRecord?.status || "COMPLETED",
            testCaseCount: totalTestCases,
        };
    } catch (error) {
        logger.fail(error, { promptId });
        const failureNote = String(error?.message || error || "Unknown processing error");
        updatePromptRecord(promptId, {
            status: "FAILED",
            endAt: new Date().toISOString(),
            failureNote,
            errorMessage: failureNote,
        });
        error.promptId = promptId;
        throw error;
    }
};

module.exports = {
    normalizeAgentName,
    processSubmission,
    sanitizeSubmissionPayload,
    readPromptData,
};
