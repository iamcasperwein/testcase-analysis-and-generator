const { ulid } = require("ulid");
const fs = require("fs");
const { PDFParse } = require("pdf-parse");
const { jsonrepair } = require("jsonrepair");
const FileReader = require("../utils/FileReader");
const { createActionLogger } = require("../utils/AppLogger");
const TestCaseService = require("./TestCaseService");
const GeminiService = require("./GeminiService");
const ClaudeService = require("./ClaudeService");
const CopilotService = require("./CopilotService");

const AGENTS = Object.freeze({
    claude: async ({ prompt, payload }) => ClaudeService.generateFromPrompt(prompt, {
        uploadedFiles: payload?.uploadedFiles,
    }),
    gemini: async ({ prompt, payload }) => GeminiService.generateFromPrompt(prompt, {
        uploadedFiles: payload?.uploadedFiles,
    }),
    copilot: async ({ prompt, payload }) => CopilotService.generateFromPrompt(prompt, {
        uploadedFiles: payload?.uploadedFiles,
    }),
});

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

const appendPromptRecord = (record) => {
    const records = readPromptData();
    records.push(record);
    writePromptData(records);
    return record;
};

const updatePromptRecord = (promptId, patch = {}) => {
    const records = readPromptData();
    const recordIndex = records.findIndex((record) => String(record.promptId || "") === String(promptId));

    if (recordIndex === -1) {
        return null;
    }

    records[recordIndex] = {
        ...records[recordIndex],
        ...patch,
    };

    writePromptData(records);
    return records[recordIndex];
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
            "testCases": sectionCases,
        };
    });

    return {
        feature: String(generated?.feature || featureFallback || "").trim(),
        testCases: normalizedSections,
    };
};

const createInitialRecord = ({ promptId, payload, agent }) => ({
    promptId,
    projectName: String(payload.projectName || payload.feature || "").trim() || null,
    status: "RECEIVED",
    agent,
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
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
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
    logger.info("Agent selected", { promptId, agent, rawAgentValue: payload.agent });

    const runSelectedAgent = async ({ prompt, payload, mode }) => {
        const handler = AGENTS[agent];
        if (!handler) {
            throw new Error(`Unknown agent "${agent}". Available agents: ${Object.keys(AGENTS).join(", ")}`);
        }

        try {
            return await handler({ prompt, payload, promptId, mode });
        } catch (error) {
            const errorMsg = String(error.message || "");

            // Check if this is an auth/key issue vs a transient/service error
            const isAuthError = /api.key.*(invalid|not valid|missing|required|unauthorized)|401|403|authentication/i.test(errorMsg);
            const isConfigError = /not configured|is required/i.test(errorMsg);

            if (isAuthError || isConfigError) {
                const agentKeyMap = {
                    gemini: "GEMINI_API_KEY",
                    copilot: "COPILOT_TOKEN",
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
    logger.success("Document enrichment complete");

    if (!isRetry) {
        appendPromptRecord(createInitialRecord({ promptId, payload: validatedPayload, agent }));
        logger.success("Prompt record created", { status: "RECEIVED" });
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
