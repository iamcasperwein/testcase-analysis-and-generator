const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const { buildTestCaseGenerationPrompt } = require("../prompts");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

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

    const hasFiles = uploadedFiles.prd || uploadedFiles.rfc || uploadedFiles.figma;
    if (!hasFiles) {
        console.log("[GeminiService] buildGeminiInput :: no uploaded files, using text-only prompt");
    } else {
        console.log(`[GeminiService] buildGeminiInput :: uploading files — prd=${!!uploadedFiles.prd} rfc=${!!uploadedFiles.rfc} figma=${!!uploadedFiles.figma}`);
    }

    const fileParts = [
        ...await toFilePart(uploadedFiles.prd, "PRD file"),
        ...await toFilePart(uploadedFiles.rfc, "RFC file"),
        ...await toFilePart(uploadedFiles.figma, "Figma file"),
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
    console.log("[GeminiService] generateFromPrompt :: calling Gemini API...");
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
