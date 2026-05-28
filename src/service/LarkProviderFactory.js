/**
 * LarkProviderFactory - Returns the appropriate Lark service based on config.
 *
 * Reads `larkProvider` from config.json:
 *   - "cli" or undefined/missing → LarkCliService (default)
 *   - "sdk" → LarkService (legacy, requires LARK_APP_ID + LARK_APP_SECRET)
 *
 * Both services expose the same interface:
 *   - isValidLarkUrl(url) → boolean
 *   - fetchContentFromUrl(url, options) → Promise<{ content, documentId, urlType, format }>
 */

const ConfigLoader = require("../utils/ConfigLoader");

/**
 * Get the active Lark provider service.
 * @returns {object} Service with isValidLarkUrl and fetchContentFromUrl methods
 */
const getProvider = () => {
    const provider = ConfigLoader.get("larkProvider", "cli").toLowerCase();

    if (provider === "sdk") {
        return require("./LarkService");
    }

    // Default: CLI
    return require("./LarkCliService");
};

/**
 * Get the current provider name.
 * @returns {"cli" | "sdk"}
 */
const getProviderName = () => {
    const provider = ConfigLoader.get("larkProvider", "cli").toLowerCase();
    return provider === "sdk" ? "sdk" : "cli";
};

module.exports = { getProvider, getProviderName };
