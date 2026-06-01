/**
 * LarkCliService - Fetches document content from Lark/Larksuite URLs using lark-cli.
 *
 * This is the preferred provider (default). Uses shell execution of `lark-cli` commands.
 * Requires lark-cli to be installed globally and authenticated.
 *
 * Supports:
 *   - Lark Docs: https://xxx.larksuite.com/docx/XXXXX or https://xxx.feishu.cn/docx/XXXXX
 *   - Lark Wiki: https://xxx.larksuite.com/wiki/XXXXX or https://xxx.feishu.cn/wiki/XXXXX
 */

const { execFile } = require("child_process");
const { URL_PATTERNS } = require("../constants/api/LarkApi");

// --- Constants ---

const LARK_CLI_BIN = "lark-cli";
const EXEC_TIMEOUT_MS = 60000; // 60s timeout for CLI commands
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB buffer for large docs

// --- Error Class ---

class LarkCliServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "LarkCliServiceError";
        this.code = code;
    }
}

// --- Helpers ---

/**
 * Execute a lark-cli command and return stdout.
 * @param {string[]} args - Command arguments
 * @param {object} [options] - Options
 * @param {number} [options.timeout] - Timeout in ms
 * @returns {Promise<string>} stdout
 */
const execLarkCli = (args, options = {}) => {
    const timeout = options.timeout || EXEC_TIMEOUT_MS;
    const cmdStr = `${LARK_CLI_BIN} ${args.join(" ")}`;
    const startTime = Date.now();
    console.log(`[LarkCli] exec: ${cmdStr}`);

    return new Promise((resolve, reject) => {
        execFile(
            LARK_CLI_BIN,
            args,
            {
                timeout,
                maxBuffer: MAX_BUFFER,
                encoding: "utf8",
                env: { ...process.env },
            },
            (error, stdout, stderr) => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

                if (error) {
                    // Check for timeout/killed process (e.g., blocking device-code poll)
                    if (error.killed || error.signal === "SIGTERM") {
                        console.log(`[LarkCli] timeout (${elapsed}s): process killed (still waiting)`);
                        return reject(new LarkCliServiceError(
                            "CLI_TIMEOUT",
                            `lark-cli timeout: process killed after ${elapsed}s`
                        ));
                    }

                    // Check for exit code 10 (confirmation required) — should not happen for read ops
                    if (error.code === 10) {
                        console.error(`[LarkCli] failed (${elapsed}s): confirmation required`);
                        return reject(new LarkCliServiceError(
                            "CONFIRMATION_REQUIRED",
                            `lark-cli requires confirmation: ${stderr || error.message}`
                        ));
                    }

                    // Parse structured error from stderr or stdout if available
                    let errMsg = error.message;
                    const jsonSource = stderr || stdout;
                    if (jsonSource) {
                        try {
                            const parsed = JSON.parse(jsonSource);
                            if (parsed.error?.message) {
                                errMsg = parsed.error.message;
                            }
                        } catch {
                            errMsg = (stderr || "").trim() || (stdout || "").trim() || error.message;
                        }
                    }

                    console.error(`[LarkCli] failed (${elapsed}s): ${errMsg}`);
                    return reject(new LarkCliServiceError(
                        "CLI_EXEC_FAILED",
                        `lark-cli failed: ${errMsg}`
                    ));
                }

                const preview = (stdout || "").slice(0, 200).replace(/\n/g, " ");
                console.log(`[LarkCli] done (${elapsed}s): ${preview}${stdout && stdout.length > 200 ? "..." : ""}`);
                resolve(stdout);
            }
        );
    });
};

// --- URL Validation ---

/**
 * Validates if a URL is a supported Lark document URL.
 * @param {string} url
 * @returns {boolean}
 */
const isValidLarkUrl = (url = "") => {
    const trimmed = String(url || "").trim();
    return URL_PATTERNS.some((pattern) => pattern.test(trimmed));
};

// --- Document Fetch ---

/**
 * Fetch content from a Lark URL using lark-cli.
 * Routes automatically to docx or wiki based on URL.
 * @param {string} url - The Lark document URL
 * @param {object} [options]
 * @param {string} [options.format] - "raw" or "markdown" (default: "markdown")
 * @returns {Promise<{ content: string, documentId: string, urlType: string, format: string }>}
 */
const fetchContentFromUrl = async (url, options = {}) => {
    const trimmed = String(url || "").trim();

    if (!isValidLarkUrl(trimmed)) {
        throw new LarkCliServiceError("INVALID_URL", `Invalid or unsupported Lark URL: ${url}`);
    }

    // Extract documentId and urlType for the response
    let documentId = "";
    let urlType = "docx";
    for (const pattern of URL_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
            if (match.length >= 3) {
                documentId = match[2];
                urlType = match[1];
            } else {
                documentId = match[1];
            }
            break;
        }
    }

    const format = options.format || "markdown";
    const docFormat = format === "raw" ? "text" : "markdown";

    const args = [
        "docs", "+fetch",
        "--api-version", "v2",
        "--doc", trimmed,
        "--doc-format", docFormat,
        "--scope", "full",
    ];

    try {
        const stdout = await execLarkCli(args);

        // lark-cli docs +fetch outputs the document content directly
        const content = stdout.trim();

        if (!content) {
            throw new LarkCliServiceError("EMPTY_CONTENT", "Document returned empty content.");
        }

        return {
            content,
            documentId,
            urlType,
            format,
        };
    } catch (err) {
        if (err instanceof LarkCliServiceError) throw err;
        throw new LarkCliServiceError(
            "FETCH_FAILED",
            `Failed to fetch Lark document via CLI: ${err.message}`
        );
    }
};

/**
 * Create a new Lark document with the given content.
 * @param {string} title - Document title
 * @param {string} content - Markdown content
 * @param {object} [options]
 * @param {string} [options.folderToken] - Target folder token (optional)
 * @returns {Promise<{ url: string, documentId: string }>}
 */
const createDocument = async (title, content, options = {}) => {
    if (!content || !content.trim()) {
        throw new LarkCliServiceError("EMPTY_CONTENT", "Cannot create document with empty content.");
    }

    // Build XML content with title
    const xmlContent = `<title>${escapeXml(title)}</title>\n${markdownToBasicXml(content)}`;

    const args = [
        "docs", "+create",
        "--api-version", "v2",
        "--content", xmlContent,
        "--json",
    ];

    if (options.folderToken) {
        args.push("--folder", options.folderToken);
    }

    try {
        const stdout = await execLarkCli(args);
        const result = JSON.parse(stdout);

        const docUrl = result.url || result.data?.url || "";
        const docId = result.document_id || result.data?.document_id || "";

        if (!docUrl && !docId) {
            throw new LarkCliServiceError(
                "CREATE_FAILED",
                "Document created but no URL or ID returned."
            );
        }

        return {
            url: docUrl,
            documentId: docId,
        };
    } catch (err) {
        if (err instanceof LarkCliServiceError) throw err;
        throw new LarkCliServiceError(
            "CREATE_FAILED",
            `Failed to create Lark document via CLI: ${err.message}`
        );
    }
};

// --- Utility ---

/**
 * Check if lark-cli is installed and accessible.
 * @returns {Promise<{ installed: boolean, version: string }>}
 */
const checkInstalled = async () => {
    try {
        const stdout = await execLarkCli(["--version"], { timeout: 5000 });
        const version = stdout.trim().replace(/^lark-cli version\s*/i, "");
        return { installed: true, version };
    } catch {
        return { installed: false, version: "" };
    }
};

/**
 * Check lark-cli config status.
 * @returns {Promise<{ configured: boolean, appId: string, hasUsers: boolean }>}
 */
const checkConfig = async () => {
    try {
        const stdout = await execLarkCli(["config", "show"], { timeout: 5000 });
        // stdout is JSON followed by a footer line ("Config file path: ...")
        // Extract the JSON object (greedy match to handle nested objects)
        let config;
        try {
            // Try parsing everything up to the last closing brace
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return { configured: false, appId: "", hasUsers: false };
            config = JSON.parse(jsonMatch[0]);
        } catch {
            return { configured: false, appId: "", hasUsers: false };
        }
        const appId = config.appId || "";
        const hasUsers = config.users && config.users !== "(no logged-in users)";
        return { configured: !!appId, appId, hasUsers: !!hasUsers };
    } catch {
        return { configured: false, appId: "", hasUsers: false };
    }
};

/**
 * Escape XML special characters.
 */
const escapeXml = (str) => {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
};

/**
 * Very basic markdown-to-XML converter for sending to lark-cli docs +create.
 * Handles headings, paragraphs, code blocks, lists, bold, italic.
 * For complex content, lark-cli handles markdown natively when using --doc-format markdown.
 */
const markdownToBasicXml = (md) => {
    // For lark-cli docs +create, we can pass markdown content directly
    // wrapped in a simple paragraph structure. The CLI handles conversion.
    // We'll use a simple approach: wrap in <p> tags per line, handle headings.
    const lines = md.split("\n");
    const xmlLines = [];
    let inCodeBlock = false;
    let codeLines = [];

    for (const line of lines) {
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                xmlLines.push(`<code-block>${escapeXml(codeLines.join("\n"))}</code-block>`);
                codeLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        if (/^#{1,6}\s/.test(line)) {
            const level = line.match(/^(#{1,6})/)[1].length;
            const text = line.replace(/^#{1,6}\s+/, "");
            xmlLines.push(`<h${level}>${escapeXml(text)}</h${level}>`);
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
            xmlLines.push(`<ul><li>${escapeXml(line.slice(2))}</li></ul>`);
        } else if (/^\d+\.\s/.test(line)) {
            const text = line.replace(/^\d+\.\s+/, "");
            xmlLines.push(`<ol><li>${escapeXml(text)}</li></ol>`);
        } else if (line.trim() === "") {
            // skip empty lines
        } else {
            xmlLines.push(`<p>${escapeXml(line)}</p>`);
        }
    }

    if (inCodeBlock && codeLines.length > 0) {
        xmlLines.push(`<code-block>${escapeXml(codeLines.join("\n"))}</code-block>`);
    }

    return xmlLines.join("\n");
};

module.exports = {
    isValidLarkUrl,
    fetchContentFromUrl,
    createDocument,
    checkInstalled,
    checkConfig,
    execLarkCli,
    getLarkCliBin: () => LARK_CLI_BIN,
    LarkCliServiceError,
};
