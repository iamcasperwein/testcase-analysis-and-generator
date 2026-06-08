const axios = require("axios")
const { SYSTEM_PROMPT } = require("../../prompts")
const { estimateTokens } = require("../../utils/TokenEstimator")
const ConfigLoader = require("../../utils/ConfigLoader")
const { ENDPOINTS, DEFAULTS, HEADERS, ERROR_CODES } = require("../../constants/api/LLMApi")

const DEFAULT_MODEL = "openai/gpt-4o-mini"

// GitHub Models platform limits (free-tier per-request caps, NOT theoretical model context windows)
const MODEL_INPUT_LIMITS = Object.freeze({
	"openai/gpt-5": 4000,
	"openai/gpt-5-chat": 4000,
	"openai/o3": 4000,
	"openai/o4-mini": 16000,
	"openai/gpt-4.1": 8000,
	"openai/gpt-4.1-mini": 8000,
	"openai/gpt-4.1-nano": 8000,
	"openai/gpt-4o": 8000,
	"openai/gpt-4o-mini": 8000,
})

const DEFAULT_INPUT_LIMIT = 8000

// Reserve tokens for output generation
const OUTPUT_RESERVE_TOKENS = 2000

const getModelInputLimit = (model) => {
	const key = String(model || "").trim().toLowerCase()
	if (MODEL_INPUT_LIMITS[key] != null) return MODEL_INPUT_LIMITS[key]
	for (const [knownModel, limit] of Object.entries(MODEL_INPUT_LIMITS)) {
		if (key.includes(knownModel) || knownModel.includes(key)) return limit
	}
	return DEFAULT_INPUT_LIMIT
}

const getApiKey = () => {
	const apiKey = ConfigLoader.get("GITHUB_TOKEN")
	if (!apiKey) {
		const error = new Error("GITHUB_TOKEN is required for GitHub Copilot agent")
		error.statusCode = ERROR_CODES.VALIDATION_ERROR
		throw error
	}

	return apiKey
}

const getApiUrl = () => ConfigLoader.get("GITHUB_MODELS_API_URL", ENDPOINTS.COPILOT)

const getDefaultModel = () => ConfigLoader.get("GITHUB_MODEL", DEFAULT_MODEL)

const extractResponseText = (responseData = {}) => {
	const choices = Array.isArray(responseData?.choices) ? responseData.choices : []
	const content = choices[0]?.message?.content

	if (typeof content === "string") {
		return content.trim()
	}

	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (!item) return ""
				if (typeof item === "string") return item
				if (typeof item?.text === "string") return item.text
				return ""
			})
			.join("\n")
			.trim()
	}

	return ""
}

const generateFromPrompt = async (prompt, options = {}) => {
	const apiKey = getApiKey()
	const apiUrl = getApiUrl()
	const messagePrompt = String(prompt || "").trim()
	const model = String(options.model || getDefaultModel()).trim()

	if (!messagePrompt) {
		const error = new Error("Prompt is required")
		error.statusCode = ERROR_CODES.VALIDATION_ERROR
		throw error
	}

	// Token budget: auto-truncate user prompt to fit within platform limits
	const systemTokens = estimateTokens(SYSTEM_PROMPT)
	const modelInputLimit = getModelInputLimit(model)
	const userTokenBudget = modelInputLimit - systemTokens - OUTPUT_RESERVE_TOKENS

	let finalPrompt = messagePrompt
	if (estimateTokens(messagePrompt) > userTokenBudget) {
		// Truncate by characters (approx 3.5 chars per token)
		const maxChars = Math.floor(userTokenBudget * 3.5)
		finalPrompt = messagePrompt.slice(0, maxChars) +
			"\n\n[NOTE: Content was truncated to fit GitHub Models platform token limit. " +
			"Some document content may be missing. Focus on the information provided above.]"
		console.warn(
			`[CopilotService] Prompt truncated: ~${estimateTokens(messagePrompt)} tokens -> ~${estimateTokens(finalPrompt)} tokens ` +
			`(platform limit: ${modelInputLimit}, model: ${model})`
		)
	}

	let response
	try {
		const isReasoningModel = /\b(gpt-5|o[1-9]|o3|o4)\b/i.test(model)

		const COPILOT_MAX_TOKENS = Math.min(DEFAULTS.MAX_TOKENS, 4096);

		response = await axios.post(
			apiUrl,
			{
				model,
				...(isReasoningModel ? {} : { temperature: DEFAULTS.TEMPERATURE }),
				...(isReasoningModel
					? { max_completion_tokens: COPILOT_MAX_TOKENS }
					: { max_tokens: COPILOT_MAX_TOKENS }),
				messages: [
					{
						role: "system",
						content: SYSTEM_PROMPT,
					},
					{
						role: "user",
						content: finalPrompt,
					},
				],
			},
			{
				headers: {
					"Content-Type": HEADERS.CONTENT_TYPE,
					Authorization: `Bearer ${apiKey}`,
				},
				timeout: DEFAULTS.TIMEOUT_MS,
			},
		)
	} catch (err) {
		const status = err.response?.status || "unknown"
		const detail = err.response?.data?.error?.message || err.response?.data?.message || JSON.stringify(err.response?.data || err.message)
		console.error(`[CopilotService] API error (${status}): model=${model}, detail=${detail}`)
		const error = new Error(`GitHub Models API error (${status}): ${detail}`)
		error.statusCode = err.response?.status || ERROR_CODES.SERVICE_UNAVAILABLE
		throw error
	}

	const text = extractResponseText(response?.data)
	if (!text) {
		const error = new Error("GitHub Copilot agent returned an empty response")
		error.statusCode = ERROR_CODES.SERVICE_UNAVAILABLE
		throw error
	}

	return text
}

module.exports = {
	generateFromPrompt,
}
