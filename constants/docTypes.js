/**
 * Centralized document type definitions.
 * Used by FE (dropdown options), BE (validation, prompt building), and AI services.
 *
 * priority: how the AI should weigh this document
 *   - "primary"   → source of truth (PRD)
 *   - "high"      → implementation detail / design spec (RFC, Figma, API Contract)
 *   - "medium"    → supporting context (Architecture Doc, Test Plan, User Story)
 *   - "low"       → supplemental reference
 */
const DOC_TYPES = Object.freeze([
	{ value: "PRD", label: "PRD", description: "Product Requirements Document", priority: "primary" },
	{ value: "RFC", label: "RFC", description: "Request for Comments / Technical Spec", priority: "high" },
	{ value: "FIGMA", label: "Figma", description: "Figma design export or screenshot", priority: "high" },
	{ value: "API_CONTRACT", label: "API Contract", description: "API specification (OpenAPI, Swagger, etc.)", priority: "high" },
	{ value: "USER_STORY", label: "User Story", description: "User story or acceptance criteria", priority: "medium" },
	{ value: "ARCHITECTURE", label: "Architecture Doc", description: "System architecture or design document", priority: "medium" },
	{ value: "TEST_PLAN", label: "Test Plan", description: "Existing test plan or strategy", priority: "medium" },
	{ value: "RELEASE_NOTE", label: "Release Note", description: "Release notes or changelog", priority: "low" },
	{ value: "OTHER", label: "Other", description: "Other supporting document", priority: "low" },
])

const DOC_TYPE_MAP = Object.freeze(
	DOC_TYPES.reduce((acc, dt) => {
		acc[dt.value] = dt
		return acc
	}, {})
)

/**
 * Resolve a raw docType string to a known DOC_TYPE value.
 * Falls back to "OTHER" if unrecognized.
 */
const resolveDocType = (raw = "") => {
	const normalized = String(raw || "").trim().toUpperCase().replace(/[\s-]+/g, "_")
	if (DOC_TYPE_MAP[normalized]) return normalized

	// Fuzzy match
	if (/RFC/i.test(normalized)) return "RFC"
	if (/FIGMA/i.test(normalized)) return "FIGMA"
	if (/PRD|PRODUCT.?REQ/i.test(normalized)) return "PRD"
	if (/API.?CONTRACT|SWAGGER|OPENAPI/i.test(normalized)) return "API_CONTRACT"
	if (/USER.?STORY|ACCEPTANCE/i.test(normalized)) return "USER_STORY"
	if (/ARCHITECT/i.test(normalized)) return "ARCHITECTURE"
	if (/TEST.?PLAN/i.test(normalized)) return "TEST_PLAN"
	if (/RELEASE.?NOTE|CHANGELOG/i.test(normalized)) return "RELEASE_NOTE"

	return "OTHER"
}

/**
 * Get the priority for a given docType value.
 */
const getDocTypePriority = (docTypeValue = "") => {
	const dt = DOC_TYPE_MAP[docTypeValue]
	return dt ? dt.priority : "low"
}

/**
 * Priority ordering for prompt construction (primary first, low last).
 */
const PRIORITY_ORDER = Object.freeze({ primary: 0, high: 1, medium: 2, low: 3 })

const sortByPriority = (documents = []) => {
	return [...documents].sort((a, b) => {
		const pa = PRIORITY_ORDER[getDocTypePriority(a.docType)] ?? 3
		const pb = PRIORITY_ORDER[getDocTypePriority(b.docType)] ?? 3
		return pa - pb
	})
}

module.exports = {
	DOC_TYPES,
	DOC_TYPE_MAP,
	resolveDocType,
	getDocTypePriority,
	sortByPriority,
	PRIORITY_ORDER,
}
