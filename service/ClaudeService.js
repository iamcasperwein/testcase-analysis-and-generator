const axios = require("axios")

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
const DEFAULT_MODEL = String(process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514").trim()

const getApiKey = () => {
	const apiKey = String(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim()
	if (!apiKey) {
		const error = new Error("CLAUDE_API_KEY or ANTHROPIC_API_KEY is required for Claude service")
		error.statusCode = 400
		throw error
	}

	return apiKey
}

const generateFromPrompt = async (prompt, _options = {}) => {
	const apiKey = getApiKey()
	const messagePrompt = String(prompt || "").trim()

	if (!messagePrompt) {
		const error = new Error("Prompt is required")
		error.statusCode = 400
		throw error
	}

	const response = await axios.post(
		CLAUDE_API_URL,
		{
			model: DEFAULT_MODEL,
			max_tokens: 8192,
			temperature: 0.2,
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
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			timeout: 120000,
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
		error.statusCode = 502
		throw error
	}

	return text
}

module.exports = {
	generateFromPrompt,
}
