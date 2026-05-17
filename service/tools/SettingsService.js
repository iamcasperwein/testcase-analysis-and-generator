const ConfigLoader = require("../../utils/ConfigLoader")
const axios = require("axios")

const createValidationError = (message, statusCode = 400) => {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}

const normalizeAgent = (value = "") => String(value || "").trim().toLowerCase()

const DEFAULT_SETTING_KEYS = [
	{ key: "CLAUDE_API_KEY", confidential: true },
	{ key: "CLAUDE_MODEL", confidential: false },
	{ key: "GEMINI_API_KEY", confidential: true },
	{ key: "GEMINI_MODEL", confidential: false },
	{ key: "GITHUB_MODEL", confidential: false },
	{ key: "GITHUB_TOKEN", confidential: true },
	{ key: "TESTRAIL_PASSWORD", confidential: true },
	{ key: "TESTRAIL_PROJECT_ID", confidential: false },
	{ key: "TESTRAIL_SUITE_ID", confidential: false },
	{ key: "TESTRAIL_URL", confidential: false },
	{ key: "TESTRAIL_USERNAME", confidential: true },
	{ key: "GEMINI_MODEL", confidential: false}
]

const GITHUB_MODELS_CATALOG_URL = "https://models.github.ai/catalog/models"

const MODEL_CATALOGS = Object.freeze({
	copilot: {
		agent: "copilot",
		label: "GitHub Models",
		settingKey: "GITHUB_MODEL",
		supported: true,
	},
	claude: {
		agent: "claude",
		label: "Anthropic",
		settingKey: "CLAUDE_MODEL",
		supported: false,
		message: "Claude model catalog browsing is not wired yet. Set CLAUDE_MODEL manually for now.",
	},
	gemini: {
		agent: "gemini",
		label: "Google Gemini",
		settingKey: "GEMINI_MODEL",
		supported: false,
		message: "Gemini model catalog browsing is not wired yet. Set GEMINI_MODEL manually for now.",
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
			settingKey: catalogConfig.settingKey,
			supported: false,
			message: catalogConfig.message || "Model catalog is not available for this agent yet.",
			models: [],
		}
	}

	const response = await axios.get(GITHUB_MODELS_CATALOG_URL, {
		headers: { Accept: "application/json" },
		timeout: 20000,
	})

	const models = Array.isArray(response?.data)
		? response.data.map(normalizeGithubCatalogItem).filter((item) => item.id)
		: []

	return {
		agent: catalogConfig.agent,
		label: catalogConfig.label,
		settingKey: catalogConfig.settingKey,
		supported: true,
		message: `${models.length} model(s) available from ${catalogConfig.label}.`,
		models,
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
