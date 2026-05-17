const axios = require("axios")
const { SYSTEM_PROMPT } = require("../../prompts")
const { estimateTokens } = require("../../utils/TokenEstimator")
const ConfigLoader = require("../../utils/ConfigLoader")

const COPILOT_API_URL = "https://models.github.ai/inference/chat/completions"
const DEFAULT_MODEL = "openai/gpt-4.1"

const MODEL_INPUT_LIMITS = Object.freeze({
	"openai/gpt-5": 4000,
	"openai/gpt-5-chat": 4000,
	"openai/o3": 4000,
	"openai/o4-mini": 16000,
	"openai/gpt-4.1": 1000000,
	"openai/gpt-4.1-mini": 1000000,
	"openai/gpt-4.1-nano": 1000000,
	"openai/gpt-4o": 128000,
	"openai/gpt-4o-mini": 128000,
})

const DEFAULT_INPUT_LIMIT = 128000

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
		error.statusCode = 400
		throw error
	}

	return apiKey
}

const getApiUrl = () => ConfigLoader.get("GITHUB_MODELS_API_URL", COPILOT_API_URL)

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
		error.statusCode = 400
		throw error
	}

	// Token guard: estimate input size and reject if it exceeds model limit
	const fullInput = SYSTEM_PROMPT + "\n" + messagePrompt
	const estimatedInputTokens = estimateTokens(fullInput)
	const modelInputLimit = getModelInputLimit(model)

	if (estimatedInputTokens > modelInputLimit) {
		const error = new Error(
			`Input too large for model "${model}": ~${estimatedInputTokens} tokens estimated, limit is ${modelInputLimit}. ` +
			`Try a model with a higher context window (e.g. openai/gpt-4.1) or reduce the input size.`
		)
		error.statusCode = 413
		throw error
	}

	let response
	try {
		const isReasoningModel = /\b(gpt-5|o[1-9]|o3|o4)\b/i.test(model)

		response = await axios.post(
			apiUrl,
			{
				model,
				...(isReasoningModel ? {} : { temperature: 0.2 }),
				...(isReasoningModel
					? { max_completion_tokens: 16384 }
					: { max_tokens: 16384 }),
				messages: [
					{
						role: "system",
						content: SYSTEM_PROMPT,
					},
					{
						role: "user",
						content: messagePrompt,
					},
				],
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				timeout: 300000,
			},
		)
	} catch (err) {
		const status = err.response?.status || "unknown"
		const detail = err.response?.data?.error?.message || err.response?.data?.message || JSON.stringify(err.response?.data || err.message)
		console.error(`[CopilotService] API error (${status}): model=${model}, detail=${detail}`)
		const error = new Error(`GitHub Models API error (${status}): ${detail}`)
		error.statusCode = err.response?.status || 502
		throw error
	}

	const text = extractResponseText(response?.data)
	if (!text) {
		const error = new Error("GitHub Copilot agent returned an empty response")
		error.statusCode = 502
		throw error
	}

	return text
}

module.exports = {
	generateFromPrompt,
}
