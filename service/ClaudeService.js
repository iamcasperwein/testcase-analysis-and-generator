const axios = require("axios")
const { SYSTEM_PROMPT } = require("../prompts")

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
const DEFAULT_MODEL = String(process.env.CLAUDE_MODEL || "claude-sonnet-4-6").trim()

const getApiKey = () => {
	const apiKey = String(process.env.CLAUDE_API_KEY || "").trim()
	if (!apiKey) {
		const error = new Error("CLAUDE_API_KEY is required for Claude service")
		error.statusCode = 400
		throw error
	}

	return apiKey
}

const generateFromPrompt = async (prompt, options = {}) => {
	const apiKey = getApiKey()
	const messagePrompt = String(prompt || "").trim()
	const model = String(options.model || DEFAULT_MODEL).trim()

	if (!messagePrompt) {
		const error = new Error("Prompt is required")
		error.statusCode = 400
		throw error
	}

	const response = await axios.post(
		CLAUDE_API_URL,
		{
			model,
			max_tokens: 16384,
			temperature: 0.2,
			system: SYSTEM_PROMPT,
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
			timeout: 300000,
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
