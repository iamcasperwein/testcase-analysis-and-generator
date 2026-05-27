/**
 * FigmaService - Fetches and extracts structured context from Figma design files.
 *
 * Capabilities:
 *   - Parse Figma URLs to extract fileKey and nodeIds
 *   - Fetch node tree from Figma REST API
 *   - Export frame images (PNG) for multimodal AI
 *   - Extract AI-friendly structured context (text, hierarchy, components, interactions)
 *   - Save raw Figma JSON for traceability
 *
 * Used by QAgentService during document enrichment for docType: "FIGMA"
 */

const axios = require("axios");
const ConfigLoader = require("../utils/ConfigLoader");
const FileReader = require("../utils/FileReader");

const FIGMA_API_BASE = "https://api.figma.com/v1";

// --- Error Classes ---

class FigmaServiceError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "FigmaServiceError";
        this.code = code;
        this.details = details;
    }
}

// --- URL Parsing ---

/**
 * Check if a URL is a valid Figma URL.
 */
const isFigmaUrl = (input) => {
    try {
        const url = new URL(String(input || "").trim());
        return url.hostname === "www.figma.com" || url.hostname === "figma.com";
    } catch {
        return false;
    }
};

/**
 * Parse a Figma URL to extract fileKey, nodeIds, and optional title.
 *
 * Supports:
 *   - https://www.figma.com/design/FILEKEY/Title?node-id=123-456
 *   - https://www.figma.com/file/FILEKEY/Title?node-id=123-456,789-012
 */
const parseFigmaUrl = (url) => {
    const urlObj = new URL(String(url || "").trim());
    const { pathname } = urlObj;

    const fileKeyMatch = pathname.match(/\/(design|file)\/([a-zA-Z0-9]+)/);
    if (!fileKeyMatch || !fileKeyMatch[2]) {
        throw new FigmaServiceError("INVALID_URL", `Invalid Figma URL: cannot extract file key from ${url}`);
    }

    const fileKey = fileKeyMatch[2];

    const titleMatch = pathname.match(/\/(design|file)\/[a-zA-Z0-9]+\/([^?]+)/);
    const title = titleMatch?.[2] ? decodeURIComponent(titleMatch[2].replace(/-/g, " ")) : undefined;

    const nodeIdParam = urlObj.searchParams.get("node-id");
    const nodeIds = [];

    if (nodeIdParam) {
        const ids = nodeIdParam.split(",").map((id) => id.trim().replace(/-/g, ":"));
        nodeIds.push(...ids.filter(Boolean));
    }

    return { fileKey, nodeIds, title };
};

// --- API Calls ---

const getAccessToken = () => {
    const token = ConfigLoader.get("FIGMA_ACCESS_TOKEN");
    if (!token) {
        throw new FigmaServiceError("AUTH_MISSING", "FIGMA_ACCESS_TOKEN is not configured. Add it in Settings.");
    }
    return token;
};

const makeRequest = async (url, token) => {
    try {
        const response = await axios.get(url, {
            headers: { "X-Figma-Token": token },
            timeout: 30000,
        });
        return response.data;
    } catch (err) {
        const status = err.response?.status;
        const body = err.response?.data || err.message;

        const messages = {
            400: `Bad request: ${JSON.stringify(body)}`,
            401: "Invalid or expired Figma access token. Check FIGMA_ACCESS_TOKEN in Settings.",
            403: "Access denied. Ensure the token has access to this file.",
            404: "File or node not found. Check the Figma URL.",
            429: "Figma API rate limited. Please wait and retry.",
        };

        throw new FigmaServiceError(
            "API_ERROR",
            messages[status] || `Figma API error (${status || "unknown"}): ${err.message}`,
            { status, body }
        );
    }
};

/**
 * Fetch node tree from Figma API.
 */
const fetchFileNodes = async (fileKey, nodeIds) => {
    const token = getAccessToken();

    if (!nodeIds || !nodeIds.length) {
        // Fetch entire file structure (top-level only)
        const url = `${FIGMA_API_BASE}/files/${fileKey}?depth=4`;
        return makeRequest(url, token);
    }

    const params = new URLSearchParams();
    params.set("ids", nodeIds.join(","));

    const url = `${FIGMA_API_BASE}/files/${fileKey}/nodes?${params.toString()}`;
    return makeRequest(url, token);
};

/**
 * Fetch frame images as PNG URLs.
 */
const fetchFrameImages = async (fileKey, nodeIds, options = {}) => {
    const token = getAccessToken();
    const { scale = 2, format = "png" } = options;

    if (!nodeIds || !nodeIds.length) return {};

    const params = new URLSearchParams();
    params.set("ids", nodeIds.join(","));
    params.set("scale", String(scale));
    params.set("format", format);

    const url = `${FIGMA_API_BASE}/images/${fileKey}?${params.toString()}`;
    const data = await makeRequest(url, token);
    return data.images || {};
};

/**
 * Download an image from URL and return as Buffer.
 */
const downloadImage = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
        const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30000 });
        return Buffer.from(response.data);
    } catch {
        return null;
    }
};

// --- Context Extraction ---

/**
 * Extract all text nodes from a Figma node tree recursively.
 */
const extractTextNodes = (node, results = []) => {
    if (!node) return results;

    if (node.type === "TEXT" && node.characters) {
        const text = String(node.characters).trim();
        if (text) {
            results.push({
                text,
                name: node.name || "",
                visible: node.visible !== false,
                style: node.style || {},
            });
        }
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            extractTextNodes(child, results);
        }
    }

    return results;
};

/**
 * Extract UI structure as a simplified hierarchy tree.
 * Only includes meaningful structural/interactive nodes (skips decorative wrappers).
 */
const extractUIStructure = (node, depth = 0, maxDepth = 6) => {
    if (!node || depth > maxDepth) return null;
    if (node.visible === false) return null;

    const isStructural = [
        "FRAME", "GROUP", "SECTION", "COMPONENT", "COMPONENT_SET", "INSTANCE",
    ].includes(node.type);

    const isInteractive = [
        "TEXT", "RECTANGLE", "ELLIPSE", "VECTOR",
    ].includes(node.type) && node.name && /button|input|toggle|checkbox|radio|link|tab|dropdown|switch/i.test(node.name);

    const isText = node.type === "TEXT" && node.characters;

    if (!isStructural && !isInteractive && !isText && depth > 1) return null;

    const entry = {
        name: node.name || node.type,
        type: node.type,
    };

    if (isText) {
        entry.text = String(node.characters).trim();
    }

    if (node.componentProperties) {
        entry.variants = Object.entries(node.componentProperties).reduce((acc, [key, val]) => {
            acc[key] = val.value || val.defaultValue;
            return acc;
        }, {});
    }

    if (Array.isArray(node.children) && node.children.length > 0 && isStructural) {
        const children = node.children
            .map((child) => extractUIStructure(child, depth + 1, maxDepth))
            .filter(Boolean);
        if (children.length > 0) {
            entry.children = children;
        }
    }

    return entry;
};

/**
 * Extract component instances and their variant properties.
 */
const extractComponents = (node, results = []) => {
    if (!node) return results;

    if ((node.type === "INSTANCE" || node.type === "COMPONENT") && node.name) {
        const component = {
            name: node.name,
            type: node.type,
            visible: node.visible !== false,
        };

        if (node.componentProperties && Object.keys(node.componentProperties).length > 0) {
            component.properties = {};
            for (const [key, val] of Object.entries(node.componentProperties)) {
                component.properties[key] = val.value || val.defaultValue || val.type;
            }
        }

        // Check for variant-like names (State=Default, Size=Large)
        if (node.name.includes("=") || node.name.includes("/")) {
            component.variantKey = node.name;
        }

        results.push(component);
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            extractComponents(child, results);
        }
    }

    return results;
};

/**
 * Extract interactive elements (buttons, inputs, links, etc.) by name pattern.
 */
const extractInteractiveElements = (node, results = []) => {
    if (!node) return results;
    if (node.visible === false) return results;

    const name = String(node.name || "").toLowerCase();
    const interactivePatterns = [
        { pattern: /button/i, type: "Button" },
        { pattern: /input|text.?field|text.?area/i, type: "Input" },
        { pattern: /checkbox|check.?box/i, type: "Checkbox" },
        { pattern: /radio/i, type: "Radio" },
        { pattern: /toggle|switch/i, type: "Toggle" },
        { pattern: /dropdown|select|picker/i, type: "Dropdown" },
        { pattern: /link|anchor/i, type: "Link" },
        { pattern: /tab/i, type: "Tab" },
        { pattern: /modal|dialog|popup|bottom.?sheet/i, type: "Modal" },
        { pattern: /nav|menu|sidebar/i, type: "Navigation" },
        { pattern: /card/i, type: "Card" },
        { pattern: /toast|snackbar|alert|banner/i, type: "Notification" },
    ];

    for (const { pattern, type } of interactivePatterns) {
        if (pattern.test(name) || pattern.test(node.type === "INSTANCE" ? name : "")) {
            const element = {
                name: node.name,
                elementType: type,
                nodeType: node.type,
            };

            if (node.characters) {
                element.text = String(node.characters).trim();
            }

            if (node.componentProperties) {
                element.properties = {};
                for (const [key, val] of Object.entries(node.componentProperties)) {
                    element.properties[key] = val.value || val.defaultValue;
                }
            }

            results.push(element);
            break;
        }
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            extractInteractiveElements(child, results);
        }
    }

    return results;
};

// --- Format Context for AI ---

/**
 * Format extracted data into AI-friendly structured text.
 */
const formatContextForAI = (frameData) => {
    const { frameName, nodeId, textNodes, structure, components, interactiveElements } = frameData;

    const lines = [];
    lines.push(`## Screen: "${frameName}" (node: ${nodeId})`);
    lines.push("");

    // Text Content
    if (textNodes.length > 0) {
        lines.push("### Text Content");
        const visibleTexts = textNodes.filter((t) => t.visible);
        // Deduplicate and group
        const seen = new Set();
        for (const t of visibleTexts) {
            const key = t.text.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const label = t.name ? `${t.name}: "${t.text}"` : `"${t.text}"`;
            lines.push(`- ${label}`);
        }
        lines.push("");
    }

    // UI Structure
    if (structure) {
        lines.push("### UI Structure");
        const renderTree = (node, indent = 0) => {
            const prefix = "  ".repeat(indent);
            let label = `${prefix}- ${node.name} (${node.type})`;
            if (node.text) label += ` — "${node.text}"`;
            if (node.variants) label += ` [variants: ${JSON.stringify(node.variants)}]`;
            lines.push(label);
            if (node.children) {
                for (const child of node.children) {
                    renderTree(child, indent + 1);
                }
            }
        };
        renderTree(structure);
        lines.push("");
    }

    // Components & Variants
    if (components.length > 0) {
        lines.push("### Components & Variants");
        const uniqueComponents = new Map();
        for (const c of components) {
            const key = c.variantKey || c.name;
            if (!uniqueComponents.has(key)) {
                uniqueComponents.set(key, c);
            }
        }
        for (const [, c] of uniqueComponents) {
            let label = `- ${c.name} (${c.type})`;
            if (c.properties) label += ` — properties: ${JSON.stringify(c.properties)}`;
            if (c.variantKey) label += ` [variant: ${c.variantKey}]`;
            lines.push(label);
        }
        lines.push("");
    }

    // Interactive Elements
    if (interactiveElements.length > 0) {
        lines.push("### Interactive Elements");
        // Group by type
        const grouped = {};
        for (const el of interactiveElements) {
            if (!grouped[el.elementType]) grouped[el.elementType] = [];
            grouped[el.elementType].push(el);
        }
        for (const [type, elements] of Object.entries(grouped)) {
            lines.push(`- **${type}** (${elements.length}):`);
            for (const el of elements) {
                let label = `  - ${el.name}`;
                if (el.text) label += ` — "${el.text}"`;
                if (el.properties) label += ` [${JSON.stringify(el.properties)}]`;
                lines.push(label);
            }
        }
        lines.push("");
    }

    return lines.join("\n");
};

// --- Main Entry Point ---

/**
 * Enrich a Figma document: fetch nodes, extract context, optionally get images.
 *
 * @param {string} url - Figma URL
 * @param {object} options - { promptId, includeImage, logger }
 * @returns {{ content: string, imageBuffer: Buffer|null, rawData: object, parsedUrl: object }}
 */
const enrichFigmaDocument = async (url, options = {}) => {
    const { promptId = null, includeImage = true, logger = null } = options;

    // 1. Parse URL
    const parsed = parseFigmaUrl(url);
    logger?.step("Figma URL parsed", { fileKey: parsed.fileKey, nodeIds: parsed.nodeIds, title: parsed.title });

    // 2. Fetch node tree
    logger?.step("Fetching Figma node tree");
    const rawData = await fetchFileNodes(parsed.fileKey, parsed.nodeIds);
    logger?.success("Figma node tree fetched", {
        nodeCount: parsed.nodeIds.length || "full file",
    });

    // 3. Save raw JSON for traceability
    if (promptId) {
        try {
            const rawFileName = `figma/fgm_${promptId}.json`;
            FileReader.writeDataFile(rawFileName, rawData);
            logger?.info("Raw Figma JSON saved", { path: `data/${rawFileName}` });
        } catch (err) {
            logger?.warn("Failed to save raw Figma JSON", { error: err.message });
        }
    }

    // 4. Extract context from each node
    const contextBlocks = [];
    const nodes = rawData.nodes || {};

    if (Object.keys(nodes).length > 0) {
        // Response from /files/:key/nodes endpoint — keyed by nodeId
        for (const [nodeId, nodeData] of Object.entries(nodes)) {
            if (!nodeData || !nodeData.document) continue;
            const doc = nodeData.document;
            const frameName = doc.name || parsed.title || "Unnamed Frame";

            const textNodes = extractTextNodes(doc);
            const structure = extractUIStructure(doc);
            const components = extractComponents(doc);
            const interactiveElements = extractInteractiveElements(doc);

            contextBlocks.push(formatContextForAI({
                frameName,
                nodeId,
                textNodes,
                structure,
                components,
                interactiveElements,
            }));

            logger?.step("Frame extracted", {
                frame: frameName,
                nodeId,
                texts: textNodes.length,
                components: components.length,
                interactive: interactiveElements.length,
            });
        }
    } else if (rawData.document) {
        // Response from /files/:key endpoint — full file
        const doc = rawData.document;
        const frameName = doc.name || parsed.title || "Figma File";

        const textNodes = extractTextNodes(doc);
        const structure = extractUIStructure(doc);
        const components = extractComponents(doc);
        const interactiveElements = extractInteractiveElements(doc);

        contextBlocks.push(formatContextForAI({
            frameName,
            nodeId: "root",
            textNodes,
            structure,
            components,
            interactiveElements,
        }));
    }

    const content = [
        "# Figma Design Context",
        "",
        `File: ${parsed.title || parsed.fileKey}`,
        `Frames: ${contextBlocks.length}`,
        "",
        ...contextBlocks,
    ].join("\n");

    logger?.success("Figma context extracted", { chars: content.length, frames: contextBlocks.length });

    // 5. Fetch frame image (optional, for multimodal AI)
    let imageBuffer = null;
    if (includeImage && parsed.nodeIds.length > 0) {
        try {
            logger?.step("Fetching Figma frame image");
            const images = await fetchFrameImages(parsed.fileKey, parsed.nodeIds, { scale: 2, format: "png" });
            const firstImageUrl = Object.values(images).find((v) => v);
            if (firstImageUrl) {
                imageBuffer = await downloadImage(firstImageUrl);
                logger?.success("Frame image downloaded", { bytes: imageBuffer?.length || 0 });
            }
        } catch (err) {
            logger?.warn("Frame image fetch failed (non-fatal)", { error: err.message });
        }
    }

    return { content, imageBuffer, rawData, parsedUrl: parsed };
};

module.exports = {
    isFigmaUrl,
    parseFigmaUrl,
    fetchFileNodes,
    fetchFrameImages,
    enrichFigmaDocument,
    extractTextNodes,
    extractUIStructure,
    extractComponents,
    extractInteractiveElements,
    formatContextForAI,
    FigmaServiceError,
};
