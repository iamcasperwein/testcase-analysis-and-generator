const fs = require("fs")
const path = require("path")
const dotenv = require("dotenv")

const ENV_FILE_PATH = path.join(__dirname, "../.env")

const DEFAULT_SETTING_KEYS = [
	{ key: "PORT", confidential: false },
	{ key: "GEMINI_API_KEY", confidential: true },
	{ key: "GITHUB_TOKEN", confidential: true },
	{ key: "GITHUB_MODEL", confidential: false },
	{ key: "GITHUB_MODELS_API_URL", confidential: false },
	{ key: "TESTRAIL_API_KEY", confidential: true },
	{ key: "TESTRAIL_PASSWORD", confidential: true },
	{ key: "TESTRAIL_URL", confidential: false },
	{ key: "TESTRAIL_USERNAME", confidential: true },
	{ key: "TESTRAIL_PROJECT_ID", confidential: false },
	{ key: "TESTRAIL_TESTSUITE_ID", confidential: false },
	{ key: "TESTRAIL_SUITE_ID", confidential: false },
	{ key: "OPENAI_API_KEY", confidential: true },
	{ key: "NODE_ENV", confidential: false },
	{ key: "CLAUDE_API_KEY", confidential: true },
	// { key: "ANTHROPIC_API_KEY", confidential: false }
]

const createValidationError = (message, statusCode = 400) => {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}

const ensureEnvFileExists = () => {
	if (fs.existsSync(ENV_FILE_PATH)) {
		return
	}

	fs.mkdirSync(path.dirname(ENV_FILE_PATH), { recursive: true })
	fs.writeFileSync(ENV_FILE_PATH, "", "utf8")
}

const readEnvRaw = () => {
	try {
		return fs.readFileSync(ENV_FILE_PATH, "utf8")
	} catch (error) {
		if (error.code === "ENOENT") {
			return ""
		}
		throw error
	}
}

const readEnvMap = () => {
	const raw = readEnvRaw()
	const parsed = dotenv.parse(raw)

	return Object.entries(parsed).reduce((acc, [key, value]) => {
		const normalizedKey = String(key || "").trim()
		if (!normalizedKey) return acc
		acc[normalizedKey] = String(value ?? "")
		return acc
	}, {})
}

const writeEnvMap = (envMap = {}) => {
	ensureEnvFileExists()

	const keys = Object.keys(envMap)
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b))

	const content = keys
		.map((key) => `${key}=${String(envMap[key] ?? "")}`)
		.join("\n")

	const finalContent = content ? `${content}\n` : ""
	fs.writeFileSync(ENV_FILE_PATH, finalContent, "utf8")
}

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
	if (Array.isArray(payload?.settings)) {
		return payload.settings
	}

	if (Array.isArray(payload)) {
		return payload
	}

	if (payload && typeof payload === "object") {
		if (payload.key != null) {
			return [{ key: payload.key, value: payload.value }]
		}

		const objectEntries = Object.entries(payload)
			.filter(([key]) => key !== "settings")
			.map(([key, value]) => ({ key, value }))

		return objectEntries
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

const getSettings = async () => {
	const envMap = readEnvMap()
	return Object.keys(envMap)
		.sort((a, b) => a.localeCompare(b))
		.map((key) => ({
			key,
			value: envMap[key],
		}))
}

const getAvailableKeys = async () => {
	const envMap = readEnvMap()
	const existingKeys = new Set(Object.keys(envMap).map((key) => String(key || "").trim()))
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

	const envMap = readEnvMap()
	const touched = []
	const pendingKeys = new Set()

	entries.forEach((entry) => {
		const key = validateKey(entry?.key)

		if (Object.prototype.hasOwnProperty.call(envMap, key)) {
			throw createValidationError(`Setting ${key} already exists`, 409)
		}

		if (pendingKeys.has(key)) {
			throw createValidationError(`Duplicate setting key in request: ${key}`)
		}

		pendingKeys.add(key)
		const value = String(entry?.value ?? "")
		envMap[key] = value
		touched.push({ key, value })
	})

	writeEnvMap(envMap)

	return {
		saved: touched,
		total: Object.keys(envMap).length,
	}
}

const updateSetting = async (key, value) => {
	const normalizedKey = validateKey(key)
	const envMap = readEnvMap()

	if (!Object.prototype.hasOwnProperty.call(envMap, normalizedKey)) {
		throw createValidationError(`Setting ${normalizedKey} not found`, 404)
	}

	envMap[normalizedKey] = String(value ?? "")
	writeEnvMap(envMap)

	return {
		key: normalizedKey,
		value: envMap[normalizedKey],
	}
}

const deleteSetting = async (key) => {
	const normalizedKey = validateKey(key)
	const envMap = readEnvMap()

	if (!Object.prototype.hasOwnProperty.call(envMap, normalizedKey)) {
		throw createValidationError(`Setting ${normalizedKey} not found`, 404)
	}

	delete envMap[normalizedKey]
	writeEnvMap(envMap)

	return {
		key: normalizedKey,
	}
}

module.exports = {
	getSettings,
	getAvailableKeys,
	createSettings,
	updateSetting,
	deleteSetting,
}
