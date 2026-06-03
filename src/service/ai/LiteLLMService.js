const axios = require("axios")
const fs = require("fs")
const path = require("path")
const { SYSTEM_PROMPT } = require("../../prompts")
const ConfigLoader = require("../../utils/ConfigLoader")
const { ENDPOINTS, DEFAULTS, HEADERS, ERROR_CODES } = require("../../constants/api/LLMApi")

// --- Defaults ---
const DEFAULT_MODEL = "claude-sonnet-4-6"

const getBaseUrl = () => ConfigLoader.get("LITELLM_BASE_URL", ENDPOINTS.LITELLM_DEFAULT_BASE_URL)
const getApiUrl = () => `${getBaseUrl()}${ENDPOINTS.CHAT_COMPLETIONS}`
const getApiKey = () => ConfigLoader.get("LITELLM_API_KEY", "")
const getDefaultModel = () => ConfigLoader.get("LITELLM_MODEL", DEFAULT_MODEL)

// --- Mime type helpers ---
const IMAGE_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
])

const guessMimeType = (filePath = "") => {
	const ext = path.extname(filePath).toLowerCase()
	const map = {
		".pdf": "application/pdf",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
		".md": "text/plain",
		".txt": "text/plain",
		".json": "application/json",
	}
	return map[ext] || "application/octet-stream"
}

// --- File → multimodal content block ---

/**
 * Convert an uploaded file into OpenAI-compatible content blocks.
 * For PDFs/images: sends as base64 image_url (LiteLLM translates to each provider's native format).
 * For text files: reads and returns as text block.
 */
const fileToContentBlocks = (file, label = "document") => {
	if (!file) return []

	const uploadPath = String(file.uploadPath || file.path || "").trim()
	if (!uploadPath) return []

	const mimeType = String(file.mimetype || file.mimeType || "").trim() || guessMimeType(uploadPath)
	const fileName = String(file.originalname || file.originalName || file.filename || "uploaded-file")

	try {
		if (!fs.existsSync(uploadPath)) {
			console.warn(`[LiteLLMService] File not found: ${uploadPath}`)
			return []
		}

		// For images: send as base64 via image_url (OpenAI multimodal format)
		if (IMAGE_MIME_TYPES.has(mimeType)) {
			const buffer = fs.readFileSync(uploadPath)
			const base64 = buffer.toString("base64")
			const dataUri = `data:${mimeType};base64,${base64}`

			console.log(`[LiteLLMService] fileToContentBlocks :: ${label} (${fileName}) — ${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB`)

			return [
				{ type: "text", text: `[Attached ${label}: ${fileName}]` },
				{ type: "image_url", image_url: { url: dataUri } },
			]
		}

		// For PDFs and text-based files: read as text (PDFs should already be extracted during enrichment)
		// If it's a PDF, try to read extracted content; otherwise include as-is for text files
		const textContent = mimeType === "application/pdf"
			? "" // PDF text is already in doc.content via enrichDocuments; skip re-reading binary
			: fs.readFileSync(uploadPath, "utf8").trim()
		if (textContent) {
			console.log(`[LiteLLMService] fileToContentBlocks :: ${label} (${fileName}) — text, ${textContent.length} chars`)
			return [
				{ type: "text", text: `[Attached ${label}: ${fileName}]\n\`\`\`\n${textContent}\n\`\`\`` },
			]
		}

		return []
	} catch (err) {
		console.warn(`[LiteLLMService] fileToContentBlocks :: failed for ${label}: ${err.message}`)
		return []
	}
}

// --- Build multimodal message content ---
const buildMessageContent = (prompt, options = {}) => {
	const documents = Array.isArray(options.documents) ? options.documents : []

	if (!documents.length) {
		console.log("[LiteLLMService] buildMessageContent :: no documents, text-only mode")
		return String(prompt || "")
	}

	// Only include documents that have file paths (i.e., uploaded files)
	const docsWithFiles = documents.filter((d) => String(d.path || "").trim())

	if (!docsWithFiles.length) {
		console.log("[LiteLLMService] buildMessageContent :: no documents with file paths, text-only mode")
		return String(prompt || "")
	}

	console.log(`[LiteLLMService] buildMessageContent :: building multimodal — ${docsWithFiles.length} document(s) with files`)

	// Start with the text prompt
	const contentBlocks = [
		{ type: "text", text: String(prompt || "") },
	]

	// Add file content blocks for each document
	for (const doc of docsWithFiles) {
		const label = `${doc.docType}: ${doc.name || doc.originalName || "document"}`
		const blocks = fileToContentBlocks(
			{ uploadPath: doc.path, mimeType: doc.mimeType || "", originalName: doc.name || doc.originalName || "" },
			label,
		)
		contentBlocks.push(...blocks)
	}

	if (contentBlocks.length === 1) {
		console.log("[LiteLLMService] buildMessageContent :: no file blocks generated, falling back to text-only")
		return String(prompt || "")
	}

	console.log(`[LiteLLMService] buildMessageContent :: ${contentBlocks.length} content blocks (${contentBlocks.length - 1} from files)`)
	return contentBlocks
}

// --- Main API call ---
const generateFromPrompt = async (prompt, options = {}) => {
	const apiUrl = getApiUrl()
	const apiKey = getApiKey()
	const model = String(options.model || getDefaultModel()).trim()

	if (!getBaseUrl()) {
		const error = new Error(
			"LITELLM_BASE_URL is not configured. Set it in Settings to use the LiteLLM agent. " +
			`Default: ${ENDPOINTS.LITELLM_DEFAULT_BASE_URL}`
		)
		error.statusCode = ERROR_CODES.VALIDATION_ERROR
		throw error
	}

	const messageContent = buildMessageContent(prompt, options)

	console.log(`[LiteLLMService] generateFromPrompt :: model=${model}, url=${apiUrl}`)

	const headers = {
		"Content-Type": HEADERS.CONTENT_TYPE,
	}
	if (apiKey) {
		headers["Authorization"] = `Bearer ${apiKey}`
	}

	let response
	try {
		const isNoTempModel = /\b(opus|o[1-9]|o3|o4)\b/i.test(model)

		response = await axios.post(
			apiUrl,
			{
				model,
				...(isNoTempModel ? {} : { temperature: DEFAULTS.TEMPERATURE }),
				max_tokens: DEFAULTS.MAX_TOKENS,
				messages: [
					{
						role: "system",
						content: SYSTEM_PROMPT,
					},
					{
						role: "user",
						content: messageContent,
					},
				],
			},
			{
				headers,
				timeout: DEFAULTS.TIMEOUT_MS,
			},
		)
	} catch (err) {
		const status = err.response?.status || "unknown"
		const detail =
			err.response?.data?.error?.message ||
			err.response?.data?.message ||
			JSON.stringify(err.response?.data || err.message)
		console.error(`[LiteLLMService] API error (${status}): model=${model}, detail=${detail}`)

		const error = new Error(`LiteLLM API error (${status}): ${detail}`)
		error.statusCode = err.response?.status || ERROR_CODES.SERVICE_UNAVAILABLE
		throw error
	}

	// Extract text from OpenAI-compatible response
	const choices = Array.isArray(response?.data?.choices) ? response.data.choices : []
	const content = choices[0]?.message?.content

	let text = ""
	if (typeof content === "string") {
		text = content.trim()
	} else if (Array.isArray(content)) {
		text = content
			.map((item) => {
				if (!item) return ""
				if (typeof item === "string") return item
				if (typeof item?.text === "string") return item.text
				return ""
			})
			.join("\n")
			.trim()
	}

	if (!text) {
		const error = new Error("LiteLLM returned an empty response")
		error.statusCode = ERROR_CODES.SERVICE_UNAVAILABLE
		throw error
	}

	console.log(`[LiteLLMService] generateFromPrompt :: response received (${text.length} chars)`)
	return text
}

module.exports = {
	generateFromPrompt,
}
