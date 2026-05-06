const axios = require("axios")
const FileReader = require("../utils/FileReader")
const { createActionLogger } = require("../utils/AppLogger")

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

const pickCredentials = () => {
	const username = String(process.env.TESTRAIL_USERNAME || "").trim()
	const password = String(process.env.TESTRAIL_PASSWORD || process.env.TESTRAIL_API_KEY || "").trim()
	const projectId = String(process.env.TESTRAIL_PROJECT_ID || "").trim()
	const suiteId = String(process.env.TESTRAIL_TESTSUITE_ID || process.env.TESTRAIL_SUITE_ID || "").trim()
	const baseUrl = normalizeBaseUrl(process.env.TESTRAIL_URL || "")

	if (!baseUrl) {
		throw createValidationError("TESTRAIL_URL is required", 400)
	}

	if (!username) {
		throw createValidationError("TESTRAIL_USERNAME is required", 400)
	}

	if (!password) {
		throw createValidationError("TESTRAIL_PASSWORD or TESTRAIL_API_KEY is required", 400)
	}

	if (!projectId) {
		throw createValidationError("TESTRAIL_PROJECT_ID is required", 400)
	}

	if (!suiteId) {
		throw createValidationError("TESTRAIL_TESTSUITE_ID is required", 400)
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

const getSections = async () => {
	const logger = createActionLogger({
		service: "TestrailService",
		action: "getSections",
		fileName: "runtime/testrail-sections.txt",
	})
	logger.start("Fetching sections from TestRail")

	const creds = pickCredentials()
	const requestUrl = buildSectionsUrl({
		baseUrl: creds.baseUrl,
		projectId: creds.projectId,
		suiteId: creds.suiteId,
	})

	try {
		const response = await axios.get(requestUrl, createAuthConfig(creds, { timeout: 15000 }))
		const payload = response.data || {}
		const sections = Array.isArray(payload?.sections) ? payload.sections.map(mapTestrailSection) : []
		logger.success("Sections fetched", {
			projectId: creds.projectId,
			suiteId: creds.suiteId,
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

const normalizeSectionSource = (section = {}) => {
	const raw = String(section.sectionSource || section.source || "").trim().toLowerCase()
	if (raw === "testrail" || raw === "ai" || raw === "user") return raw
	return section.sectionId != null ? "testrail" : "ai"
}

const readPromptTestCases = (promptId) => {
	const raw = FileReader.readDataFile(`testcases/${promptId}.json`)
	return JSON.parse(raw)
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

const hasPostedToTestrail = (testCase = {}) => {
	const status = String(testCase?.testrailPost?.status || "").trim().toLowerCase()
	const testrailCaseId = normalizeOptionalNumber(testCase?.testrailPost?.testrailCaseId)
	return status === "success" || testrailCaseId != null
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

const ensureAiGeneratedRootSection = async (creds, remoteSections) => {
	const existing = findSectionByName(remoteSections, "AI generated", null)
	if (existing) {
		return existing
	}

	const created = await createSection(creds, {
		name: "AI generated",
		suite_id: Number(creds.suiteId),
		description: "",
	})

	remoteSections.push(created)
	return created
}

const ensurePostingSection = async (creds, remoteSections, sectionGroup = {}) => {
	const sectionName = String(sectionGroup?.section || "").trim() || "Uncategorized"
	const sectionId = normalizeOptionalNumber(sectionGroup?.sectionId)
	const source = normalizeSectionSource(sectionGroup)

	if (sectionId != null) {
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

	const rootSection = await ensureAiGeneratedRootSection(creds, remoteSections)
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

const postTestCases = async ({ promptId, testcaseIds = [] } = {}) => {
	const normalizedPromptId = String(promptId || "").trim()
	const logger = createActionLogger({
		service: "TestrailService",
		action: "postTestCases",
		promptId: normalizedPromptId || "unknown",
		fileName: normalizedPromptId ? `analyze/${normalizedPromptId}.txt` : "runtime/testrail-posting.txt",
	})
	logger.start("Post test cases requested", {
		promptId: normalizedPromptId || null,
		selectedCount: Array.isArray(testcaseIds) ? testcaseIds.length : 0,
	})

	if (!normalizedPromptId) {
		logger.fail("Validation failed: promptId is required")
		throw createValidationError("promptId is required", 400)
	}

	const parsedData = readPromptTestCases(normalizedPromptId)
	const selectedGroups = buildSelectedSections(parsedData, testcaseIds)
	logger.info("Selected groups resolved", {
		groups: selectedGroups.length,
		totalSelectedCases: selectedGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
	})

	if (!selectedGroups.length) {
		logger.fail("No test cases found for posting")
		throw createValidationError("No test cases found for posting", 404)
	}

	const skippedCases = []
	const postableGroups = selectedGroups.reduce((acc, group) => {
		const eligibleCases = []

		group.selectedCases.forEach((selectedCase) => {
			if (hasPostedToTestrail(selectedCase.testCase)) {
				skippedCases.push({
					testcaseId: selectedCase.testcaseId,
					section: String(group.sectionGroup?.section || "").trim() || "Uncategorized",
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
			totalSelectedCases: selectedGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
			totalSkipped: skippedCases.length,
		})
		return {
			promptId: normalizedPromptId,
			totalSections: 0,
			existingSectionCount: 0,
			newSectionCount: 0,
			totalSelectedCases: selectedGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
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
	const remote = await getSections()
	const remoteSections = Array.isArray(remote?.sections) ? [...remote.sections] : []
	await getCaseFields(creds)
	logger.info("Initialized TestRail posting context", {
		projectId: creds.projectId,
		suiteId: creds.suiteId,
		remoteSections: remoteSections.length,
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
		const sectionName = String(sectionGroup?.section || "").trim() || "Uncategorized"
		logger.step("Posting section started", {
			section: sectionName,
			selectedCases: group.selectedCases.length,
		})

		let sectionInfo
		try {
			sectionInfo = await ensurePostingSection(creds, remoteSections, sectionGroup)
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
				testCase.testrailPost = {
					status: "failed",
					lastAttemptAt: nowIso,
					message: error.message,
				}
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

		sectionGroup.sectionId = sectionInfo.sectionId
		sectionGroup.suiteId = Number(creds.suiteId)
		sectionGroup.sectionSource = "testrail"

		const casePayloads = group.selectedCases.map(({ testCase }) => buildCasePayload(testCase, sectionInfo.sectionId))
		const caseStatuses = []

		let postedCases = new Array(group.selectedCases.length).fill(null)
		try {
			const batchedCases = await addCases(creds, sectionInfo.sectionId, casePayloads)
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
				const sectionCasesAfterBulk = await getCasesBySection(creds, sectionInfo.sectionId)
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
					const posted = await addSingleCase(creds, sectionInfo.sectionId, payload)
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
					testCase.testrailPost = {
						status: "failed",
						lastAttemptAt: nowIso,
						message: failedItem?.error || message,
					}
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
				testCase.testrailPost = {
					status: "success",
					lastAttemptAt: nowIso,
					message: isExistingFromBulk ? "Already created in TestRail during bulk attempt" : "Posted to TestRail",
					sectionId: sectionInfo.sectionId,
					testrailCaseId: posted.id,
				}
				return
			}

			failedCount += 1
			testCase.testrailPost = {
				status: "failed",
				lastAttemptAt: nowIso,
				message: failedItem?.error || "Failed to post case to TestRail",
				sectionId: sectionInfo.sectionId,
			}

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

	FileReader.writeDataFile(`testcases/${normalizedPromptId}.json`, parsedData)
	logger.success("Posting operation completed", {
		totalSections: postableGroups.length,
		totalSelectedCases: selectedGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
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
		totalSelectedCases: selectedGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		totalEligibleCases: postableGroups.reduce((sum, item) => sum + item.selectedCases.length, 0),
		totalSkipped: skippedCases.length,
		totalPosted,
		totalFailed,
		sections: sectionSummaries,
		skippedCases,
	}
}

module.exports = {
	getSections,
	postTestCases,
}
