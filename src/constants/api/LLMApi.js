// --- API Endpoints ---
const ENDPOINTS = Object.freeze({
	CHAT_COMPLETIONS: "/v1/chat/completions",
	COMPLETIONS: "/v1/completions",
	MODELS: "/v1/models",
	// Provider-specific base URLs
	CLAUDE: "https://api.anthropic.com/v1/messages",
	COPILOT: "https://models.github.ai/inference/chat/completions",
	LITELLM_DEFAULT_BASE_URL: "http://localhost:4000",
})

// --- Query params for /v1/models endpoint ---
const MODELS_QUERY_PARAMS = Object.freeze({
	return_wildcard_routes: false,
	include_model_access_groups: false,
	only_model_access_groups: false,
})

// --- Default request parameters ---
const DEFAULTS = Object.freeze({
	TIMEOUT_MS: 1800000,      // 30 min — used by non-streaming calls (Claude, Copilot)
	STREAM_TIMEOUT_MS: 600000, // 10 min — used by streaming calls; must exceed gateway proxy timeout (~5 min)
	TEMPERATURE: 0.2,
	MAX_TOKENS: 128000,
	// TOP_P: 0.95,
	ANTHROPIC_VERSION: "2023-06-01",
})

// --- Standard headers ---
const HEADERS = Object.freeze({
	CONTENT_TYPE: "application/json",
	ACCEPT: "application/json",
})

// --- HTTP error status codes ---
const ERROR_CODES = Object.freeze({
	VALIDATION_ERROR: 400,
	PAYLOAD_TOO_LARGE: 413,
	SERVICE_UNAVAILABLE: 502,
})

module.exports = { ENDPOINTS, MODELS_QUERY_PARAMS, DEFAULTS, HEADERS, ERROR_CODES }
