const { ulid } = require("ulid");
const FileReader = require("../utils/FileReader");
const {
    VALID_PLATFORMS,
    buildTestAnalysisPrompt,
    buildTestCaseGenerationPrompt,
    normalizePromptInput,
} = require("../prompts");
const { getSectionMeta, setSectionMeta, getSectionName } = require("./testrail/TestrailService");

const getTestCases = async (promptId) => {
    const data = FileReader.readDataFile(`testcases/${promptId}.json`);
    return data;
}

const getAnalyzeData = async (promptId) => {
    try {
        return FileReader.readDataFile(`analyze/${promptId}.md`);
    } catch (error) {
        if (error.code === "ENOENT") {
            try {
                return FileReader.readDataFile(`analyze/${promptId}.txt`);
            } catch (innerError) {
                if (innerError.code === "ENOENT") {
                    return "";
                }
                throw innerError;
            }
        }
        throw error;
    }
}

const resolvePromptInput = async (input = {}) => {
    const normalizedInput = normalizePromptInput(input);

    // If no PRD document has content, try to use existing analysis as fallback
    const prdDoc = Array.isArray(normalizedInput.documents)
        ? normalizedInput.documents.find((d) => d.docType === "PRD")
        : null;
    const hasPrdContent = prdDoc && String(prdDoc.content || "").trim();

    if (!hasPrdContent && String(input.promptId || "").trim()) {
        const analyzeData = await getAnalyzeData(String(input.promptId).trim());
        if (analyzeData && prdDoc) {
            prdDoc.content = analyzeData;
        } else if (analyzeData) {
            normalizedInput.documents = normalizedInput.documents || [];
            normalizedInput.documents.unshift({
                docType: "PRD",
                name: `${String(input.promptId).trim()}.md`,
                content: analyzeData,
                path: "",
            });
        }
    }

    return normalizedInput;
};

const getTestCaseGenerationPrompt = async (input = {}) => {
    const promptInput = await resolvePromptInput(input);
    return buildTestCaseGenerationPrompt({
        ...promptInput,
        analysisContext: String(input.analysisContext || "").trim(),
    });
};

const getTestAnalysisPrompt = async (input = {}) => {
    const promptInput = await resolvePromptInput(input);
    return buildTestAnalysisPrompt({
        ...promptInput,
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

// Accepts both numeric (TestRail) and string "sec_xxx" (local) sectionIds
const normalizeOptionalId = (value) => {
    if (value == null || value === "") {
        return null;
    }
    // String-based local ID (e.g. "sec_01ABC...")
    if (typeof value === "string" && value.startsWith("sec_")) {
        return value;
    }
    // Numeric TestRail ID
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
};

const generateLocalSectionId = () => `sec_${ulid()}`;

const normalizeSectionMeta = (payload = {}, fallback = {}) => {
    const fromPayloadSectionId = normalizeOptionalId(payload.sectionId);
    const fromPayloadSuiteId = normalizeOptionalNumber(payload.suiteId || payload.suite_id);
    const fromPayloadSource = String(payload.sectionSource || payload.section_source || "").trim().toLowerCase();

    const merged = {
        sectionId: fromPayloadSectionId != null ? fromPayloadSectionId : normalizeOptionalId(fallback.sectionId),
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

    if (Object.prototype.hasOwnProperty.call(payload, "platforms")) {
        const raw = Array.isArray(payload.platforms) ? payload.platforms : [];
        updatedTestCase.platforms = raw.filter(p => VALID_PLATFORMS.includes(p));
    }

    return Object.fromEntries(Object.entries(updatedTestCase).filter(([, value]) => value !== undefined));
};

const editTestCase = async (promptId, testcaseId, payload = {}) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const testCases = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    const tcIndex = testCases.findIndex((tc) => String(tc.id || "").trim() === testcaseId);
    if (tcIndex === -1) {
        const error = new Error("Test case not found");
        error.statusCode = 404;
        throw error;
    }

    const currentTC = testCases[tcIndex];
    const platformGroup = String(payload.platformGroup || "").trim() || null;

    // Build fallback meta from the TC's current section
    const sourceMeta = getSectionMeta(currentTC, platformGroup);
    const currentSectionName = normalizeSectionName(getSectionName(currentTC, platformGroup));
    const nextSectionName = normalizeSectionName(payload.section || currentSectionName);
    const nextSectionMeta = normalizeSectionMeta(payload, {
        sectionId: sourceMeta.sectionId,
        suiteId: sourceMeta.suiteId,
        sectionSource: sourceMeta.sectionSource,
    });

    const updatedFields = sanitizeUpdatedTestCase(payload, testcaseId);
    const updatedTestCase = {
        ...currentTC,
        ...updatedFields,
        id: testcaseId,
    };

    // Per-platform mode: update platform-specific section metadata on this TC
    if (platformGroup) {
        setSectionMeta(updatedTestCase, platformGroup, {
            sectionId: nextSectionMeta.sectionId,
            suiteId: nextSectionMeta.suiteId,
            sectionSource: nextSectionMeta.sectionSource || "testrail",
            name: nextSectionName,
        });

        testCases[tcIndex] = updatedTestCase;
        parsedData.testCases = testCases;
        FileReader.writeDataFile(fileName, parsedData);

        const resolvedMeta = getSectionMeta(updatedTestCase, platformGroup);
        return {
            promptId,
            testcaseId,
            data: parsedData,
            updatedTestCase: {
                ...updatedTestCase,
                section: nextSectionName,
                sectionId: resolvedMeta.sectionId ?? null,
                suiteId: resolvedMeta.suiteId ?? null,
                sectionSource: resolvedMeta.sectionSource || "ai",
            },
        };
    }

    // Unified mode: update _default section metadata on this TC
    setSectionMeta(updatedTestCase, null, {
        sectionId: nextSectionMeta.sectionId,
        suiteId: nextSectionMeta.suiteId,
        sectionSource: nextSectionMeta.sectionSource || "ai",
        name: nextSectionName,
    });

    testCases[tcIndex] = updatedTestCase;
    parsedData.testCases = testCases;
    FileReader.writeDataFile(fileName, parsedData);

    const resolvedMeta = getSectionMeta(updatedTestCase, platformGroup);
    return {
        promptId,
        testcaseId,
        data: parsedData,
        updatedTestCase: {
            ...updatedTestCase,
            section: nextSectionName,
            sectionId: resolvedMeta.sectionId ?? null,
            suiteId: resolvedMeta.suiteId ?? null,
            sectionSource: resolvedMeta.sectionSource || "ai",
        },
    };
};

const deleteTestCase = async (promptId, testcaseId) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const testCases = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    const tcIndex = testCases.findIndex((tc) => String(tc.id || "").trim() === testcaseId);
    if (tcIndex === -1) {
        const error = new Error("Test case not found");
        error.statusCode = 404;
        throw error;
    }

    const deletedTestCase = testCases[tcIndex];
    testCases.splice(tcIndex, 1);

    parsedData.testCases = testCases;
    FileReader.writeDataFile(fileName, parsedData);

    return {
        promptId,
        testcaseId,
        deletedTestCase,
        data: parsedData,
    };
};

const generateNextTestCaseId = (testCases = []) => {
    let maxNum = 0;
    testCases.forEach((tc) => {
        const match = String(tc.id || "").match(/^TC-(\d+)$/i);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    return `TC-${String(maxNum + 1).padStart(3, "0")}`;
};

const addTestCase = async (promptId, sectionName, payload = {}) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const testCases = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    const targetSectionName = normalizeSectionName(sectionName);
    const newId = generateNextTestCaseId(testCases);

    const newTestCase = sanitizeUpdatedTestCase({
        ...payload,
        id: newId,
    }, newId);

    // Ensure required fields have defaults
    newTestCase.id = newId;
    newTestCase.title = newTestCase.title || "";
    newTestCase.type = newTestCase.type || "positive";
    newTestCase.priority = newTestCase.priority || "medium";
    newTestCase.preconditions = newTestCase.preconditions || [];
    newTestCase.steps = newTestCase.steps || [];
    newTestCase.expectedResult = newTestCase.expectedResult || "";
    newTestCase.platforms = newTestCase.platforms || [];

    // Resolve section metadata: try to inherit from an existing TC in same section, otherwise create fresh
    const incomingSectionId = normalizeOptionalId(payload.sectionId);
    let resolvedSectionId = incomingSectionId;
    let resolvedSuiteId = normalizeOptionalNumber(payload.suiteId || payload.suite_id);
    let resolvedSectionSource = String(payload.sectionSource || payload.section_source || "").trim().toLowerCase() || null;

    if (resolvedSectionId == null) {
        // Look for an existing TC with the same section name to inherit its sectionId
        const existingTC = testCases.find((tc) => {
            const tcName = normalizeSectionName(getSectionName(tc));
            return tcName.toLowerCase() === targetSectionName.toLowerCase();
        });
        if (existingTC) {
            const existingMeta = getSectionMeta(existingTC);
            resolvedSectionId = existingMeta.sectionId;
            resolvedSuiteId = resolvedSuiteId ?? existingMeta.suiteId;
            resolvedSectionSource = resolvedSectionSource || existingMeta.sectionSource;
        }
    }

    // Attach section metadata directly on the TC
    newTestCase.section = {
        _default: {
            name: targetSectionName,
            sectionId: resolvedSectionId || generateLocalSectionId(),
            suiteId: resolvedSuiteId ?? null,
            sectionSource: resolvedSectionSource || "user",
        },
    };

    testCases.push(newTestCase);
    parsedData.testCases = testCases;
    FileReader.writeDataFile(fileName, parsedData);

    const resolvedMeta = getSectionMeta(newTestCase);
    return {
        promptId,
        testcaseId: newId,
        data: parsedData,
        addedTestCase: {
            ...newTestCase,
            section: targetSectionName,
            sectionId: resolvedMeta.sectionId ?? null,
            suiteId: resolvedMeta.suiteId ?? null,
            sectionSource: resolvedMeta.sectionSource || "ai",
        },
    };
};

const editSectionName = async (promptId, currentSectionName, newSectionName, sectionId = null) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const testCases = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    const normalizedCurrent = normalizeSectionName(currentSectionName).toLowerCase();
    const normalizedNew = normalizeSectionName(newSectionName);

    if (!normalizedNew || !normalizedNew.trim()) {
        const error = new Error("New section name is required");
        error.statusCode = 400;
        throw error;
    }

    // Find all TCs in the target section (by sectionId first, then name)
    const resolvedSectionId = normalizeOptionalId(sectionId);
    let matchingTCs = [];

    if (resolvedSectionId != null) {
        matchingTCs = testCases.filter((tc) => {
            if (!tc.section || typeof tc.section !== "object") return false;
            return Object.values(tc.section).some(
                (entry) => entry?.sectionId != null && String(entry.sectionId) === String(resolvedSectionId)
            );
        });
    }
    if (!matchingTCs.length) {
        matchingTCs = testCases.filter(
            (tc) => normalizeSectionName(getSectionName(tc)).toLowerCase() === normalizedCurrent
        );
    }

    if (!matchingTCs.length) {
        const error = new Error("Section not found");
        error.statusCode = 404;
        throw error;
    }

    // Block renaming TestRail sections
    const hasTestrailSource = matchingTCs.some((tc) =>
        Object.values(tc.section || {}).some(
            (entry) => String(entry?.sectionSource || "").toLowerCase() === "testrail"
        )
    );
    if (hasTestrailSource) {
        const error = new Error("Cannot rename a TestRail-synced section. Edit the section name directly in TestRail.");
        error.statusCode = 403;
        throw error;
    }

    // Check for name conflict with TCs in a different section
    const conflicting = testCases.find((tc) => {
        if (matchingTCs.includes(tc)) return false;
        return normalizeSectionName(getSectionName(tc)).toLowerCase() === normalizedNew.toLowerCase();
    });
    if (conflicting) {
        const error = new Error(`A section named "${normalizedNew}" already exists`);
        error.statusCode = 409;
        throw error;
    }

    // Update _default name on all matching TCs
    for (const tc of matchingTCs) {
        if (tc.section && tc.section._default && tc.section._default.name != null) {
            tc.section._default.name = normalizedNew;
        }
    }

    parsedData.testCases = testCases;
    FileReader.writeDataFile(fileName, parsedData);

    const sampleMeta = matchingTCs[0]?.section?._default;
    return {
        promptId,
        previousName: currentSectionName,
        newName: normalizedNew,
        sectionSource: sampleMeta?.sectionSource || "ai",
        data: parsedData,
    };
};

/**
 * Bulk move test cases to a target section.
 * Reads file once, updates all TCs atomically, writes once.
 *
 * @param {string} promptId
 * @param {string[]} testcaseIds - IDs of test cases to move
 * @param {object} target - { sectionName, sectionId, suiteId, sectionSource }
 * @param {string|null} platformGroup - null for unified mode, string for per-platform
 */
const bulkMoveSection = async (promptId, testcaseIds, target, platformGroup = null) => {
    const fileName = `testcases/${promptId}.json`;
    const rawData = FileReader.readDataFile(fileName);
    const parsedData = JSON.parse(rawData);
    const testCases = Array.isArray(parsedData.testCases) ? parsedData.testCases : [];

    const targetSectionName = normalizeSectionName(target.sectionName);
    const targetSectionId = normalizeOptionalId(target.sectionId);
    const targetSuiteId = normalizeOptionalId(target.suiteId) ?? null;
    const targetSectionSource = String(target.sectionSource || "ai").trim() || "ai";

    const idsToMove = new Set(testcaseIds.map(id => String(id || "").trim()).filter(Boolean));
    if (!idsToMove.size) {
        const error = new Error("No valid testcase IDs provided");
        error.statusCode = 400;
        throw error;
    }

    // Per-platform mode: update platform-specific section metadata on each TC
    if (platformGroup) {
        let updated = 0;
        for (const tc of testCases) {
            if (idsToMove.has(String(tc.id || "").trim())) {
                setSectionMeta(tc, platformGroup, {
                    sectionId: targetSectionId,
                    suiteId: targetSuiteId,
                    sectionSource: targetSectionSource,
                    name: targetSectionName,
                });
                updated += 1;
            }
        }

        parsedData.testCases = testCases;
        FileReader.writeDataFile(fileName, parsedData);
        return { promptId, moved: updated, targetSection: targetSectionName, mode: "per-platform", platformGroup };
    }

    // Unified mode: update _default section metadata on each TC
    // Resolve the sectionId to use: prefer provided, else find existing TC with that section, else generate fresh
    let resolvedSectionId = targetSectionId;
    if (resolvedSectionId == null) {
        const existingTC = testCases.find((tc) => {
            if (!idsToMove.has(String(tc.id || "").trim())) {
                return normalizeSectionName(getSectionName(tc)).toLowerCase() === targetSectionName.toLowerCase();
            }
            return false;
        });
        if (existingTC) {
            resolvedSectionId = getSectionMeta(existingTC).sectionId;
        }
    }
    if (resolvedSectionId == null) {
        resolvedSectionId = generateLocalSectionId();
    }

    let moved = 0;
    for (const tc of testCases) {
        if (idsToMove.has(String(tc.id || "").trim())) {
            setSectionMeta(tc, null, {
                sectionId: resolvedSectionId,
                suiteId: targetSuiteId,
                sectionSource: targetSectionSource,
                name: targetSectionName,
            });
            moved += 1;
        }
    }

    parsedData.testCases = testCases;
    FileReader.writeDataFile(fileName, parsedData);

    return { promptId, moved, targetSection: targetSectionName, mode: "unified" };
};

module.exports = {
    getTestCases,
    getAnalyzeData,
    editTestCase,
    deleteTestCase,
    addTestCase,
    editSectionName,
    bulkMoveSection,
    getTestAnalysisPrompt,
    getTestCaseGenerationPrompt,
    resolvePromptInput,
}