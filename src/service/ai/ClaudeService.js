const axios = require("axios")
const { SYSTEM_PROMPT } = require("../../prompts")
const ConfigLoader = require("../../utils/ConfigLoader")
const { ENDPOINTS, DEFAULTS, HEADERS, ERROR_CODES } = require("../../constants/api/LLMApi")

const DEFAULT_MODEL = "claude-sonnet-4-6"

const getApiKey = () => {
	const apiKey = ConfigLoader.get("CLAUDE_API_KEY")
	if (!apiKey) {
		const error = new Error("CLAUDE_API_KEY is required for Claude service")
		error.statusCode = ERROR_CODES.VALIDATION_ERROR
		throw error
	}

	return apiKey
}

const getDefaultModel = () => ConfigLoader.get("CLAUDE_MODEL", DEFAULT_MODEL)

const generateFromPrompt = async (prompt, options = {}) => {
	const apiKey = getApiKey()
	const messagePrompt = String(prompt || "").trim()
	const model = String(options.model || getDefaultModel()).trim()
	const systemPrompt = options.systemPrompt || SYSTEM_PROMPT

	if (!messagePrompt) {
		const error = new Error("Prompt is required")
		error.statusCode = ERROR_CODES.VALIDATION_ERROR
		throw error
	}

	const response = await axios.post(
		ENDPOINTS.CLAUDE,
		{
			model,
			max_tokens: DEFAULTS.MAX_TOKENS,
			temperature: DEFAULTS.TEMPERATURE,
			system: systemPrompt,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: messagePrompt,
						},
					],
				},
			],
		},
		{
			headers: {
				"Content-Type": HEADERS.CONTENT_TYPE,
				"x-api-key": apiKey,
				"anthropic-version": DEFAULTS.ANTHROPIC_VERSION,
			},
			timeout: DEFAULTS.TIMEOUT_MS,
		},
	)

	const content = Array.isArray(response?.data?.content) ? response.data.content : []
	const text = content
		.filter((item) => item?.type === "text")
		.map((item) => String(item?.text || ""))
		.join("\n")
		.trim()

	if (!text) {
		const error = new Error("Claude returned an empty response")
		error.statusCode = ERROR_CODES.SERVICE_UNAVAILABLE
		throw error
	}

	return text
}

module.exports = {
	generateFromPrompt,
}
