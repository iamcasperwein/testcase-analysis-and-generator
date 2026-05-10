const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const { buildTestCaseGenerationPrompt, SYSTEM_PROMPT } = require("../prompts");

const DEFAULT_MODEL = String(process.env.GEMINI_MODEL || "models/gemini-2.5-flash").trim();

let _genAI = null;
let _fileManager = null;

const getGenAI = () => {
    if (!_genAI) {
        const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
        if (!apiKey) {
            const error = new Error("GEMINI_API_KEY is not configured. Set it in Settings or .env to use the Gemini agent.");
            error.statusCode = 400;
            throw error;
        }
        _genAI = new GoogleGenerativeAI(apiKey);
        _fileManager = new GoogleAIFileManager(apiKey);
    }
    return { genAI: _genAI, fileManager: _fileManager };
};

const getModel = (modelName) => {
    const { genAI } = getGenAI();
    return genAI.getGenerativeModel({
        model: modelName || DEFAULT_MODEL,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
            temperature: 0.2,
            topP: 0.95,
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
    const uploadedFiles = options.uploadedFiles || {};
    const additionalDocs = Array.isArray(uploadedFiles.additionalDocs) ? uploadedFiles.additionalDocs : [];

    const hasFiles = uploadedFiles.prd || uploadedFiles.rfc || uploadedFiles.figma || additionalDocs.length > 0;
    if (!hasFiles) {
        console.log("[GeminiService] buildGeminiInput :: no uploaded files, using text-only prompt");
    } else {
        console.log(`[GeminiService] buildGeminiInput :: uploading files — prd=${!!uploadedFiles.prd} rfc=${!!uploadedFiles.rfc} figma=${!!uploadedFiles.figma} additional=${additionalDocs.length}`);
    }

    const additionalParts = [];
    for (let i = 0; i < additionalDocs.length; i += 1) {
        const fileInfo = additionalDocs[i];
        const label = `Additional doc ${i + 1}: ${fileInfo?.originalName || fileInfo?.filename || "document"}`;
        const parts = await toFilePart(fileInfo, label);
        additionalParts.push(...parts);
    }

    const fileParts = [
        ...await toFilePart(uploadedFiles.prd, "PRD file"),
        ...await toFilePart(uploadedFiles.rfc, "RFC file"),
        ...await toFilePart(uploadedFiles.figma, "Figma file"),
        ...additionalParts,
    ];

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
    const modelName = String(options.model || DEFAULT_MODEL).trim();
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
        uploadedFiles: input.uploadedFiles,
    });
};

module.exports = {
    generateFromPrompt,
    generateTestCases,
};
