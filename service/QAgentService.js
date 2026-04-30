const { ulid } = require("ulid");
const fs = require("fs");
const { PDFParse } = require("pdf-parse");
const FileReader = require("../utils/FileReader");
const TestCaseService = require("./TestCaseService");
const GeminiService = require("./GeminiService");

const AGENTS = Object.freeze({
    gemini: async ({ prompt, payload }) => GeminiService.generateFromPrompt(prompt, {
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
    const normalized = String(value || "gemini").trim().toLowerCase();
    return AGENTS[normalized] ? normalized : "gemini";
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
    } catch (error) {
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");

        if (start !== -1 && end !== -1 && end > start) {
            const candidate = content.slice(start, end + 1);
            return JSON.parse(candidate);
        }

        throw error;
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

const extractTextFromFile = async (filePath = "") => {
    if (!filePath) return "";
    console.log(`[QAgentService] extractTextFromFile :: reading file: ${filePath}`);
    try {
        const buffer = fs.readFileSync(filePath);
        const isPdf = filePath.toLowerCase().endsWith(".pdf");
        if (isPdf) {
            console.log(`[QAgentService] extractTextFromFile :: parsing PDF (${(buffer.length / 1024).toFixed(1)} KB)`);
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            const text = String(result.text || "").trim();
            console.log(`[QAgentService] extractTextFromFile :: PDF parsed OK — ${text.length} chars extracted`);
            return text;
        }
        // Plain text / markdown / JSON files
        const text = buffer.toString("utf8").trim();
        console.log(`[QAgentService] extractTextFromFile :: plain-text read OK — ${text.length} chars`);
        return text;
    } catch (err) {
        console.warn(`[QAgentService] extractTextFromFile :: FAILED for ${filePath} —`, err.message);
        return "";
    }
};

const enrichDocumentContents = async (documents = {}) => {
    console.log("[QAgentService] enrichDocumentContents :: start");
    const enriched = { ...documents };
    for (const docType of ["prd", "rfc", "figma"]) {
        const doc = enriched[docType];
        if (!doc) {
            console.log(`[QAgentService] enrichDocumentContents :: ${docType.toUpperCase()} — not provided, skipping`);
            continue;
        }
        if (String(doc.content || "").trim()) {
            console.log(`[QAgentService] enrichDocumentContents :: ${docType.toUpperCase()} — already has content (${doc.content.length} chars), skipping extraction`);
            continue;
        }
        if (!String(doc.path || "").trim()) {
            console.log(`[QAgentService] enrichDocumentContents :: ${docType.toUpperCase()} — no path, skipping`);
            continue;
        }
        console.log(`[QAgentService] enrichDocumentContents :: ${docType.toUpperCase()} — extracting from ${doc.path}`);
        const extracted = await extractTextFromFile(doc.path);
        if (extracted) {
            enriched[docType] = { ...doc, content: extracted };
            console.log(`[QAgentService] enrichDocumentContents :: ${docType.toUpperCase()} — enriched OK (${extracted.length} chars)`);
        } else {
            console.warn(`[QAgentService] enrichDocumentContents :: ${docType.toUpperCase()} — extraction returned empty`);
        }
    }
    console.log("[QAgentService] enrichDocumentContents :: done");
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

const processSubmission = async (payload = {}) => {
    console.log("[QAgentService] processSubmission :: start");

    const validatedPayload = sanitizeSubmissionPayload(payload);
    console.log("[QAgentService] processSubmission :: payload validated");
    console.log(`[QAgentService] processSubmission :: projectName=${validatedPayload.projectName} | docType=${validatedPayload.docType} | prd=${validatedPayload.prdUrl} | rfc=${validatedPayload.rfcUrl} | figma=${validatedPayload.figmaUrl}`);

    const promptId = payload.promptId || ulid();
    const agent = normalizeAgentName(validatedPayload.agent || validatedPayload.agentName);
    console.log(`[QAgentService] processSubmission :: promptId=${promptId} | agent=${agent}`);

    // Enrich documents with extracted text from uploaded files
    console.log("[QAgentService] processSubmission :: enriching document contents...");
    validatedPayload.documents = await enrichDocumentContents(validatedPayload.documents);
    console.log("[QAgentService] processSubmission :: document enrichment complete");

    appendPromptRecord(createInitialRecord({ promptId, payload: validatedPayload, agent }));
    console.log(`[QAgentService] processSubmission :: record created with status=RECEIVED`);

    updatePromptRecord(promptId, { status: "IN_PROGRESS", startAt: new Date().toISOString() });
    console.log(`[QAgentService] processSubmission :: status ->  IN_PROGRESS`);

    try {
        updatePromptRecord(promptId, { status: "PROCESSING" });
        console.log(`[QAgentService] processSubmission :: status -> PROCESSING`);

        // --- STEP 1: Analysis ---
        console.log("[QAgentService] processSubmission :: [Step 1/3] building analysis prompt...");
        const analysisPrompt = await TestCaseService.getTestAnalysisPrompt({
            ...validatedPayload,
            promptId,
            feature: validatedPayload.feature,
            additionalContext: validatedPayload.additionalContext || validatedPayload.context || "",
        });
        console.log(`[QAgentService] processSubmission :: [Step 1/3] analysis prompt built (${analysisPrompt.length} chars)`);

        const runAgent = AGENTS[agent];
        console.log(`[QAgentService] processSubmission :: [Step 1/3] sending analysis prompt to ${agent}...`);
        const analysisText = await runAgent({ prompt: analysisPrompt, payload: validatedPayload, promptId, mode: "analysis" });
        console.log(`[QAgentService] processSubmission :: [Step 1/3] analysis received (${analysisText.length} chars)`);

        FileReader.writeDataFile(`analyze/${promptId}.md`, analysisText);
        console.log(`[QAgentService] processSubmission :: [Step 1/3] analysis saved → analyze/${promptId}.md`);

        // --- STEP 2: Test Case Generation ---
        console.log("[QAgentService] processSubmission :: [Step 2/3] building test case generation prompt...");
        const testCasePrompt = await TestCaseService.getTestCaseGenerationPrompt({
            ...validatedPayload,
            promptId,
            feature: validatedPayload.feature,
            additionalContext: validatedPayload.additionalContext || validatedPayload.context || "",
            analysisContext: analysisText,
        });
        console.log(`[QAgentService] processSubmission :: [Step 2/3] test case prompt built (${testCasePrompt.length} chars)`);

        console.log(`[QAgentService] processSubmission :: [Step 2/3] sending test case prompt to ${agent}...`);
        const generatedText = await runAgent({ prompt: testCasePrompt, payload: validatedPayload, promptId, mode: "testcases" });
        console.log(`[QAgentService] processSubmission :: [Step 2/3] test cases received (${generatedText.length} chars)`);

        // --- STEP 3: Parse & Save ---
        console.log("[QAgentService] processSubmission :: [Step 3/3] parsing JSON response...");
        const parsed = extractJsonPayload(generatedText);
        const normalizedTestCases = normalizeGeneratedTestCases(parsed, validatedPayload.feature || validatedPayload.projectName || "");
        console.log(`[QAgentService] processSubmission :: [Step 3/3] parsed OK — ${normalizedTestCases.testCases?.length || 0} sections`);

        FileReader.writeDataFile(`testcases/${promptId}.json`, normalizedTestCases);
        console.log(`[QAgentService] processSubmission :: [Step 3/3] test cases saved ->  testcases/${promptId}.json`);

        const totalTestCases = countTestCases(normalizedTestCases);
        const completedRecord = updatePromptRecord(promptId, {
            status: "COMPLETED",
            endAt: new Date().toISOString(),
            testCaseCount: totalTestCases,
            failureNote: null,
            errorMessage: null,
        });

        console.log(`[QAgentService] processSubmission :: COMPLETED ✓ — promptId=${promptId} | totalTestCases=${totalTestCases}`);

        return {
            promptId,
            agent,
            status: completedRecord?.status || "COMPLETED",
            testCaseCount: totalTestCases,
        };
    } catch (error) {
        console.error(`[QAgentService] processSubmission :: FAILED x — promptId=${promptId} | error=${error.message}`);
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
};
