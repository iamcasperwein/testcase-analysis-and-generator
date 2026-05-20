const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const { buildTestCaseGenerationPrompt, SYSTEM_PROMPT } = require("../../prompts");
const ConfigLoader = require("../../utils/ConfigLoader");
const { DEFAULTS, ERROR_CODES } = require("../../constants/api/LLMApi");

const DEFAULT_MODEL = "models/gemini-2.5-flash";

const getDefaultModel = () => ConfigLoader.get("GEMINI_MODEL", DEFAULT_MODEL);

let _genAI = null;
let _fileManager = null;
let _cachedApiKey = null;

const getGenAI = () => {
    const apiKey = ConfigLoader.get("GEMINI_API_KEY");
    if (!apiKey) {
        const error = new Error("GEMINI_API_KEY is not configured. Set it in Settings to use the Gemini agent.");
        error.statusCode = ERROR_CODES.VALIDATION_ERROR;
        throw error;
    }
    // Re-initialize if the key has changed (e.g. updated via Settings)
    if (!_genAI || _cachedApiKey !== apiKey) {
        _genAI = new GoogleGenerativeAI(apiKey);
        _fileManager = new GoogleAIFileManager(apiKey);
        _cachedApiKey = apiKey;
    }
    return { genAI: _genAI, fileManager: _fileManager };
};

const getModel = (modelName) => {
    const { genAI } = getGenAI();
    return genAI.getGenerativeModel({
        model: modelName || getDefaultModel(),
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
            temperature: DEFAULTS.TEMPERATURE,
            topP: DEFAULTS.TOP_P,
            maxOutputTokens: DEFAULTS.MAX_TOKENS,
        },
    });
};

/**
 * Upload a file to the Gemini File API and return a fileData part.
 * Falls back to inline base64 if upload fails.
 */
const toFilePart = async (file, label) => {
    if (!file) return [];

    const uploadPath = String(file.uploadPath || file.path || "").trim();
    const mimeType = String(file.mimetype || file.mimeType || "application/pdf");
    const fileName = String(file.originalname || file.originalName || file.filename || "uploaded-file");

    if (!uploadPath) return [];

    try {
        const { fileManager } = getGenAI();
        const uploadResult = await fileManager.uploadFile(uploadPath, {
            mimeType,
            displayName: fileName,
        });

        console.log(`DEBUG:: Uploaded ${label} to Gemini File API: ${uploadResult.file.uri}`);

        return [
            { text: `Attached ${label || "document"}: ${fileName}` },
            {
                fileData: {
                    mimeType: uploadResult.file.mimeType,
                    fileUri: uploadResult.file.uri,
                },
            },
        ];
    } catch (err) {
        console.warn(`WARN:: Gemini file upload failed for ${label}, falling back to inline: ${err.message}`);

        // Fallback: inline base64
        try {
            const buffer = fs.readFileSync(uploadPath);
            console.log(`[GeminiService] toFilePart :: ${label} — inline base64 fallback OK (${(buffer.length / 1024).toFixed(1)} KB)`);
            return [
                { text: `Attached ${label || "document"}: ${fileName}` },
                {
                    inlineData: {
                        mimeType,
                        data: buffer.toString("base64"),
                    },
                },
            ];
        } catch (fallbackErr) {
            console.error(`[GeminiService] toFilePart :: ${label} — inline fallback also failed:`, fallbackErr.message);
            return [];
        }
    }
};

const buildGeminiInput = async (prompt, options = {}) => {
    console.log("[GeminiService] buildGeminiInput :: start");
    const documents = Array.isArray(options.documents) ? options.documents : [];

    // Only include documents that have file paths
    const docsWithFiles = documents.filter((d) => String(d.path || "").trim());

    if (!docsWithFiles.length) {
        console.log("[GeminiService] buildGeminiInput :: no documents with files, using text-only prompt");
    } else {
        console.log(`[GeminiService] buildGeminiInput :: uploading ${docsWithFiles.length} document file(s)`);
    }

    const fileParts = [];
    for (const doc of docsWithFiles) {
        const label = `${doc.docType}: ${doc.name || doc.originalName || "document"}`;
        const fileObj = {
            uploadPath: doc.path,
            mimeType: doc.fileInfo?.mimeType || doc.mimeType || "",
            originalName: doc.name || doc.originalName || "",
            filename: doc.filename || "",
        };
        const parts = await toFilePart(fileObj, label);
        fileParts.push(...parts);
    }

    const parts = [
        { text: String(prompt || "") },
        ...fileParts,
    ];

    // If no file attachments exist, keep simple string mode.
    if (parts.length === 1) {
        console.log("[GeminiService] buildGeminiInput :: built text-only input");
        return String(prompt || "");
    }

    console.log(`[GeminiService] buildGeminiInput :: built multipart input with ${parts.length} parts (${fileParts.length} file parts)`);
    return parts;
};

const generateFromPrompt = async (prompt, options = {}) => {
    console.log("[GeminiService] generateFromPrompt :: start");
    const modelInput = await buildGeminiInput(prompt, options);
    const modelName = String(options.model || getDefaultModel()).trim();
    console.log("[GeminiService] generateFromPrompt :: calling Gemini API...");
    const model = getModel(modelName);
    const result = await model.generateContent(modelInput);
    const text = result.response.text();
    console.log(`[GeminiService] generateFromPrompt :: response received (${text.length} chars)`);
    return text;
};

const generateTestCases = async (input = {}) => {
    const prompt = buildTestCaseGenerationPrompt(input);

    return generateFromPrompt(prompt, {
        documents: input.documents,
    });
};

module.exports = {
    generateFromPrompt,
    generateTestCases,
};
