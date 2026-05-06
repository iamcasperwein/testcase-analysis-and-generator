const FileReader = require("../utils/FileReader");
const {
    DEFAULT_TEST_CASE_INPUT,
    buildTestAnalysisPrompt,
    buildTestCaseGenerationPrompt,
    normalizePromptInput,
} = require("../prompts");

const getTestCases = async (promptId) => {
    const data = FileReader.readDataFile(`testcases/${promptId}.json`);
    return data;
}

const getAnalyzeData = async (promptId) => {
    try {
        return FileReader.readDataFile(`analyze/${promptId}.md`);
    } catch (error) {
        if (error.code === "ENOENT") {
            return FileReader.readDataFile(`analyze/${promptId}.txt`);
        }
        throw error;
    }
}

const resolvePromptInput = async (input = {}) => {
    const normalizedInput = normalizePromptInput({
        ...DEFAULT_TEST_CASE_INPUT,
        ...input,
    });

    if (!String(normalizedInput.documents?.prd?.content || "").trim() && String(input.promptId || "").trim()) {
        const analyzeData = await getAnalyzeData(String(input.promptId).trim());
        normalizedInput.documents = {
            ...normalizedInput.documents,
            prd: {
                name: normalizedInput.documents?.prd?.name || `${String(input.promptId).trim()}.md`,
                content: analyzeData,
            },
        };
        normalizedInput.prdText = analyzeData;
    }

    return normalizedInput;
};

const getTestCaseGenerationPrompt = async (input = {}) => {
    const promptInput = await resolvePromptInput(input);
    return buildTestCaseGenerationPrompt({
        ...promptInput,
        analysisContext: String(input.analysisContext || "").trim(),
        uploadedFiles: input.uploadedFiles,
        uploadMeta: input.uploadMeta,
    });
};

const getTestAnalysisPrompt = async (input = {}) => {
    const promptInput = await resolvePromptInput(input);
    return buildTestAnalysisPrompt({
        ...promptInput,
        uploadedFiles: input.uploadedFiles,
        uploadMeta: input.uploadMeta,
    });
};

const normalizeMultilineField = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    if (value == null) {
        return [];
    }

    return [String(value).trim()].filter(Boolean);
};

const normalizeStepsField = (value) => {
    if (Array.isArray(value)) {
        // Array of {content, expected} objects
        if (value.length && typeof value[0] === "object" && value[0] !== null) {
            return value.map((step) => ({
                content: String(step.content || "").trim(),
                expected: String(step.expected || "N/A").trim(),
            })).filter((s) => s.content);
        }
        // Legacy: array of strings
        return value.map((item) => ({
            content: String(item).trim(),
            expected: "N/A",
        })).filter((s) => s.content);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => ({
                content: line,
                expected: "N/A",
            }));
    }

    return [];
};

const normalizeSectionName = (value) => {
    const section = String(value || "").trim();
    return section || "Uncategorized";
};

const normalizeOptionalNumber = (value) => {
    if (value == null || value === "") {
        return null;
    }

    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
};

const normalizeSectionMeta = (payload = {}, fallback = {}) => {
    const fromPayloadSectionId = normalizeOptionalNumber(payload.sectionId);
    const fromPayloadSuiteId = normalizeOptionalNumber(payload.suiteId || payload.suite_id);
    const fromPayloadSource = String(payload.sectionSource || payload.section_source || "").trim().toLowerCase();

    const merged = {
        sectionId: fromPayloadSectionId != null ? fromPayloadSectionId : normalizeOptionalNumber(fallback.sectionId),
        suiteId: fromPayloadSuiteId != null ? fromPayloadSuiteId : normalizeOptionalNumber(fallback.suiteId),
        sectionSource: fromPayloadSource || String(fallback.sectionSource || "").trim().toLowerCase() || "ai",
    };

    if (merged.sectionSource !== "testrail" && merged.sectionSource !== "ai" && merged.sectionSource !== "user") {
        merged.sectionSource = merged.sectionId != null ? "testrail" : "ai";
    }

    return merged;
};

const sanitizeUpdatedTestCase = (payload = {}, fallbackId) => {
    const updatedTestCase = {};

    if (payload.id != null || payload.testcaseId != null || fallbackId != null) {
        updatedTestCase.id = String(payload.id || payload.testcaseId || fallbackId || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(payload, "title")) {
        updatedTestCase.title = String(payload.title || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(payload, "type")) {
        updatedTestCase.type = String(payload.type || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
        updatedTestCase.priority = String(payload.priority || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(payload, "preconditions")) {
        updatedTestCase.preconditions = normalizeMultilineField(payload.preconditions);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "steps")) {
        updatedTestCase.steps = normalizeStepsField(payload.steps);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "expectedResult") || Object.prototype.hasOwnProperty.call(payload, "expected")) {
        updatedTestCase.expectedResult = String(payload.expectedResult || payload.expected || "").trim();
    }

    return Object.fromEntries(Object.entries(updatedTestCase).filter(([, value]) => value !== undefined));
};

const editTestCase = async (promptId, testcaseId, payload = {}) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const sectionGroups = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    let sourceSectionIndex = -1;
    let sourceTestCaseIndex = -1;

    for (let sectionIndex = 0; sectionIndex < sectionGroups.length; sectionIndex += 1) {
        const testCases = Array.isArray(sectionGroups[sectionIndex].testCases)
            ? sectionGroups[sectionIndex].testCases
            : [];
        const matchedIndex = testCases.findIndex((testCase) => String(testCase.id || "").trim() === testcaseId);

        if (matchedIndex !== -1) {
            sourceSectionIndex = sectionIndex;
            sourceTestCaseIndex = matchedIndex;
            break;
        }
    }

    if (sourceSectionIndex === -1 || sourceTestCaseIndex === -1) {
        const error = new Error("Test case not found");
        error.statusCode = 404;
        throw error;
    }

    const sourceSection = sectionGroups[sourceSectionIndex];
    const currentTestCase = sourceSection.testCases[sourceTestCaseIndex];
    const currentSectionName = normalizeSectionName(sourceSection.section);
    const nextSectionName = normalizeSectionName(payload.section || currentSectionName);
    const nextSectionMeta = normalizeSectionMeta(payload, {
        sectionId: sourceSection.sectionId,
        suiteId: sourceSection.suiteId,
        sectionSource: sourceSection.sectionSource,
    });
    const updatedFields = sanitizeUpdatedTestCase(payload, testcaseId);
    const updatedTestCase = {
        ...currentTestCase,
        ...updatedFields,
        id: testcaseId,
    };

    sourceSection.testCases.splice(sourceTestCaseIndex, 1);

    let targetSection = sectionGroups.find(
        (section) => normalizeSectionName(section.section).toLowerCase() === nextSectionName.toLowerCase()
    );

    if (!targetSection) {
        targetSection = {
            section: nextSectionName,
            sectionId: nextSectionMeta.sectionId,
            suiteId: nextSectionMeta.suiteId,
            sectionSource: nextSectionMeta.sectionSource,
            testCases: [],
        };
        sectionGroups.push(targetSection);
    }

    targetSection.section = targetSection.section || nextSectionName;
    if (nextSectionMeta.sectionId != null) {
        targetSection.sectionId = nextSectionMeta.sectionId;
    } else if (!Object.prototype.hasOwnProperty.call(targetSection, "sectionId")) {
        targetSection.sectionId = null;
    }

    if (nextSectionMeta.suiteId != null) {
        targetSection.suiteId = nextSectionMeta.suiteId;
    } else if (!Object.prototype.hasOwnProperty.call(targetSection, "suiteId")) {
        targetSection.suiteId = null;
    }

    targetSection.sectionSource = nextSectionMeta.sectionSource || targetSection.sectionSource || "ai";
    targetSection.testCases = Array.isArray(targetSection.testCases) ? targetSection.testCases : [];
    targetSection.testCases.push(updatedTestCase);

    parsedData.testCases = sectionGroups.filter((section) => {
        const testCases = Array.isArray(section.testCases) ? section.testCases : [];
        return testCases.length > 0;
    });

    FileReader.writeDataFile(fileName, parsedData);

    return {
        promptId,
        testcaseId,
        data: parsedData,
        updatedTestCase: {
            ...updatedTestCase,
            section: nextSectionName,
            sectionId: targetSection.sectionId ?? null,
            suiteId: targetSection.suiteId ?? null,
            sectionSource: targetSection.sectionSource || "ai",
        },
    };
};

const deleteTestCase = async (promptId, testcaseId) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const sectionGroups = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    let sourceSectionIndex = -1;
    let sourceTestCaseIndex = -1;

    for (let sectionIndex = 0; sectionIndex < sectionGroups.length; sectionIndex += 1) {
        const testCases = Array.isArray(sectionGroups[sectionIndex].testCases)
            ? sectionGroups[sectionIndex].testCases
            : [];
        const matchedIndex = testCases.findIndex((testCase) => String(testCase.id || "").trim() === testcaseId);

        if (matchedIndex !== -1) {
            sourceSectionIndex = sectionIndex;
            sourceTestCaseIndex = matchedIndex;
            break;
        }
    }

    if (sourceSectionIndex === -1 || sourceTestCaseIndex === -1) {
        const error = new Error("Test case not found");
        error.statusCode = 404;
        throw error;
    }

    const deletedTestCase = sectionGroups[sourceSectionIndex].testCases[sourceTestCaseIndex];
    sectionGroups[sourceSectionIndex].testCases.splice(sourceTestCaseIndex, 1);

    parsedData.testCases = sectionGroups.filter((section) => {
        const testCases = Array.isArray(section.testCases) ? section.testCases : [];
        return testCases.length > 0;
    });

    FileReader.writeDataFile(fileName, parsedData);

    return {
        promptId,
        testcaseId,
        deletedTestCase,
        data: parsedData,
    };
};

module.exports = {
    getTestCases,
    getAnalyzeData,
    editTestCase,
    deleteTestCase,
    getTestAnalysisPrompt,
    getTestCaseGenerationPrompt,
    resolvePromptInput,
}