const ConfigLoader = require("../../utils/ConfigLoader")
const axios = require("axios")
const { ENDPOINTS, MODELS_QUERY_PARAMS } = require("../../constants/api/LLMApi")

const createValidationError = (message, statusCode = 400) => {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}

const normalizeAgent = (value = "") => String(value || "").trim().toLowerCase()

const DEFAULT_SETTING_KEYS = [
	// { key: "CLAUDE_API_KEY", confidential: true },
	// { key: "CLAUDE_MODEL", confidential: false },
	// { key: "GEMINI_API_KEY", confidential: true },
	// { key: "GEMINI_MODEL", confidential: false },
	{ key: "GITHUB_TOKEN", confidential: true },
	{ key: "GITHUB_MODEL", confidential: false },
	{ key: "LITELLM_API_KEY", confidential: true },
	{ key: "LITELLM_BASE_URL", confidential: false },
	{ key: "TESTRAIL_PASSWORD", confidential: true },
	{ key: "TESTRAIL_PROJECT_ID", confidential: false },
	// { key: "TESTRAIL_SUITE_ID", confidential: false },
	{ key: "TESTRAIL_URL", confidential: false },
	{ key: "TESTRAIL_USERNAME", confidential: true },
	// { key: "LARK_APP_ID", confidential: false },
	// { key: "LARK_APP_SECRET", confidential: true },
	{ key: "FIGMA_ACCESS_TOKEN", confidential: true },
]

const GITHUB_MODELS_CATALOG_URL = "https://models.github.ai/catalog/models"

const GEMINI_STATIC_MODELS = Object.freeze([
	{ id: "models/gemini-2.5-flash", name: "gemini-2.5-flash" },
])

const COPILOT_STATIC_MODELS = Object.freeze([
	{ id: "openai/gpt-4o-mini", name: "gpt-4o-mini" },
	{ id: "openai/gpt-4o", name: "gpt-4o" },
	{ id: "openai/gpt-4.1-nano", name: "gpt-4.1-nano" },
	{ id: "openai/gpt-4.1-mini", name: "gpt-4.1-mini" },
	{ id: "openai/gpt-4.1", name: "gpt-4.1" },
	{ id: "openai/o4-mini", name: "o4-mini" },
])

const MODEL_CATALOGS = Object.freeze({
	copilot: {
		agent: "copilot",
		label: "GitHub Models",
		supported: true,
	},
	claude: {
		agent: "claude",
		label: "Anthropic",
		supported: false,
		message: "Claude model catalog browsing is not wired yet. Set CLAUDE_MODEL manually for now.",
	},
	gemini: {
		agent: "gemini",
		label: "Google Gemini",
		supported: true,
	},
	litellm: {
		agent: "litellm",
		label: "LiteLLM",
		supported: true,
	},
})

const normalizeGithubCatalogItem = (item = {}) => ({
	id: String(item.id || "").trim(),
	name: String(item.name || item.id || "").trim(),
	publisher: String(item.publisher || "").trim(),
	summary: String(item.summary || "").trim(),
	registry: String(item.registry || "").trim(),
	rateLimitTier: String(item.rate_limit_tier || "").trim(),
	capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
	tags: Array.isArray(item.tags) ? item.tags : [],
	htmlUrl: String(item.html_url || "").trim(),
	maxInputTokens: Number.isFinite(Number(item?.limits?.max_input_tokens)) ? Number(item.limits.max_input_tokens) : null,
	maxOutputTokens: Number.isFinite(Number(item?.limits?.max_output_tokens)) ? Number(item.limits.max_output_tokens) : null,
})

// --- Setting key helpers ---

const normalizeKey = (value = "") => String(value || "").trim()

const validateKey = (key) => {
	const normalized = normalizeKey(key)
	if (!normalized) {
		throw createValidationError("Setting key is required")
	}
	const isValid = /^[A-Z][A-Z0-9_]*$/.test(normalized)
	if (!isValid) {
		throw createValidationError("Invalid setting key format. Use uppercase letters, numbers, and underscore only")
	}
	return normalized
}

const normalizeEntriesInput = (payload = {}) => {
	if (Array.isArray(payload?.settings)) return payload.settings
	if (Array.isArray(payload)) return payload
	if (payload && typeof payload === "object") {
		if (payload.key != null) return [{ key: payload.key, value: payload.value }]
		return Object.entries(payload)
			.filter(([key]) => key !== "settings")
			.map(([key, value]) => ({ key, value }))
	}
	return []
}

const normalizeDefaultSettingKeys = (entries = []) => {
	const map = new Map()
	entries.forEach((entry) => {
		const normalizedKey = validateKey(entry?.key)
		if (!map.has(normalizedKey)) {
			map.set(normalizedKey, {
				key: normalizedKey,
				confidential: Boolean(entry?.confidential),
			})
		}
	})
	return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

// --- Public API ---

const getSettings = async () => {
	const configMap = ConfigLoader.readAll()
	return Object.keys(configMap)
		.sort((a, b) => a.localeCompare(b))
		.map((key) => ({ key, value: configMap[key] }))
}

const getAvailableKeys = async () => {
	const configMap = ConfigLoader.readAll()
	const existingKeys = new Set(Object.keys(configMap).map((key) => String(key || "").trim()))
	const defaultKeys = normalizeDefaultSettingKeys(DEFAULT_SETTING_KEYS)
	return defaultKeys.map((item) => ({
		key: item.key,
		confidential: Boolean(item.confidential),
		isAvailable: !existingKeys.has(item.key),
	}))
}

const createSettings = async (payload = {}) => {
	const entries = normalizeEntriesInput(payload)
	if (!entries.length) {
		throw createValidationError("At least one setting is required")
	}

	const configMap = ConfigLoader.readAll()
	const touched = []
	const pendingKeys = new Set()

	entries.forEach((entry) => {
		const key = validateKey(entry?.key)

		if (Object.prototype.hasOwnProperty.call(configMap, key)) {
			throw createValidationError(`Setting ${key} already exists`, 409)
		}
		if (pendingKeys.has(key)) {
			throw createValidationError(`Duplicate setting key in request: ${key}`)
		}

		pendingKeys.add(key)
		const value = String(entry?.value ?? "")
		configMap[key] = value
		touched.push({ key, value })
	})

	ConfigLoader.writeAll(configMap)

	return {
		saved: touched,
		total: Object.keys(configMap).length,
	}
}

const updateSetting = async (key, value) => {
	const normalizedKey = validateKey(key)
	const configMap = ConfigLoader.readAll()

	if (!Object.prototype.hasOwnProperty.call(configMap, normalizedKey)) {
		throw createValidationError(`Setting ${normalizedKey} not found`, 404)
	}

	configMap[normalizedKey] = String(value ?? "")
	ConfigLoader.writeAll(configMap)

	return {
		key: normalizedKey,
		value: configMap[normalizedKey],
	}
}

const deleteSetting = async (key) => {
	const normalizedKey = validateKey(key)
	const configMap = ConfigLoader.readAll()

	if (!Object.prototype.hasOwnProperty.call(configMap, normalizedKey)) {
		throw createValidationError(`Setting ${normalizedKey} not found`, 404)
	}

	delete configMap[normalizedKey]
	ConfigLoader.writeAll(configMap)

	return { key: normalizedKey }
}

/**
 * Fetch model catalog for a given agent.
 * - copilot: GitHub Models catalog API
 * - litellm: LiteLLM /v1/models endpoint (OpenAI-compatible)
 * - gemini: Static model list
 */
const getModelCatalog = async (agent) => {
	const normalizedAgent = normalizeAgent(agent)
	const catalogConfig = MODEL_CATALOGS[normalizedAgent]

	if (!catalogConfig) {
		throw createValidationError(`Unsupported agent: ${agent}`, 404)
	}

	if (!catalogConfig.supported) {
		return {
			agent: catalogConfig.agent,
			label: catalogConfig.label,
			supported: false,
			message: catalogConfig.message || "Model catalog is not available for this agent yet.",
			models: [],
		}
	}

	// --- Copilot: GitHub Models catalog ---
	if (normalizedAgent === "copilot") {
		try {
			const githubToken = ConfigLoader.get("GITHUB_TOKEN", "")
			const headers = { Accept: "application/json" }
			if (githubToken) {
				headers.Authorization = `Bearer ${githubToken}`
			}

			const response = await axios.get(GITHUB_MODELS_CATALOG_URL, {
				headers,
				timeout: 20000,
			})

			const models = Array.isArray(response?.data)
				? response.data.map(normalizeGithubCatalogItem).filter((item) => item.id)
				: []

			if (models.length) {
				return {
					agent: catalogConfig.agent,
					label: catalogConfig.label,
					supported: true,
					message: `${models.length} model(s) available from ${catalogConfig.label}.`,
					models,
				}
			}
		} catch (_) {
			// Fall through to static list on any error (429, network, timeout)
		}

		// Static fallback
		return {
			agent: catalogConfig.agent,
			label: catalogConfig.label,
			supported: true,
			message: `Showing ${COPILOT_STATIC_MODELS.length} common model(s). Configure GITHUB_TOKEN for full catalog.`,
			models: COPILOT_STATIC_MODELS.map((m) => ({
				id: m.id,
				name: m.name,
				publisher: "openai",
				summary: "",
				registry: "",
				rateLimitTier: "",
				capabilities: [],
				tags: [],
				htmlUrl: "",
				maxInputTokens: null,
				maxOutputTokens: null,
			})),
		}
	}

	// --- LiteLLM: /v1/models endpoint ---
	if (normalizedAgent === "litellm") {
		const baseUrl = ConfigLoader.get("LITELLM_BASE_URL", "")
		if (!baseUrl) {
			return {
				agent: catalogConfig.agent,
				label: catalogConfig.label,
				supported: true,
				message: "LITELLM_BASE_URL is not configured. Set it in Settings to fetch available models.",
				models: [],
			}
		}

		const apiKey = ConfigLoader.get("LITELLM_API_KEY", "")
		const headers = { Accept: "application/json" }
		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		try {
			const response = await axios.get(`${baseUrl}${ENDPOINTS.MODELS}`, {
				params: MODELS_QUERY_PARAMS,
				headers,
				timeout: 10000,
			})

			// OpenAI-compatible response: { data: [{ id: "model-name", ... }] }
			const rawModels = Array.isArray(response?.data?.data) ? response.data.data : []
			const models = rawModels
				.map((m) => ({ id: String(m.id || "").trim(), name: String(m.id || "").trim() }))
				.filter((m) => m.id)

			return {
				agent: catalogConfig.agent,
				label: catalogConfig.label,
				supported: true,
				message: `${models.length} model(s) available from ${catalogConfig.label}.`,
				models,
			}
		} catch (err) {
			return {
				agent: catalogConfig.agent,
				label: catalogConfig.label,
				supported: true,
				message: `Failed to fetch LiteLLM models: ${err.message}`,
				models: [],
			}
		}
	}

	// --- Gemini: Static model list ---
	if (normalizedAgent === "gemini") {
		return {
			agent: catalogConfig.agent,
			label: catalogConfig.label,
			supported: true,
			message: `${GEMINI_STATIC_MODELS.length} model(s) available.`,
			models: GEMINI_STATIC_MODELS.map((m) => ({ ...m })),
		}
	}

	// Fallback (shouldn't reach here)
	return {
		agent: catalogConfig.agent,
		label: catalogConfig.label,
		supported: false,
		message: "Model catalog not implemented for this agent.",
		models: [],
	}
}

module.exports = {
	getSettings,
	getAvailableKeys,
	createSettings,
	updateSetting,
	deleteSetting,
	getModelCatalog,
}
