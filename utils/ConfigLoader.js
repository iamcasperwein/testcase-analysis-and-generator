const fs = require("fs")
const path = require("path")

const CONFIG_FILE_PATH = path.join(__dirname, "../config.json")

/**
 * Read all config values from config.json.
 * Returns an empty object if the file does not exist or is malformed.
 */
const readAll = () => {
	try {
		const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf8")
		if (!raw || !raw.trim()) return {}
		const parsed = JSON.parse(raw)
		if (typeof parsed !== "object" || Array.isArray(parsed)) return {}
		return Object.entries(parsed).reduce((acc, [key, value]) => {
			const k = String(key || "").trim()
			if (k) acc[k] = String(value ?? "")
			return acc
		}, {})
	} catch (error) {
		if (error.code === "ENOENT" || error instanceof SyntaxError) return {}
		throw error
	}
}

/**
 * Write all config values to config.json (full replace).
 * Creates the file if it does not exist.
 */
const writeAll = (configMap = {}) => {
	const sorted = Object.keys(configMap)
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b))
		.reduce((acc, key) => {
			acc[key] = String(configMap[key] ?? "")
			return acc
		}, {})

	fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(sorted, null, 4), "utf8")
}

/**
 * Get a single config value by key.
 * Returns the value as a trimmed string, or the fallback if the key is not set or empty.
 */
const get = (key, fallback = "") => {
	const config = readAll()
	const value = String(config[key] ?? "").trim()
	return value || String(fallback)
}

/**
 * Set one or more config values (merge into existing config).
 */
const set = (keyOrMap, value) => {
	const config = readAll()
	if (typeof keyOrMap === "object") {
		Object.entries(keyOrMap).forEach(([k, v]) => {
			config[String(k).trim()] = String(v ?? "")
		})
	} else {
		config[String(keyOrMap).trim()] = String(value ?? "")
	}
	writeAll(config)
}

module.exports = { readAll, writeAll, get, set }
