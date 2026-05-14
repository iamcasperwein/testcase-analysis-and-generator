const FileReader = require("../utils/FileReader")
const { createActionLogger } = require("../utils/AppLogger")

const CONFIG_FILE = "testrail-sync-config.json"

const VALID_PLATFORM_GROUPS = Object.freeze({
	app: { key: "app", label: "App", platforms: ["ios", "android"] },
	"mobile-web": { key: "mobile-web", label: "Mobile Web", platforms: ["mobile-web"] },
	"desktop-web": { key: "desktop-web", label: "Desktop Web", platforms: ["desktop-web"] },
	backend: { key: "backend", label: "Backend", platforms: ["backend"] },
})

const createValidationError = (message, statusCode = 400) => {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}

const readConfig = () => {
	try {
		const raw = FileReader.readDataFile(CONFIG_FILE)
		if (!raw || !raw.trim()) {
			return { mappings: [] }
		}
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed?.mappings) ? parsed : { mappings: [] }
	} catch (error) {
		if (error.code === "ENOENT" || error instanceof SyntaxError) {
			return { mappings: [] }
		}
		throw error
	}
}

const writeConfig = (config) => {
	FileReader.writeDataFile(CONFIG_FILE, config)
}

const getAll = () => {
	const logger = createActionLogger({
		service: "TestrailSyncConfigService",
		action: "getAll",
		fileName: "runtime/testrail-sync-config.txt",
	})
	logger.start("Fetching all sync config mappings")

	const config = readConfig()
	logger.success("Config loaded", { count: config.mappings.length })

	return {
		mappings: config.mappings,
		availablePlatformGroups: Object.values(VALID_PLATFORM_GROUPS),
	}
}

const upsert = ({ platformGroup, suiteId, suiteName } = {}) => {
	const logger = createActionLogger({
		service: "TestrailSyncConfigService",
		action: "upsert",
		fileName: "runtime/testrail-sync-config.txt",
	})

	const normalizedGroup = String(platformGroup || "").trim().toLowerCase()
	if (!VALID_PLATFORM_GROUPS[normalizedGroup]) {
		logger.fail(`Invalid platform group: ${normalizedGroup}`)
		throw createValidationError(
			`Invalid platform group: "${normalizedGroup}". Valid options: ${Object.keys(VALID_PLATFORM_GROUPS).join(", ")}`
		)
	}

	const normalizedSuiteId = Number(suiteId)
	if (!Number.isFinite(normalizedSuiteId) || normalizedSuiteId <= 0) {
		logger.fail("Invalid suiteId")
		throw createValidationError("suiteId must be a positive number")
	}

	const normalizedSuiteName = String(suiteName || "").trim()

	const config = readConfig()
	const existingIndex = config.mappings.findIndex(
		(m) => String(m.platformGroup).toLowerCase() === normalizedGroup
	)

	const mapping = {
		platformGroup: normalizedGroup,
		label: VALID_PLATFORM_GROUPS[normalizedGroup].label,
		platforms: VALID_PLATFORM_GROUPS[normalizedGroup].platforms,
		suiteId: normalizedSuiteId,
		suiteName: normalizedSuiteName,
		updatedAt: new Date().toISOString(),
	}

	if (existingIndex >= 0) {
		config.mappings[existingIndex] = mapping
		logger.success("Mapping updated", mapping)
	} else {
		config.mappings.push(mapping)
		logger.success("Mapping created", mapping)
	}

	writeConfig(config)
	return mapping
}

const remove = (platformGroup) => {
	const logger = createActionLogger({
		service: "TestrailSyncConfigService",
		action: "remove",
		fileName: "runtime/testrail-sync-config.txt",
	})

	const normalizedGroup = String(platformGroup || "").trim().toLowerCase()
	const config = readConfig()
	const before = config.mappings.length
	config.mappings = config.mappings.filter(
		(m) => String(m.platformGroup).toLowerCase() !== normalizedGroup
	)

	if (config.mappings.length === before) {
		logger.fail(`Mapping not found: ${normalizedGroup}`)
		throw createValidationError(`No mapping found for platform group: "${normalizedGroup}"`, 404)
	}

	writeConfig(config)
	logger.success("Mapping deleted", { platformGroup: normalizedGroup })
	return { deleted: normalizedGroup }
}

const getByPlatformGroup = (platformGroup) => {
	const normalizedGroup = String(platformGroup || "").trim().toLowerCase()
	const config = readConfig()
	return config.mappings.find(
		(m) => String(m.platformGroup).toLowerCase() === normalizedGroup
	) || null
}

const resolveSuiteForPlatformFilter = (platformFilter = []) => {
	const normalized = platformFilter.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean)
	if (!normalized.length) return null

	// Determine which platform group the filter maps to
	for (const [groupKey, groupDef] of Object.entries(VALID_PLATFORM_GROUPS)) {
		const matches = normalized.every((p) => groupDef.platforms.includes(p))
		if (matches) {
			const mapping = getByPlatformGroup(groupKey)
			return mapping || null
		}
	}

	// Try individual platform lookup (e.g. filter=["ios"] → app group)
	for (const [groupKey, groupDef] of Object.entries(VALID_PLATFORM_GROUPS)) {
		const hasOverlap = normalized.some((p) => groupDef.platforms.includes(p))
		if (hasOverlap) {
			const mapping = getByPlatformGroup(groupKey)
			if (mapping) return mapping
		}
	}

	return null
}

module.exports = {
	VALID_PLATFORM_GROUPS,
	getAll,
	upsert,
	remove,
	getByPlatformGroup,
	resolveSuiteForPlatformFilter,
}
