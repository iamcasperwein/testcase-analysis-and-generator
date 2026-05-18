/**
 * LarkService - Fetches document content from Lark/Larksuite URLs.
 *
 * Uses the official @larksuiteoapi/node-sdk for:
 *   - Automatic tenant access token management (caching + refresh)
 *   - Type-safe API calls
 *   - Built-in retry and error handling
 *
 * Supports:
 *   - Lark Docs: https://xxx.larksuite.com/docx/XXXXX or https://xxx.feishu.cn/docx/XXXXX
 *   - Lark Wiki: https://xxx.larksuite.com/wiki/XXXXX or https://xxx.feishu.cn/wiki/XXXXX
 */

const lark = require("@larksuiteoapi/node-sdk");
const ConfigLoader = require("../utils/ConfigLoader");

// --- Singleton Client ---

let _client = null;

/**
 * Get or create the Lark SDK client (singleton, re-created if config changes).
 */
const getClient = () => {
    const config = ConfigLoader.load();
    const appId = config.LARK_APP_ID;
    const appSecret = config.LARK_APP_SECRET;

    if (!appId || !appSecret) {
        throw new LarkServiceError(
            "LARK_AUTH_CONFIG_MISSING",
            "Lark app credentials (LARK_APP_ID, LARK_APP_SECRET) are not configured."
        );
    }

    // Re-create client if credentials changed
    if (!_client || _client._appId !== appId || _client._appSecret !== appSecret) {
        const domain = config.LARK_BASE_URL || lark.Domain.Lark;
        _client = new lark.Client({
            appId,
            appSecret,
            domain,
            loggerLevel: lark.LoggerLevel.WARN,
        });
        // Track credentials for change detection
        _client._appId = appId;
        _client._appSecret = appSecret;
    }

    return _client;
};

// --- URL Parsing ---

/**
 * Supported Lark URL patterns:
 *   https://{tenant}.larksuite.com/docx/{doc_id}
 *   https://{tenant}.larksuite.com/wiki/{doc_id}
 *   https://{tenant}.feishu.cn/docx/{doc_id}
 *   https://{tenant}.feishu.cn/wiki/{doc_id}
 *   https://open.larksuite.com/document/{doc_id}
 */
const LARK_URL_PATTERNS = [
    /^https?:\/\/[\w-]+\.larksuite\.com\/(docx|wiki)\/([\w-]+)/i,
    /^https?:\/\/[\w-]+\.feishu\.cn\/(docx|wiki)\/([\w-]+)/i,
    /^https?:\/\/open\.larksuite\.com\/document\/([\w-]+)/i,
];

/**
 * Validates if a URL is a supported Lark document URL.
 * @param {string} url
 * @returns {boolean}
 */
const isValidLarkUrl = (url = "") => {
    const trimmed = String(url || "").trim();
    return LARK_URL_PATTERNS.some((pattern) => pattern.test(trimmed));
};

/**
 * Extracts the document ID and type from a Lark URL.
 * @param {string} url
 * @returns {{ documentId: string, urlType: string } | null}
 */
const parseDocumentId = (url = "") => {
    const trimmed = String(url || "").trim();
    for (const pattern of LARK_URL_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
            if (match.length >= 3) {
                return { documentId: match[2], urlType: match[1] };
            }
            return { documentId: match[1], urlType: "docx" };
        }
    }
    return null;
};

// --- Document Fetch ---

/**
 * Fetch raw content of a Lark document by document_id.
 * Uses SDK: docx.document.rawContent
 * @param {string} documentId
 * @returns {Promise<string>}
 */
const fetchDocContent = async (documentId) => {
    const client = getClient();

    try {
        const response = await client.docx.document.rawContent({
            path: { document_id: documentId },
            params: { lang: 1 },
        });

        if (response.code !== 0) {
            const code = response.code;
            const msg = response.msg || "Unknown error";

            if (code === 99991668 || code === 99991672) {
                throw new LarkServiceError("LARK_DOC_NOT_FOUND", `Document not found: ${msg}`);
            }
            if (code === 99991663 || code === 99991664) {
                throw new LarkServiceError("LARK_PERMISSION_DENIED", `No permission to access document: ${msg}`);
            }

            throw new LarkServiceError("LARK_API_ERROR", `Lark API error (code: ${code}): ${msg}`);
        }

        const content = String(response.data?.content || "").trim();
        if (!content) {
            throw new LarkServiceError("LARK_EMPTY_CONTENT", "Document returned empty content.");
        }

        return content;
    } catch (err) {
        if (err instanceof LarkServiceError) throw err;
        throw new LarkServiceError(
            "LARK_FETCH_FAILED",
            `Failed to fetch Lark document (${documentId}): ${err.message}`
        );
    }
};

/**
 * Fetch content from a Wiki node. Wiki nodes need to be resolved to their
 * actual document token first via the wiki.space.node API, then fetched as docx.
 * @param {string} wikiToken
 * @returns {Promise<string>}
 */
const fetchWikiContent = async (wikiToken) => {
    const client = getClient();

    try {
        // Step 1: Get the actual document node info from wiki token
        const nodeResp = await client.wiki.space.getNode({
            params: { token: wikiToken },
        });

        if (nodeResp.code !== 0) {
            const msg = nodeResp.msg || "Unknown error";
            if (nodeResp.code === 99991668 || nodeResp.code === 99991672) {
                throw new LarkServiceError("LARK_DOC_NOT_FOUND", `Wiki node not found: ${msg}`);
            }
            if (nodeResp.code === 99991663 || nodeResp.code === 99991664) {
                throw new LarkServiceError("LARK_PERMISSION_DENIED", `No permission to access wiki: ${msg}`);
            }
            throw new LarkServiceError("LARK_API_ERROR", `Wiki node lookup failed (code: ${nodeResp.code}): ${msg}`);
        }

        const objToken = nodeResp.data?.node?.obj_token;
        const objType = nodeResp.data?.node?.obj_type;

        if (!objToken) {
            throw new LarkServiceError("LARK_WIKI_RESOLVE_FAILED", "Could not resolve wiki node to document token.");
        }

        // Step 2: If it's a docx, fetch raw content using the resolved token
        if (objType === "docx" || objType === "doc") {
            return await fetchDocContent(objToken);
        }

        // For other types (sheet, bitable, etc.), attempt docx fetch as fallback
        return await fetchDocContent(objToken);
    } catch (err) {
        if (err instanceof LarkServiceError) throw err;
        throw new LarkServiceError(
            "LARK_FETCH_FAILED",
            `Failed to fetch wiki content (${wikiToken}): ${err.message}`
        );
    }
};

// --- High-level: Fetch content from URL ---

/**
 * Given a Lark URL, parse it and fetch its raw content.
 * Automatically routes to docx or wiki fetch based on URL type.
 * @param {string} url
 * @returns {Promise<{ content: string, documentId: string, urlType: string }>}
 */
const fetchContentFromUrl = async (url) => {
    const parsed = parseDocumentId(url);
    if (!parsed) {
        throw new LarkServiceError("LARK_INVALID_URL", `Invalid or unsupported Lark URL: ${url}`);
    }

    let content;
    if (parsed.urlType === "wiki") {
        content = await fetchWikiContent(parsed.documentId);
    } else {
        content = await fetchDocContent(parsed.documentId);
    }

    return {
        content,
        documentId: parsed.documentId,
        urlType: parsed.urlType,
    };
};

// --- Error Class ---

class LarkServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "LarkServiceError";
        this.code = code;
    }
}

module.exports = {
    isValidLarkUrl,
    parseDocumentId,
    fetchContentFromUrl,
    fetchDocContent,
    fetchWikiContent,
    getClient,
    LarkServiceError,
    LARK_URL_PATTERNS,
};
