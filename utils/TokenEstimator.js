/**
 * TokenEstimator.js
 * Lightweight token estimation utility.
 * Uses character-based approximation (no external dependency required).
 * Accuracy: ~±15% vs actual tokenizers — sufficient for context limit gating.
 */

const MODEL_CONTEXT_LIMITS = Object.freeze({
    // Gemini
    "models/gemini-2.5-flash": 1_000_000,
    "models/gemini-2.5-pro": 1_000_000,
    "models/gemini-1.5-flash": 1_000_000,
    "models/gemini-1.5-pro": 2_000_000,
    // Claude
    "claude-sonnet-4-6": 200_000,
    "claude-opus-4-5": 200_000,
    "claude-haiku-3-5": 200_000,
    // GitHub Copilot / OpenAI
    "openai/gpt-5-chat": 128_000,
    "openai/gpt-4.1": 128_000,
    "openai/gpt-4.1-mini": 128_000,
    "openai/gpt-4o": 128_000,
    "openai/gpt-4o-mini": 128_000,
});

const DEFAULT_CONTEXT_LIMIT = 128_000;

// Output buffer: reserve 15% of the context window for model output
const OUTPUT_BUFFER_RATIO = 0.15;

/**
 * Estimate token count from a string using character-based approximation.
 * English text averages ~4 chars/token; code/JSON averages ~3.5 chars/token.
 * We use 3.5 as a conservative estimate (slight overcount = safer).
 *
 * @param {string} text
 * @returns {number} estimated token count
 */
const estimateTokens = (text) => {
    const chars = String(text || "").length;
    return Math.ceil(chars / 3.5);
};

/**
 * Get the context limit for a given model name.
 * Falls back to DEFAULT_CONTEXT_LIMIT if the model is unknown.
 *
 * @param {string} model
 * @returns {number} total context window in tokens
 */
const getContextLimit = (model) => {
    const key = String(model || "").trim().toLowerCase();
    // Try exact match first
    if (MODEL_CONTEXT_LIMITS[key]) return MODEL_CONTEXT_LIMITS[key];
    // Try partial match (e.g., for model names with version suffixes)
    for (const [knownModel, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
        if (key.includes(knownModel) || knownModel.includes(key)) return limit;
    }
    return DEFAULT_CONTEXT_LIMIT;
};

/**
 * Check whether a prompt fits within the model's safe context window
 * (total context minus output buffer).
 *
 * @param {string} prompt - The full prompt string to check
 * @param {string} model  - Model name (used to look up context limit)
 * @returns {{ fits: boolean, estimated: number, safeLimit: number, excess: number }}
 */
const validateContextFits = (prompt, model) => {
    const estimated = estimateTokens(prompt);
    const totalLimit = getContextLimit(model);
    const safeLimit = Math.floor(totalLimit * (1 - OUTPUT_BUFFER_RATIO));

    if (estimated > safeLimit) {
        return {
            fits: false,
            estimated,
            safeLimit,
            totalLimit,
            excess: estimated - safeLimit,
        };
    }

    return {
        fits: true,
        estimated,
        safeLimit,
        totalLimit,
        excess: 0,
    };
};

module.exports = {
    estimateTokens,
    getContextLimit,
    validateContextFits,
    MODEL_CONTEXT_LIMITS,
};
