/**
 * Centralized document type definitions.
 * Used by FE (dropdown options), BE (validation, prompt building), and AI services.
 *
 * All documents are treated with equal weight — the AI cross-references
 * all provided documents and flags mismatches or gaps between them.
 */
const DOC_TYPES = Object.freeze([
	{ value: "PRD", label: "PRD", description: "Product Requirements Document" },
	{ value: "RFC", label: "RFC", description: "Request for Comments / Technical Spec" },
	{ value: "FIGMA", label: "Figma", description: "Figma design export or screenshot" },
	{ value: "API_CONTRACT", label: "API Contract", description: "API specification (OpenAPI, Swagger, etc.)" },
	{ value: "USER_STORY", label: "User Story", description: "User story or acceptance criteria" },
	{ value: "ARCHITECTURE", label: "Architecture Doc", description: "System architecture or design document" },
	{ value: "TEST_PLAN", label: "Test Plan", description: "Existing test plan or strategy" },
	{ value: "RELEASE_NOTE", label: "Release Note", description: "Release notes or changelog" },
	{ value: "TEST_STRATEGY", label: "Testing Strategy", description: "Testing Strategy Analysis" },
	{ value: "OTHER", label: "Other", description: "Other supporting document" },
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

module.exports = {
	DOC_TYPES,
	DOC_TYPE_MAP,
	resolveDocType,
}
