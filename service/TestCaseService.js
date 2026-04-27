const FileReader = require("../utils/FileReader");
const {
    DEFAULT_TEST_CASE_INPUT,
    buildTestCaseGenerationPrompt,
    normalizePromptInput,
} = require("../prompts");

const getTestCases = async (promptId) => {
    const data = FileReader.readDataFile(`testcases/${promptId}.json`);
    return data;
}

const getAnalyzeData = async (promptId) => {
    try {
        return FileReader.readDataFile(`analyze/${promptId}.txt`);
    } catch (error) {
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
                name: normalizedInput.documents?.prd?.name || `${String(input.promptId).trim()}.txt`,
                content: analyzeData,
            },
        };
        normalizedInput.prdText = analyzeData;
    }

    return normalizedInput;
};

const getTestCaseGenerationPrompt = async (input = {}) => {
    const promptInput = await resolvePromptInput(input);
    return buildTestCaseGenerationPrompt(promptInput);
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

const normalizeSectionName = (value) => {
    const section = String(value || "").trim();
    return section || "Uncategorized";
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
        updatedTestCase.steps = normalizeMultilineField(payload.steps);
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
        const testCases = Array.isArray(sectionGroups[sectionIndex]["test cases"])
            ? sectionGroups[sectionIndex]["test cases"]
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
    const currentTestCase = sourceSection["test cases"][sourceTestCaseIndex];
    const currentSectionName = normalizeSectionName(sourceSection.section);
    const nextSectionName = normalizeSectionName(payload.section || currentSectionName);
    const updatedFields = sanitizeUpdatedTestCase(payload, testcaseId);
    const updatedTestCase = {
        ...currentTestCase,
        ...updatedFields,
        id: testcaseId,
    };

    sourceSection["test cases"].splice(sourceTestCaseIndex, 1);

    let targetSection = sectionGroups.find(
        (section) => normalizeSectionName(section.section).toLowerCase() === nextSectionName.toLowerCase()
    );

    if (!targetSection) {
        targetSection = {
            section: nextSectionName,
            "test cases": [],
        };
        sectionGroups.push(targetSection);
    }

    targetSection.section = targetSection.section || nextSectionName;
    targetSection["test cases"] = Array.isArray(targetSection["test cases"]) ? targetSection["test cases"] : [];
    targetSection["test cases"].push(updatedTestCase);

    parsedData.testCases = sectionGroups.filter((section) => {
        const testCases = Array.isArray(section["test cases"]) ? section["test cases"] : [];
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
        },
    };
};

module.exports = {
    getTestCases,
    getAnalyzeData,
    editTestCase,
    getTestCaseGenerationPrompt,
    resolvePromptInput,
}