const { ulid } = require("ulid");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { jsonrepair } = require("jsonrepair");
const FileReader = require("../utils/FileReader");
const { createActionLogger } = require("../utils/AppLogger");
const { validateContextFits } = require("../utils/TokenEstimator");
const TestCaseService = require("./TestCaseService");
const GeminiService = require("./GeminiService");
const ClaudeService = require("./ClaudeService");
const CopilotService = require("./CopilotService");
const path = require("path");

const AGENTS = Object.freeze({
    claude: async ({ prompt, payload, model }) => ClaudeService.generateFromPrompt(prompt, {
        uploadedFiles: payload?.uploadedFiles,
        model,
    }),
    gemini: async ({ prompt, payload, model }) => GeminiService.generateFromPrompt(prompt, {
        uploadedFiles: payload?.uploadedFiles,
        model,
    }),
    copilot: async ({ prompt, payload, model }) => CopilotService.generateFromPrompt(prompt, {
        uploadedFiles: payload?.uploadedFiles,
        model,
    }),
});

const DEFAULT_MODELS = Object.freeze({
    copilot: String(process.env.GITHUB_MODEL || "openai/gpt-5-chat").trim(),
    claude: String(process.env.CLAUDE_MODEL || "claude-sonnet-4-6").trim(),
    gemini: String(process.env.GEMINI_MODEL || "models/gemini-2.5-flash").trim(),
});

const resolveModelName = (agent = "", payload = {}) => {
    const explicitModel = String(payload?.model || payload?.modelName || "").trim();
    if (explicitModel) return explicitModel;

    const normalizedAgent = String(agent || "").trim().toLowerCase();
    return DEFAULT_MODELS[normalizedAgent] || null;
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

const normalizeGeneratedTestCases = (generated, featureFallback = "") => {
    const testCaseSections = Array.isArray(generated?.testCases)
        ? generated.testCases
        : Array.isArray(generated?.testcases)
            ? generated.testcases
            : [];

    const normalizedSections = testCaseSections.map((section) => {
        const sectionCases = Array.isArray(section?.testCases)
            ? section.testCases
            : Array.isArray(section?.testcases)
                ? section.testcases
                : [];

        return {
            section: String(section?.section || "Uncategorized").trim() || "Uncategorized",
            sectionId: String(section?.sectionId || "").trim() || `sec_${ulid()}`,
            sectionSource: "ai",
            "testCases": sectionCases,
        };
    });

    return {
        feature: String(generated?.feature || featureFallback || "").trim(),
        testCases: normalizedSections,
    };
};

const createInitialRecord = ({ promptId, payload, agent, model }) => ({
    promptId,
    projectName: String(payload.projectName || payload.feature || "").trim() || null,
    status: "RECEIVED",
    agent,
    model: String(model || payload?.model || "").trim() || null,
    docType: String(payload.docType || "").trim() || null,
    prdUrl: String(payload.prdUrl || payload.documents?.prd?.name || "").trim() || null,
    rfcUrl: String(payload.rfcUrl || payload.documents?.rfc?.name || "").trim() || null,
    figmaUrl: String(payload.figmaUrl || payload.documents?.figma?.name || "").trim() || null,
    createdAt: new Date().toISOString(),
    startAt: new Date().toISOString(),
    endAt: null,
    testCaseCount: null,
    resultAnalysis: `analyze/${promptId}.md`,
    resultTestCases: `testcases/${promptId}.json`,
    additionalDocuments: Array.isArray(payload.additionalDocuments)
        ? payload.additionalDocuments.map((doc = {}) => ({
            docType: String(doc.docType || "").trim(),
            name: String(doc.name || "").trim(),
            filename: String(doc.filename || "").trim(),
            originalName: String(doc.originalName || "").trim(),
            path: String(doc.path || "").trim(),
        }))
        : [],
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

const enrichDocumentContents = async (documents = {}, logger = null) => {
    logger?.start("Enriching document contents");
    const enriched = { ...documents };
    for (const docType of ["prd", "rfc", "figma"]) {
        const doc = enriched[docType];
        if (!doc) {
            logger?.step("Document not provided, skipping", { docType });
            continue;
        }
        if (String(doc.content || "").trim()) {
            logger?.step("Document already has content, skipping extraction", { docType, chars: String(doc.content || "").length });
            continue;
        }
        if (!String(doc.path || "").trim()) {
            logger?.step("Document has no path, skipping extraction", { docType });
            continue;
        }
        logger?.step("Extracting document", { docType, path: doc.path });
        const extracted = await extractTextFromFile(doc.path, logger);
        if (extracted) {
            enriched[docType] = { ...doc, content: extracted };
            logger?.success("Document enriched", { docType, chars: extracted.length });
        } else {
            logger?.warn("Document extraction returned empty", { docType, path: doc.path });
        }
    }
    logger?.success("Document enrichment completed");
    return enriched;
};

const enrichAdditionalDocuments = async (additionalDocuments = [], logger = null) => {
    if (!Array.isArray(additionalDocuments) || !additionalDocuments.length) return [];
    const enriched = [];
    for (const doc of additionalDocuments) {
        if (String(doc.content || "").trim()) {
            enriched.push(doc);
            continue;
        }
        if (!String(doc.path || "").trim()) {
            enriched.push(doc);
            continue;
        }
        logger?.step("Extracting additional document", { docType: doc.docType, name: doc.name });
        const extracted = await extractTextFromFile(doc.path, logger);
        enriched.push({ ...doc, content: extracted || "" });
        if (extracted) {
            logger?.success("Additional doc enriched", { docType: doc.docType, chars: extracted.length });
        }
    }
    return enriched;
};

const sanitizeSubmissionPayload = (payload = {}) => {
    const projectName = String(payload.projectName || payload.feature || "").trim();
    if (!projectName) {
        throw new SubmissionValidationError("projectName is required");
    }

    const hasPrdPath = Boolean(payload.documents?.prd?.path);
    const hasPrdUrl = Boolean(payload.documents?.prd?.name);
    const prdContent = String(payload.documents?.prd?.content || payload.prdText || "").trim();
    const rawContent = String(payload.rawContent || "").trim();

    if (!hasPrdPath && !hasPrdUrl && !prdContent && !rawContent) {
        throw new SubmissionValidationError("PRD is required. Upload a PRD file or provide PRD content.");
    }

    const normalizedDocuments = {
        prd: {
            name: String(payload.documents?.prd?.name || payload.prdUrl || "").trim(),
            path: String(payload.documents?.prd?.path || "").trim(),
            content: prdContent || rawContent,
        },
        rfc: {
            name: String(payload.documents?.rfc?.name || payload.rfcUrl || "").trim(),
            path: String(payload.documents?.rfc?.path || "").trim(),
            content: String(payload.documents?.rfc?.content || "").trim(),
        },
        figma: {
            name: String(payload.documents?.figma?.name || payload.figmaUrl || "").trim(),
            path: String(payload.documents?.figma?.path || "").trim(),
            content: String(payload.documents?.figma?.content || "").trim(),
        },
    };

    return {
        ...payload,
        agent: String(payload.agent || payload.agentName || "claude").trim().toLowerCase(),
        model: String(payload.model || payload.modelName || "").trim(),
        projectName,
        feature: String(payload.feature || projectName).trim(),
        documents: normalizedDocuments,
        prdUrl: String(payload.prdUrl || normalizedDocuments.prd.name || "").trim(),
        rfcUrl: String(payload.rfcUrl || normalizedDocuments.rfc.name || "").trim(),
        figmaUrl: String(payload.figmaUrl || normalizedDocuments.figma.name || "").trim(),
        context: String(payload.context || "").trim(),
    };
};

const countTestCases = (data = {}) => {
    const sections = Array.isArray(data.testCases) ? data.testCases : [];
    return sections.reduce((sum, section) => {
        const list = Array.isArray(section?.testCases) ? section.testCases : [];
        return sum + list.length;
    }, 0);
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
        docType: validatedPayload.docType,
        prdUrl: validatedPayload.prdUrl,
        rfcUrl: validatedPayload.rfcUrl,
        figmaUrl: validatedPayload.figmaUrl,
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

    // Enrich documents with extracted text from uploaded files
    logger.step("Enriching document contents");
    validatedPayload.documents = await enrichDocumentContents(validatedPayload.documents, logger);
    validatedPayload.additionalDocuments = await enrichAdditionalDocuments(validatedPayload.additionalDocuments || [], logger);
    logger.success("Document enrichment complete", { additionalDocs: validatedPayload.additionalDocuments.length });

    if (!isRetry) {
        appendPromptRecord(createInitialRecord({ promptId, payload: validatedPayload, agent, model: selectedModel }));
        logger.success("Prompt record created", { status: "RECEIVED" });
    } else {
        updatePromptRecord(promptId, {
            model: selectedModel || null,
        });
    }

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
        const normalizedTestCases = normalizeGeneratedTestCases(parsed, validatedPayload.feature || validatedPayload.projectName || "");
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
