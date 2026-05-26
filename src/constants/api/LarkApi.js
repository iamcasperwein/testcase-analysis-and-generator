/**
 * Lark Open API Constants
 *
 * Centralized constants for Lark/Larksuite document integration.
 * Used by: service/LarkService.js, controller/QAgent.js
 */

// --- Lark API response codes ---
const RESPONSE_CODES = Object.freeze({
	SUCCESS: 0,
	DOC_NOT_FOUND: [99991668, 99991672],
	PERMISSION_DENIED: [99991663, 99991664],
})

// --- Default parameters for Lark API calls ---
const DEFAULTS = Object.freeze({
	LANG_NUMERIC: 1,           // rawContent API uses numeric lang
	LANG_STRING: "en",         // docs.content.get uses string lang
	DOC_TYPE: "docx",          // docs.content.get doc_type param
	CONTENT_TYPE: "markdown",  // docs.content.get content_type param
	LOGGER_LEVEL: "WARN",
})

// --- Application error codes (used in LarkServiceError) ---
const ERROR_CODES = Object.freeze({
	AUTH_CONFIG_MISSING: "LARK_AUTH_CONFIG_MISSING",
	DOC_NOT_FOUND: "LARK_DOC_NOT_FOUND",
	PERMISSION_DENIED: "LARK_PERMISSION_DENIED",
	API_ERROR: "LARK_API_ERROR",
	EMPTY_CONTENT: "LARK_EMPTY_CONTENT",
	FETCH_FAILED: "LARK_FETCH_FAILED",
	WIKI_RESOLVE_FAILED: "LARK_WIKI_RESOLVE_FAILED",
	INVALID_URL: "LARK_INVALID_URL",
})

// --- Supported Lark URL patterns ---
// Keep in sync with public/js/index.js (frontend validation)
const URL_PATTERNS = Object.freeze([
	/^https?:\/\/[\w-]+(?:\.[\w-]+)*\.larksuite\.com\/(docx|wiki)\/([\w-]+)/i,
	/^https?:\/\/[\w-]+(?:\.[\w-]+)*\.feishu\.cn\/(docx|wiki)\/([\w-]+)/i,
	/^https?:\/\/open\.larksuite\.com\/document\/([\w-]+)/i,
])

// --- Content format options ---
const CONTENT_FORMAT = Object.freeze({
	RAW: "raw",
	MARKDOWN: "markdown",
})

module.exports = { RESPONSE_CODES, DEFAULTS, ERROR_CODES, URL_PATTERNS, CONTENT_FORMAT }
