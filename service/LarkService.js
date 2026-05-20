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
const { RESPONSE_CODES, DEFAULTS, ERROR_CODES, URL_PATTERNS, CONTENT_FORMAT } = require("../constants/api/LarkApi");

// --- Singleton Client ---

let _client = null;

/**
 * Get or create the Lark SDK client (singleton, re-created if config changes).
 */
const getClient = () => {
    const config = ConfigLoader.readAll();
    const appId = config.LARK_APP_ID;
    const appSecret = config.LARK_APP_SECRET;

    if (!appId || !appSecret) {
        throw new LarkServiceError(
            ERROR_CODES.AUTH_CONFIG_MISSING,
            "Lark app credentials (LARK_APP_ID, LARK_APP_SECRET) are not configured."
        );
    }

    // Re-create client if credentials changed
    if (!_client || _client._appId !== appId || _client._appSecret !== appSecret) {
        _client = new lark.Client({
            appId,
            appSecret,
            domain: lark.Domain.Lark,
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
 * Validates if a URL is a supported Lark document URL.
 * @param {string} url
 * @returns {boolean}
 */
const isValidLarkUrl = (url = "") => {
    const trimmed = String(url || "").trim();
    return URL_PATTERNS.some((pattern) => pattern.test(trimmed));
};

/**
 * Extracts the document ID and type from a Lark URL.
 * @param {string} url
 * @returns {{ documentId: string, urlType: string } | null}
 */
const parseDocumentId = (url = "") => {
    const trimmed = String(url || "").trim();
    for (const pattern of URL_PATTERNS) {
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

// --- Helper: check Lark API response codes ---

const isDocNotFound = (code) => RESPONSE_CODES.DOC_NOT_FOUND.includes(code);
const isPermissionDenied = (code) => RESPONSE_CODES.PERMISSION_DENIED.includes(code);

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
            params: { lang: DEFAULTS.LANG_NUMERIC },
        });

        if (response.code !== RESPONSE_CODES.SUCCESS) {
            const code = response.code;
            const msg = response.msg || "Unknown error";

            if (isDocNotFound(code)) {
                throw new LarkServiceError(ERROR_CODES.DOC_NOT_FOUND, `Document not found: ${msg}`);
            }
            if (isPermissionDenied(code)) {
                throw new LarkServiceError(ERROR_CODES.PERMISSION_DENIED, `No permission to access document: ${msg}`);
            }

            throw new LarkServiceError(ERROR_CODES.API_ERROR, `Lark API error (code: ${code}): ${msg}`);
        }

        const content = String(response.data?.content || "").trim();
        if (!content) {
            throw new LarkServiceError(ERROR_CODES.EMPTY_CONTENT, "Document returned empty content.");
        }

        return content;
    } catch (err) {
        if (err instanceof LarkServiceError) throw err;
        throw new LarkServiceError(
            ERROR_CODES.FETCH_FAILED,
            `Failed to fetch Lark document (${documentId}): ${err.message}`
        );
    }
};

/**
 * Fetch document content as Markdown using the docs.content.get API.
 * This is the official Lark API for exporting document content in markdown format.
 * Falls back to raw content if the markdown API fails.
 * @param {string} documentId - The document token
 * @returns {Promise<string>} - Markdown content
 */
const fetchDocContentAsMarkdown = async (documentId) => {
    const client = getClient();

    try {
        const response = await client.docs.content.get({
            params: {
                doc_token: documentId,
                doc_type: DEFAULTS.DOC_TYPE,
                content_type: DEFAULTS.CONTENT_TYPE,
                lang: DEFAULTS.LANG_STRING,
            },
        });

        if (response.code !== RESPONSE_CODES.SUCCESS) {
            const code = response.code;
            const msg = response.msg || "Unknown error";

            if (isDocNotFound(code)) {
                throw new LarkServiceError(ERROR_CODES.DOC_NOT_FOUND, `Document not found: ${msg}`);
            }
            if (isPermissionDenied(code)) {
                throw new LarkServiceError(ERROR_CODES.PERMISSION_DENIED, `No permission to access document: ${msg}`);
            }

            // Fall back to raw content on other errors
            console.warn(`[LarkService] docs.content.get failed (code: ${code}), falling back to raw content`);
            return await fetchDocContent(documentId);
        }

        const content = String(response.data?.content || "").trim();
        if (!content) {
            // Fallback to raw content if markdown API returned empty
            return await fetchDocContent(documentId);
        }

        return content;
    } catch (err) {
        if (err instanceof LarkServiceError) throw err;
        // Fallback to raw content on any unexpected error
        console.warn(`[LarkService] Markdown fetch failed, falling back to raw content: ${err.message}`);
        return await fetchDocContent(documentId);
    }
};

/**
 * Fetch content from a Wiki node. Wiki nodes need to be resolved to their
 * actual document token first via the wiki.space.node API, then fetched as docx.
 * @param {string} wikiToken
 * @param {object} [options]
 * @param {string} [options.format] - "raw" or "markdown" (default: "raw")
 * @returns {Promise<string>}
 */
const fetchWikiContent = async (wikiToken, options = {}) => {
    const client = getClient();
    const format = options.format || CONTENT_FORMAT.RAW;

    try {
        // Step 1: Get the actual document node info from wiki token
        const nodeResp = await client.wiki.space.getNode({
            params: { token: wikiToken },
        });

        if (nodeResp.code !== RESPONSE_CODES.SUCCESS) {
            const msg = nodeResp.msg || "Unknown error";
            if (isDocNotFound(nodeResp.code)) {
                throw new LarkServiceError(ERROR_CODES.DOC_NOT_FOUND, `Wiki node not found: ${msg}`);
            }
            if (isPermissionDenied(nodeResp.code)) {
                throw new LarkServiceError(ERROR_CODES.PERMISSION_DENIED, `No permission to access wiki: ${msg}`);
            }
            throw new LarkServiceError(ERROR_CODES.API_ERROR, `Wiki node lookup failed (code: ${nodeResp.code}): ${msg}`);
        }

        const objToken = nodeResp.data?.node?.obj_token;
        const objType = nodeResp.data?.node?.obj_type;

        if (!objToken) {
            throw new LarkServiceError(ERROR_CODES.WIKI_RESOLVE_FAILED, "Could not resolve wiki node to document token.");
        }

        // Step 2: Fetch content using the resolved token
        if (format === CONTENT_FORMAT.MARKDOWN) {
            return await fetchDocContentAsMarkdown(objToken);
        }
        return await fetchDocContent(objToken);
    } catch (err) {
        if (err instanceof LarkServiceError) throw err;
        throw new LarkServiceError(
            ERROR_CODES.FETCH_FAILED,
            `Failed to fetch wiki content (${wikiToken}): ${err.message}`
        );
    }
};

// --- High-level: Fetch content from URL ---

/**
 * Given a Lark URL, parse it and fetch its content.
 * Automatically routes to docx or wiki fetch based on URL type.
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.format] - "raw" (plain text) or "markdown" (default: "markdown")
 * @returns {Promise<{ content: string, documentId: string, urlType: string, format: string }>}
 */
const fetchContentFromUrl = async (url, options = {}) => {
    const parsed = parseDocumentId(url);
    if (!parsed) {
        throw new LarkServiceError(ERROR_CODES.INVALID_URL, `Invalid or unsupported Lark URL: ${url}`);
    }

    const format = options.format || CONTENT_FORMAT.MARKDOWN;

    let content;
    if (parsed.urlType === "wiki") {
        content = await fetchWikiContent(parsed.documentId, { format });
    } else {
        if (format === CONTENT_FORMAT.MARKDOWN) {
            content = await fetchDocContentAsMarkdown(parsed.documentId);
        } else {
            content = await fetchDocContent(parsed.documentId);
        }
    }

    return {
        content,
        documentId: parsed.documentId,
        urlType: parsed.urlType,
        format,
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
    fetchDocContentAsMarkdown,
    fetchWikiContent,
    getClient,
    LarkServiceError,
    CONTENT_FORMAT,
};
