const axios = require("axios")

const COPILOT_API_URL = String(process.env.GITHUB_MODELS_API_URL || "https://models.github.ai/inference/chat/completions").trim()
const DEFAULT_MODEL = String(process.env.GITHUB_MODEL || "gpt-4.1-mini").trim()

const getApiKey = () => {
	const apiKey = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim()
	if (!apiKey) {
		const error = new Error("GITHUB_TOKEN (or GH_TOKEN) is required for GitHub Copilot agent")
		error.statusCode = 400
		throw error
	}

	return apiKey
}

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

const generateFromPrompt = async (prompt, _options = {}) => {
	const apiKey = getApiKey()
	const messagePrompt = String(prompt || "").trim()

	if (!messagePrompt) {
		const error = new Error("Prompt is required")
		error.statusCode = 400
		throw error
	}

	let response
	try {
		response = await axios.post(
			COPILOT_API_URL,
			{
				model: DEFAULT_MODEL,
				temperature: 0.2,
				max_tokens: 8192,
				messages: [
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
				timeout: 120000,
			},
		)
	} catch (err) {
		const status = err.response?.status || "unknown"
		const detail = err.response?.data?.error?.message || err.response?.data?.message || JSON.stringify(err.response?.data || err.message)
		console.error(`[CopilotService] API error (${status}): model=${DEFAULT_MODEL}, detail=${detail}`)
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
