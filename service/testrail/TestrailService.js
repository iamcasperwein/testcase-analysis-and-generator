const axios = require("axios")
const FileReader = require("../../utils/FileReader")
const { createActionLogger } = require("../../utils/AppLogger")
const TestrailSyncConfigService = require("../testrail/TestrailSyncConfigService")
const ConfigLoader = require("../../utils/ConfigLoader")

const createValidationError = (message, statusCode = 400) => {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}

const normalizeBaseUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "")

const normalizeOptionalNumber = (value) => {
	if (value == null || value === "") {
		return null
	}

	const asNumber = Number(value)
	return Number.isFinite(asNumber) ? asNumber : null
}

const pickCredentials = ({ requireSuiteId = true } = {}) => {
	const username = ConfigLoader.get("TESTRAIL_USERNAME")
	const password = ConfigLoader.get("TESTRAIL_PASSWORD")
	const projectId = ConfigLoader.get("TESTRAIL_PROJECT_ID")
	const suiteId = ConfigLoader.get("TESTRAIL_SUITE_ID")
	const baseUrl = normalizeBaseUrl(ConfigLoader.get("TESTRAIL_URL"))

	if (!baseUrl) {
		throw createValidationError("TESTRAIL_URL is required", 400)
	}

	if (!username) {
		throw createValidationError("TESTRAIL_USERNAME is required", 400)
	}

	if (!password) {
		throw createValidationError("TESTRAIL_PASSWORD is required", 400)
	}

	if (!projectId) {
		throw createValidationError("TESTRAIL_PROJECT_ID is required", 400)
	}

	if (requireSuiteId && !suiteId) {
		throw createValidationError("TESTRAIL_SUITE_ID is required", 400)
	}

	return { username, password, projectId, suiteId, baseUrl }
}

const buildApiUrl = ({ baseUrl }, path) => `${baseUrl}/index.php?/api/v2/${path}`

const createAuthConfig = ({ username, password }, overrides = {}) => ({
	headers: {
		"Content-Type": "application/json",
		...(overrides.headers || {}),
	},
	auth: {
		username,
		password,
	},
	timeout: 20000,
	...overrides,
})

const extractApiError = (error) => {
	const statusCode = error?.response?.status || 500
	const errMessage = error?.response?.data?.error
		|| error?.response?.data?.message
		|| error.message
		|| "TestRail API request failed"

	return createValidationError(String(errMessage), statusCode)
}

const fetchApi = async (creds, method, path, payload) => {
	const url = buildApiUrl(creds, path)

	try {
		const response = await axios({
			url,
			method,
			data: payload,
			...createAuthConfig(creds),
		})

		return response.data || {}
	} catch (error) {
		throw extractApiError(error)
	}
}

const buildSectionsUrl = ({ baseUrl, projectId, suiteId }) => {
	const basePath = `${baseUrl}/index.php?/api/v2/get_sections/${encodeURIComponent(projectId)}`
	const query = new URLSearchParams()
	query.set("limit", "250")
	query.set("suite_id", suiteId)
	return `${basePath}&${query.toString()}`
}

const mapTestrailSection = (section = {}) => ({
	id: section.id,
	suite_id: section.suite_id,
	name: String(section.name || "").trim(),
	description: section.description ?? null,
	parent_id: section.parent_id ?? null,
	display_order: section.display_order ?? null,
	depth: section.depth ?? 0,
	source: "testrail",
})

const getSuites = async () => {
	const logger = createActionLogger({
		service: "TestrailService",
		action: "getSuites",
		fileName: "runtime/testrail-suites.txt",
	})
	logger.start("Fetching test suites from TestRail")

	const creds = pickCredentials({ requireSuiteId: false })
	const url = buildApiUrl(creds, `get_suites/${encodeURIComponent(creds.projectId)}`)

	try {
		const response = await axios.get(url, createAuthConfig(creds, { timeout: 15000 }))
		const rawSuites = Array.isArray(response.data)
			? response.data
			: Array.isArray(response.data?.suites)
				? response.data.suites
				: []
		const suites = rawSuites.map((suite) => ({
			id: suite.id,
			name: String(suite.name || "").trim(),
			description: suite.description ?? null,
			url: suite.url ?? null,
			is_master: suite.is_master ?? false,
			is_baseline: suite.is_baseline ?? false,
			is_completed: suite.is_completed ?? false,
		}))

		logger.success("Suites fetched", {
			projectId: creds.projectId,
			count: suites.length,
		})

		return { suites }
	} catch (error) {
		logger.fail(error, { projectId: creds.projectId })
		throw extractApiError(error)
	}
}

const getSections = async (overrideSuiteId) => {
	const logger = createActionLogger({
		service: "TestrailService",
		action: "getSections",
		fileName: "runtime/testrail-sections.txt",
	})
	logger.start("Fetching sections from TestRail")

	const creds = pickCredentials()
	const effectiveSuiteId = overrideSuiteId != null && String(overrideSuiteId).trim()
		? String(overrideSuiteId).trim()
		: creds.suiteId
	const requestUrl = buildSectionsUrl({
		baseUrl: creds.baseUrl,
		projectId: creds.projectId,
		suiteId: effectiveSuiteId,
	})

	try {
		const response = await axios.get(requestUrl, createAuthConfig(creds, { timeout: 15000 }))
		const payload = response.data || {}
		const sections = Array.isArray(payload?.sections) ? payload.sections.map(mapTestrailSection) : []
		logger.success("Sections fetched", {
			projectId: creds.projectId,
			suiteId: effectiveSuiteId,
			count: sections.length,
		})

		return {
			offset: payload?.offset ?? 0,
			limit: payload?.limit ?? 250,
			size: sections.length,
			_links: payload?._links || { next: null, prev: null },
			sections,
		}
	} catch (error) {
		logger.fail(error, { requestUrl })
		throw extractApiError(error)
	}
}

const getCaseFields = async (creds) => {
	const payload = await fetchApi(creds, "get", "get_case_fields")
	return Array.isArray(payload) ? payload : []
}

const createSection = async (creds, payload = {}) => {
	const response = await fetchApi(
		creds,
		"post",
		`add_section/${encodeURIComponent(creds.projectId)}`,
		payload,
	)

	return mapTestrailSection(response)
}

const addCases = async (creds, sectionId, casesPayload = []) => {
	const data = await fetchApi(
		creds,
		"post",
		`add_cases/${encodeURIComponent(sectionId)}`,
		{ cases: casesPayload },
	)

	return Array.isArray(data?.cases) ? data.cases : []
}

const addSingleCase = async (creds, sectionId, payload = {}) => {
	const data = await fetchApi(
		creds,
		"post",
		`add_case/${encodeURIComponent(sectionId)}`,
		payload,
	)

	return data || {}
}

const getCasesBySection = async (creds, sectionId) => {
	const allCases = []
	let offset = 0
	const limit = 250

	while (true) {
		const path = `get_cases/${encodeURIComponent(creds.projectId)}&suite_id=${encodeURIComponent(creds.suiteId)}&section_id=${encodeURIComponent(sectionId)}&offset=${offset}&limit=${limit}`
		const data = await fetchApi(creds, "get", path)
		const chunk = Array.isArray(data?.cases) ? data.cases : []
		allCases.push(...chunk)

		if (!chunk.length || chunk.length < limit) {
			break
		}

		offset += limit
	}

	return allCases
}

const normalizeFieldText = (value) => {
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean).join("\n")
	}

	return String(value || "").trim()
}

const normalizeSteps = (value) => {
	if (Array.isArray(value)) {
		// New format: array of {content, expected} objects
		if (value.length && typeof value[0] === "object" && value[0] !== null) {
			return value.map((item) => ({
				content: String(item.content || "").trim(),
				expected: String(item.expected || "N/A").trim(),
			})).filter((s) => s.content)
		}
		// Legacy: array of strings
		return value.map((item) => String(item).trim()).filter(Boolean)
	}

	return String(value || "")
		.split(/\r?\n/)
		.map((item) => item.trim())
		.filter(Boolean)
}

const normalizeForSignature = (value) => String(value || "")
	.trim()
	.toLowerCase()
	.replace(/\s+/g, " ")

const buildCaseSignatureFromPayload = (payload = {}) => {
	const title = normalizeForSignature(payload?.title)
	const preconds = normalizeForSignature(payload?.custom_preconds)
	const stepsSeparated = Array.isArray(payload?.custom_steps_separated)
		? payload.custom_steps_separated
			.map((step) => `${normalizeForSignature(step?.content)}=>${normalizeForSignature(step?.expected)}`)
			.filter(Boolean)
			.join("||")
		: ""

	if (!title) return ""
	return `${title}##${preconds}##${stepsSeparated}`
}

const buildCaseSignatureFromTestrailCase = (testRailCase = {}) => {
	const title = normalizeForSignature(testRailCase?.title)
	const preconds = normalizeForSignature(testRailCase?.custom_preconds)

	let stepsSeparated = ""
	if (Array.isArray(testRailCase?.custom_steps_separated)) {
		stepsSeparated = testRailCase.custom_steps_separated
			.map((step) => `${normalizeForSignature(step?.content)}=>${normalizeForSignature(step?.expected)}`)
			.filter(Boolean)
			.join("||")
	}

	if (!stepsSeparated) {
		const steps = normalizeForSignature(testRailCase?.custom_steps)
		const expected = normalizeForSignature(testRailCase?.custom_expected)
		if (steps || expected) {
			stepsSeparated = `${steps}=>${expected}`
		}
	}

	if (!title) return ""
	return `${title}##${preconds}##${stepsSeparated}`
}

const DEFAULT_CASE_STATIC_FIELDS = Object.freeze({
	template_id: 2,
	type_id: 6,
	priority_id: 2,
	custom_test_info: 7,
	custom_automation_type: 0,
	custom_automation_types: [5],
})

const buildCasePayload = (testCase = {}, sectionId) => {
	const title = String(testCase?.title || testCase?.id || "Untitled test case").trim()
	const preconditions = normalizeFieldText(testCase?.preconditions)
	const stepsNormalized = normalizeSteps(testCase?.steps)
	const expectedResult = normalizeFieldText(testCase?.expectedResult || testCase?.expected)

	// If steps are already objects with content/expected, use directly
	const isObjectSteps = stepsNormalized.length && typeof stepsNormalized[0] === "object"
	const customStepsSeparated = isObjectSteps
		? stepsNormalized
		: stepsNormalized.length
			? stepsNormalized.map((line) => ({
				content: line,
				expected: expectedResult,
			}))
			: [{
				content: "",
				expected: expectedResult,
			}]

	const payload = {
		section_id: Number(sectionId),
		title,
		...DEFAULT_CASE_STATIC_FIELDS,
		custom_preconds: preconditions,
		custom_steps_separated: customStepsSeparated,
	}

	return payload
}

/**
 * Section group format (consolidated per-platform):
 *   section: { _default: { name, sectionId, suiteId, sectionSource }, "mobile-web": { ... }, ... }
 *
 * No separate sectionId/suiteId/sectionSource fields on section groups.
 */

const isPerPlatformMeta = (sectionGroup = {}) => {
	return sectionGroup?.section != null && typeof sectionGroup.section === "object" && !Array.isArray(sectionGroup.section)
}

/**
 * Get section name for a given platform group from a section group.
 */
const getSectionName = (sectionGroup = {}, platformGroup = null) => {
	const sec = sectionGroup?.section
	if (sec == null || typeof sec !== "object" || Array.isArray(sec)) return "Uncategorized"
	if (platformGroup && sec[platformGroup]) {
		return String(sec[platformGroup].name || "").trim() || "Uncategorized"
	}
	if (sec._default) {
		return String(sec._default.name || "").trim() || "Uncategorized"
	}
	const firstKey = Object.keys(sec).find(k => sec[k]?.name)
	return firstKey ? String(sec[firstKey].name || "").trim() || "Uncategorized" : "Uncategorized"
}

/**
 * Normalize a section ID — preserves both numeric and string-based (sec_xxx) IDs.
 */
const normalizeOptionalId = (value) => {
	if (value == null || value === "") return null
	if (typeof value === "string" && value.startsWith("sec_")) return value
	const asNumber = Number(value)
	return Number.isFinite(asNumber) ? asNumber : null
}

/**
 * Get section metadata (sectionId, suiteId, sectionSource) for a given platform group.
 */
const getSectionMeta = (sectionGroup = {}, platformGroup = null) => {
	const sec = sectionGroup?.section
	if (sec == null || typeof sec !== "object" || Array.isArray(sec)) {
		return { sectionId: null, suiteId: null, sectionSource: "ai" }
	}
	const entry = (platformGroup && sec[platformGroup]) || sec._default || null
	if (entry) {
		return {
			sectionId: normalizeOptionalId(entry.sectionId) ?? null,
			suiteId: normalizeOptionalNumber(entry.suiteId) ?? null,
			sectionSource: String(entry.sectionSource || "").trim().toLowerCase() || "ai",
		}
	}
	return { sectionId: null, suiteId: null, sectionSource: "ai" }
}

/**
 * Set section metadata for a platform group.
 * sectionGroup.section must already be an object (new format).
 */
const setSectionMeta = (sectionGroup, platformGroup, { sectionId, suiteId, sectionSource, name }) => {
	const entry = {
		name: name || getSectionName(sectionGroup, platformGroup),
		sectionId: sectionId ?? null,
		suiteId: suiteId ?? null,
		sectionSource: sectionSource || "ai",
	}

	if (!sectionGroup.section || typeof sectionGroup.section !== "object") {
		sectionGroup.section = {}
	}

	const key = platformGroup || "_default"
	sectionGroup.section[key] = entry

	// Keep _default in sync: if setting a platform and no _default exists, set it
	if (platformGroup && !sectionGroup.section._default) {
		sectionGroup.section._default = { ...entry }
	}
}

const readPromptTestCases = (promptId) => {
	const raw = FileReader.readDataFile(`testcases/${promptId}.json`)
	return JSON.parse(raw)
}

const getProjectNameForPrompt = (promptId) => {
	try {
		const raw = FileReader.readDataFile("promptdata.json")
		const records = JSON.parse(raw)
		const entry = Array.isArray(records) ? records.find(r => String(r.promptId || "") === String(promptId)) : null
		return entry?.projectName || null
	} catch {
		return null
	}
}

const buildSelectedSections = (parsedData = {}, testcaseIds = []) => {
	const sectionGroups = Array.isArray(parsedData?.testCases) ? parsedData.testCases : []
	const selectedIds = Array.isArray(testcaseIds)
		? new Set(testcaseIds.map((id) => String(id || "").trim()).filter(Boolean))
		: null

	const selectedGroups = []

	sectionGroups.forEach((sectionGroup, sectionIndex) => {
		const testCases = Array.isArray(sectionGroup?.testCases) ? sectionGroup.testCases : []
		const selectedCases = []

		testCases.forEach((testCase, caseIndex) => {
			const testcaseId = String(testCase?.id || "").trim()
			if (!testcaseId) return
			if (selectedIds && !selectedIds.has(testcaseId)) return

			selectedCases.push({
				testCase,
				testcaseId,
				caseIndex,
			})
		})

		if (!selectedCases.length) return

		selectedGroups.push({
			sectionIndex,
			sectionGroup,
			selectedCases,
		})
	})

	return selectedGroups
}

const hasPostedToTestrail = (testCase = {}, platformGroup = null) => {
	const testrailPost = testCase?.testrailPost

	// New per-platform-group format
	if (platformGroup && testrailPost && typeof testrailPost === "object" && !testrailPost.status) {
		const groupPost = testrailPost[platformGroup]
		if (!groupPost) return false
		const status = String(groupPost.status || "").trim().toLowerCase()
		const testrailCaseId = normalizeOptionalNumber(groupPost.testrailCaseId)
		return status === "success" || testrailCaseId != null
	}

	// Legacy single-object format
	const status = String(testrailPost?.status || "").trim().toLowerCase()
	const testrailCaseId = normalizeOptionalNumber(testrailPost?.testrailCaseId)
	return status === "success" || testrailCaseId != null
}

const writeTestrailPost = (testCase, platformGroup, postData) => {
	if (platformGroup) {
		// Per-platform-group format: preserve existing group posts
		const existing = testCase.testrailPost && typeof testCase.testrailPost === "object" && !testCase.testrailPost.status
			? { ...testCase.testrailPost }
			: {}
		existing[platformGroup] = postData
		testCase.testrailPost = existing
	} else {
		testCase.testrailPost = postData
	}
}

const findSectionByName = (sections = [], sectionName = "", parentId = undefined) => {
	const normalizedName = String(sectionName || "").trim().toLowerCase()
	if (!normalizedName) return null

	return sections.find((section) => {
		const sameName = String(section?.name || "").trim().toLowerCase() === normalizedName
		if (!sameName) return false

		if (parentId === undefined) return true

		const sectionParent = normalizeOptionalNumber(section?.parent_id ?? section?.parentId)
		if (parentId == null) {
			return sectionParent == null
		}

		return sectionParent === normalizeOptionalNumber(parentId)
	}) || null
}

const ensureAiGeneratedRootSection = async (creds, remoteSections, projectName = null) => {
	const rootName = projectName ? `AIGen - ${projectName}` : "AI generated"
	const existing = findSectionByName(remoteSections, rootName, null)
	if (existing) {
		return existing
	}

	const created = await createSection(creds, {
		name: rootName,
		suite_id: Number(creds.suiteId),
		description: projectName
			? `Auto-generated test cases for ${projectName}.`
			: "",
	})

	remoteSections.push(created)
	return created
}

const ensurePostingSection = async (creds, remoteSections, sectionGroup = {}, platformGroup = null, projectName = null) => {
	const sectionName = getSectionName(sectionGroup, platformGroup)
	const meta = getSectionMeta(sectionGroup, platformGroup)
	const sectionId = meta.sectionId
	const source = meta.sectionSource || "ai"

	// Only short-circuit for numeric TestRail IDs — local "sec_xxx" strings
	// must fall through to name-based lookup / creation
	const isNumericTestrailId = sectionId != null && !(typeof sectionId === "string" && sectionId.startsWith("sec_"))
	if (isNumericTestrailId) {
		return {
			sectionId,
			mode: "existing",
			sectionName,
			source: "testrail",
		}
	}

	if (source === "testrail") {
		const existingByName = findSectionByName(remoteSections, sectionName)
		if (existingByName?.id != null) {
			return {
				sectionId: Number(existingByName.id),
				mode: "existing",
				sectionName: String(existingByName.name || sectionName),
				source: "testrail",
			}
		}
	}

	const rootSection = await ensureAiGeneratedRootSection(creds, remoteSections, projectName)
	const existingChild = findSectionByName(remoteSections, sectionName, rootSection.id)

	if (existingChild?.id != null) {
		return {
			sectionId: Number(existingChild.id),
			mode: "existing",
			sectionName: String(existingChild.name || sectionName),
			source: "testrail",
		}
	}

	const createdChild = await createSection(creds, {
		name: sectionName,
		suite_id: Number(creds.suiteId),
		parent_id: Number(rootSection.id),
		description: `Auto-created from section \"${sectionName}\" in prompt test cases.`,
	})

	remoteSections.push(createdChild)

	return {
		sectionId: Number(createdChild.id),
		mode: "new",
		sectionName: String(createdChild.name || sectionName),
		source: "testrail",
	}
}

const postTestCases = async ({ promptId, testcaseIds = [], platformFilter = [], platformGroups = [] } = {}) => {
	const normalizedPromptId = String(promptId || "").trim()
	const logger = createActionLogger({
		service: "TerrailService",
		action: "postTestCases",
		promptId: normalizedPromptId || "unknown",
		fileName: normalizedPromptId ? `analyze/${normalizedPromptId}.txt` : "runtime/testrail-posting.txt",
	})

	const normalizedGroups = Array.isArray(platformGroups)
		? platformGroups.map((g) => String(g || "").trim().toLowerCase()).filter(Boolean)
		: []

	logger.start("Post test cases requested", {
		promptId: normalizedPromptId || null,
		selectedCount: Array.isArray(testcaseIds) ? testcaseIds.length : 0,
		platformFilter: platformFilter.length > 0 ? platformFilter : "all",
		platformGroups: normalizedGroups.length > 0 ? normalizedGroups : "single",
	})

	if (!normalizedPromptId) {
		logger.fail("Validation failed: promptId is required")
		throw createValidationError("promptId is required", 400)
	}

	const projectName = getProjectNameForPrompt(normalizedPromptId)

	// Multi-platform group posting: validate all groups have sync config, then loop per group
	if (normalizedGroups.length > 1) {
		// Validate all platform groups have sync config mappings
		const missingGroups = normalizedGroups.filter(
			(groupKey) => !TestrailSyncConfigService.getByPlatformGroup(groupKey)
		)
		if (missingGroups.length > 0) {
			const missingLabels = missingGroups.map((g) => {
				const def = TestrailSyncConfigService.VALID_PLATFORM_GROUPS[g]
				return def ? def.label : g
			}).join(", ")
			logger.fail("Missing sync config for platform groups: " + missingLabels)
			throw createValidationError(
				`Missing TestRail sync config for: ${missingLabels}. Please configure all platform-to-suite mappings in Settings > TestRail Sync before posting.`,
				400
			)
		}

		logger.info("Multi-platform posting: iterating over groups", { groups: normalizedGroups })

		const parsedData = readPromptTestCases(normalizedPromptId)

		// Aggregate results across all groups
		let aggTotalPosted = 0
		let aggTotalFailed = 0
		let aggTotalSkipped = 0
		let aggTotalSections = 0
		let aggExistingSectionCount = 0
		let aggNewSectionCount = 0
		const aggSections = []
		const aggSkippedCases = []
		const perGroupResults = []

		for (const groupKey of normalizedGroups) {
			const groupDef = TestrailSyncConfigService.VALID_PLATFORM_GROUPS[groupKey]
			const groupPlatforms = groupDef ? groupDef.platforms : [groupKey]

			logger.info(`Processing platform group: ${groupKey}`, { platforms: groupPlatforms })

			try {
			const result = await postTestCasesForSingleGroup({
				normalizedPromptId,
				parsedData,
				testcaseIds,
				platformFilter: groupPlatforms,
				logger,
				projectName,
			})

				aggTotalPosted += result.totalPosted || 0
				aggTotalFailed += result.totalFailed || 0
				aggTotalSkipped += result.totalSkipped || 0
				aggTotalSections += result.totalSections || 0
				aggExistingSectionCount += result.existingSectionCount || 0
				aggNewSectionCount += result.newSectionCount || 0
				aggSections.push(...(result.sections || []))
				aggSkippedCases.push(...(result.skippedCases || []))
				perGroupResults.push({ platformGroup: groupKey, ...result })
			} catch (groupError) {
				logger.fail(`Failed posting for group ${groupKey}: ${groupError.message}`)
				perGroupResults.push({ platformGroup: groupKey, error: groupError.message })
				// Don't throw — continue to next group and report partial results
			}
		}

		// Write the file once after all groups processed
		FileReader.writeDataFile(`testcases/${normalizedPromptId}.json`, parsedData)

		logger.success("Multi-platform posting completed", {
			groups: normalizedGroups,
			totalPosted: aggTotalPosted,
			totalFailed: aggTotalFailed,
			totalSkipped: aggTotalSkipped,
		})

		return {
			promptId: normalizedPromptId,
			totalSections: aggTotalSections,
			existingSectionCount: aggExistingSectionCount,
			newSectionCount: aggNewSectionCount,
			totalSelectedCases: testcaseIds.length,
			totalEligibleCases: aggTotalPosted + aggTotalFailed,
			totalSkipped: aggTotalSkipped,
			totalPosted: aggTotalPosted,
			totalFailed: aggTotalFailed,
			sections: aggSections,
			skippedCases: aggSkippedCases,
			perGroupResults,
		}
	}

	// Single platform group posting (original flow)
	const parsedData = readPromptTestCases(normalizedPromptId)
	const result = await postTestCasesForSingleGroup({
		normalizedPromptId,
		parsedData,
		testcaseIds,
		platformFilter,
		logger,
		projectName,
	})

	FileReader.writeDataFile(`testcases/${normalizedPromptId}.json`, parsedData)

	return result
}

/**
 * Posts test cases to TestRail for a single platform group.
 * Operates on the passed parsedData object (mutates it in place for testrailPost metadata).
 * Does NOT write the file — caller is responsible for persisting.
 */
const postTestCasesForSingleGroup = async ({ normalizedPromptId, parsedData, testcaseIds, platformFilter, logger, projectName = null }) => {
	const selectedGroups = buildSelectedSections(parsedData, testcaseIds)

	const normalizedPlatformFilter = Array.isArray(platformFilter)
		? platformFilter.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean)
		: []
	const platformFilterSet = normalizedPlatformFilter.length > 0 ? new Set(normalizedPlatformFilter) : null

	const platformFilteredGroups = platformFilterSet
		? selectedGroups.reduce((acc, group) => {
			const filteredCases = group.selectedCases.filter(({ testCase }) => {
				const tcPlatforms = Array.isArray(testCase?.platforms) ? testCase.platforms : []
				return tcPlatforms.some((p) => platformFilterSet.has(String(p || "").trim().toLowerCase()))
			})

			if (filteredCases.length) {
				acc.push({ ...group, selectedCases: filteredCases })
			}

			return acc
		}, [])
		: selectedGroups

	logger.info("Selected groups resolved", {
		groups: platformFilteredGroups.length,
		totalSelectedCases: platformFilteredGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		platformFilter: platformFilterSet ? normalizedPlatformFilter : "all",
	})

	if (!platformFilteredGroups.length) {
		logger.fail("No test cases found for posting")
		throw createValidationError("No test cases found for posting", 404)
	}

	// Resolve suite from sync config based on platform filter (needed before skip check)
	const syncMapping = normalizedPlatformFilter.length > 0
		? TestrailSyncConfigService.resolveSuiteForPlatformFilter(normalizedPlatformFilter)
		: null
	const platformGroupKey = syncMapping?.platformGroup || null

	const skippedCases = []
	const postableGroups = platformFilteredGroups.reduce((acc, group) => {
		const eligibleCases = []

		group.selectedCases.forEach((selectedCase) => {
			if (hasPostedToTestrail(selectedCase.testCase, platformGroupKey)) {
				skippedCases.push({
					testcaseId: selectedCase.testcaseId,
					section: getSectionName(group.sectionGroup, platformGroupKey),
					testrailCaseId: normalizeOptionalNumber(selectedCase.testCase?.testrailPost?.testrailCaseId),
				})
				return
			}

			eligibleCases.push(selectedCase)
		})

		if (eligibleCases.length) {
			acc.push({
				...group,
				selectedCases: eligibleCases,
			})
		}

		return acc
	}, [])

	if (!postableGroups.length) {
		logger.success("No-op: all selected test cases already posted", {
			totalSelectedCases: platformFilteredGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
			totalSkipped: skippedCases.length,
		})
		return {
			promptId: normalizedPromptId,
			totalSections: 0,
			existingSectionCount: 0,
			newSectionCount: 0,
			totalSelectedCases: platformFilteredGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
			totalEligibleCases: 0,
			totalSkipped: skippedCases.length,
			totalPosted: 0,
			totalFailed: 0,
			sections: [],
			skippedCases,
			message: "All selected test cases were already posted to TestRail and were skipped.",
		}
	}

	const creds = pickCredentials()

	// Determine the effective suite: sync config > section group > env default
	const configSuiteId = syncMapping ? String(syncMapping.suiteId) : null

	// Collect unique suite IDs from section groups; use config suite, then section suiteId (per-platform), then env default
	const suiteIdsInUse = new Set()
	postableGroups.forEach((group) => {
		if (configSuiteId) {
			suiteIdsInUse.add(configSuiteId)
		} else {
			const groupMeta = getSectionMeta(group.sectionGroup, platformGroupKey)
			const groupSuiteId = groupMeta.suiteId
			suiteIdsInUse.add(groupSuiteId != null ? String(groupSuiteId) : creds.suiteId)
		}
	})

	// Fetch remote sections for each suite in use
	const remoteSectionsBySuite = new Map()
	for (const sid of suiteIdsInUse) {
		const remote = await getSections(sid)
		remoteSectionsBySuite.set(sid, Array.isArray(remote?.sections) ? [...remote.sections] : [])
	}

	await getCaseFields(creds)
	logger.info("Initialized TestRail posting context", {
		projectId: creds.projectId,
		defaultSuiteId: creds.suiteId,
		suitesInUse: Array.from(suiteIdsInUse),
		totalRemoteSections: Array.from(remoteSectionsBySuite.values()).reduce((sum, s) => sum + s.length, 0),
		totalSkipped: skippedCases.length,
		eligibleGroups: postableGroups.length,
	})

	const sectionSummaries = []
	let totalPosted = 0
	let totalFailed = 0
	let existingSectionCount = 0
	let newSectionCount = 0

	for (const group of postableGroups) {
		const sectionGroup = group.sectionGroup
		const nowIso = new Date().toISOString()
		const sectionName = getSectionName(sectionGroup, platformGroupKey)

		// Resolve the suite for this group: sync config > section group (per-platform) > env default
		const groupMeta = getSectionMeta(sectionGroup, platformGroupKey)
		const groupSuiteId = groupMeta.suiteId
		const effectiveSuiteId = configSuiteId || (groupSuiteId != null ? String(groupSuiteId) : creds.suiteId)
		const effectiveCreds = { ...creds, suiteId: effectiveSuiteId }
		const remoteSections = remoteSectionsBySuite.get(effectiveSuiteId) || []

		logger.step("Posting section started", {
			section: sectionName,
			suiteId: effectiveSuiteId,
			selectedCases: group.selectedCases.length,
		})

		let sectionInfo
		try {
			sectionInfo = await ensurePostingSection(effectiveCreds, remoteSections, sectionGroup, platformGroupKey, projectName)
		} catch (error) {
			logger.fail(error, {
				section: sectionName,
				stage: "ensurePostingSection",
			})
			sectionGroup.testrailPost = {
				status: "failed",
				lastAttemptAt: nowIso,
				message: error.message,
				targetSectionName: sectionName,
				postedCount: 0,
				failedCount: group.selectedCases.length,
			}

			group.selectedCases.forEach(({ testCase }) => {
				writeTestrailPost(testCase, platformGroupKey, {
					status: "failed",
					lastAttemptAt: nowIso,
					message: error.message,
				})
			})

			totalFailed += group.selectedCases.length
			sectionSummaries.push({
				section: sectionName,
				status: "failed",
				postedCount: 0,
				failedCount: group.selectedCases.length,
				message: error.message,
			})
			continue
		}

		if (sectionInfo.mode === "new") {
			newSectionCount += 1
		} else {
			existingSectionCount += 1
		}

		setSectionMeta(sectionGroup, platformGroupKey, {
			sectionId: sectionInfo.sectionId,
			suiteId: Number(effectiveSuiteId),
			sectionSource: "testrail",
			name: sectionInfo.sectionName || sectionName,
		})

		const casePayloads = group.selectedCases.map(({ testCase }) => buildCasePayload(testCase, sectionInfo.sectionId))
		const caseStatuses = []

		let postedCases = new Array(group.selectedCases.length).fill(null)
		try {
			const batchedCases = await addCases(effectiveCreds, sectionInfo.sectionId, casePayloads)
			postedCases = group.selectedCases.map((_, index) => batchedCases[index] || null)
			logger.success("Bulk add_cases completed", {
				section: sectionName,
				sectionId: sectionInfo.sectionId,
				requested: casePayloads.length,
				returned: batchedCases.length,
			})
		} catch (batchError) {
			logger.warn("Bulk add_cases failed. Falling back to one-by-one with duplicate detection", {
				section: sectionName,
				sectionId: sectionInfo.sectionId,
				error: batchError.message,
			})
			let existingCaseIdsBySignature = new Map()
			try {
				const sectionCasesAfterBulk = await getCasesBySection(effectiveCreds, sectionInfo.sectionId)
				existingCaseIdsBySignature = sectionCasesAfterBulk.reduce((acc, sectionCase) => {
					const signature = buildCaseSignatureFromTestrailCase(sectionCase)
					if (!signature) return acc

					const ids = acc.get(signature) || []
					if (sectionCase?.id != null) {
						ids.push(sectionCase.id)
					}
					acc.set(signature, ids)
					return acc
				}, new Map())
				logger.info("Duplicate detection cache built", {
					section: sectionName,
					sectionId: sectionInfo.sectionId,
					signatures: existingCaseIdsBySignature.size,
				})
			} catch (searchError) {
				logger.warn("Duplicate detection failed; continuing fallback posting", {
					section: sectionName,
					sectionId: sectionInfo.sectionId,
					error: searchError.message,
				})
				caseStatuses.push({
					index: -1,
					status: "info",
					error: `Duplicate detection skipped: ${searchError.message}`,
				})
			}

			for (let index = 0; index < group.selectedCases.length; index += 1) {
				const payload = casePayloads[index]
				const payloadSignature = buildCaseSignatureFromPayload(payload)

				if (payloadSignature && existingCaseIdsBySignature.has(payloadSignature)) {
					const matchingIds = existingCaseIdsBySignature.get(payloadSignature) || []
					const reusedCaseId = matchingIds.shift()
					existingCaseIdsBySignature.set(payloadSignature, matchingIds)

					if (reusedCaseId != null) {
						postedCases[index] = {
							id: reusedCaseId,
							_existing: true,
						}
						logger.step("Reused existing TestRail case during fallback", {
							section: sectionName,
							sectionId: sectionInfo.sectionId,
							reusedCaseId,
						})
						continue
					}
				}

				try {
					const posted = await addSingleCase(effectiveCreds, sectionInfo.sectionId, payload)
					postedCases[index] = posted
				} catch (singleError) {
					logger.warn("Single add_case failed", {
						section: sectionName,
						sectionId: sectionInfo.sectionId,
						index,
						error: singleError.message,
					})
					caseStatuses.push({
						index,
						status: "failed",
						error: singleError.message,
					})
				}
			}

			const successfulPosts = postedCases.filter((item) => item?.id != null).length
			if (!successfulPosts && caseStatuses.length === group.selectedCases.length) {
				const message = batchError?.message || "Failed to post section test cases"
				logger.fail("Section posting failed after fallback", {
					section: sectionName,
					sectionId: sectionInfo.sectionId,
					message,
				})
				sectionGroup.testrailPost = {
					status: "failed",
					lastAttemptAt: nowIso,
					message,
					targetSectionId: sectionInfo.sectionId,
					targetSectionName: sectionInfo.sectionName,
					postedCount: 0,
					failedCount: group.selectedCases.length,
					sectionMode: sectionInfo.mode,
				}

				group.selectedCases.forEach(({ testCase }, index) => {
					const failedItem = caseStatuses.find((item) => item.index === index)
					writeTestrailPost(testCase, platformGroupKey, {
						status: "failed",
						lastAttemptAt: nowIso,
						message: failedItem?.error || message,
					})
				})

				totalFailed += group.selectedCases.length
				sectionSummaries.push({
					section: sectionName,
					status: "failed",
					postedCount: 0,
					failedCount: group.selectedCases.length,
					message,
				})
				continue
			}
		}

		let postedCount = 0
		let failedCount = 0

		group.selectedCases.forEach(({ testCase, testcaseId }, index) => {
			const posted = postedCases[index]
			const failedItem = caseStatuses.find((item) => item.index === index)
			const isExistingFromBulk = Boolean(posted?._existing)

			if (posted?.id != null) {
				postedCount += 1
				writeTestrailPost(testCase, platformGroupKey, {
					status: "success",
					lastAttemptAt: nowIso,
					message: isExistingFromBulk ? "Already created in TestRail during bulk attempt" : "Posted to TestRail",
					sectionId: sectionInfo.sectionId,
					testrailCaseId: posted.id,
				})
				return
			}

			failedCount += 1
			writeTestrailPost(testCase, platformGroupKey, {
				status: "failed",
				lastAttemptAt: nowIso,
				message: failedItem?.error || "Failed to post case to TestRail",
				sectionId: sectionInfo.sectionId,
			})

			if (!failedItem) {
				caseStatuses.push({
					index,
					status: "failed",
					error: `No TestRail case ID returned for ${testcaseId}`,
				})
			}
		})

		totalPosted += postedCount
		totalFailed += failedCount

		const sectionStatus = failedCount > 0
			? (postedCount > 0 ? "partial" : "failed")
			: "success"

		sectionGroup.testrailPost = {
			status: sectionStatus,
			lastAttemptAt: nowIso,
			lastPostedAt: postedCount > 0 ? nowIso : sectionGroup?.testrailPost?.lastPostedAt || null,
			message: sectionStatus === "success"
				? `Posted ${postedCount} test case(s) to TestRail`
				: `Posted ${postedCount}, failed ${failedCount}`,
			targetSectionId: sectionInfo.sectionId,
			targetSectionName: sectionInfo.sectionName,
			sectionMode: sectionInfo.mode,
			postedCount,
			failedCount,
		}

		sectionSummaries.push({
			section: sectionName,
			status: sectionStatus,
			targetSectionId: sectionInfo.sectionId,
			targetSectionName: sectionInfo.sectionName,
			sectionMode: sectionInfo.mode,
			postedCount,
			failedCount,
		})

		logger.success("Section posting completed", {
			section: sectionName,
			status: sectionStatus,
			postedCount,
			failedCount,
			targetSectionId: sectionInfo.sectionId,
		})
	}

	logger.success("Posting operation completed", {
		totalSections: postableGroups.length,
		totalSelectedCases: platformFilteredGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		totalEligibleCases: postableGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		totalSkipped: skippedCases.length,
		totalPosted,
		totalFailed,
	})

	return {
		promptId: normalizedPromptId,
		totalSections: postableGroups.length,
		existingSectionCount,
		newSectionCount,
		totalSelectedCases: platformFilteredGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		totalEligibleCases: postableGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		totalSkipped: skippedCases.length,
		totalPosted,
		totalFailed,
		sections: sectionSummaries,
		skippedCases,
	}
}

module.exports = {
	getSuites,
	getSections,
	postTestCases,
	getSectionMeta,
	setSectionMeta,
	getSectionName,
	isPerPlatformMeta,
}
