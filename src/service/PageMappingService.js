"use strict";

const path = require("path");

// --- Load and cache pagesmapping.json at require-time ---
let _mapping = null;
const getMapping = () => {
    if (!_mapping) {
        _mapping = require(path.join(__dirname, "../prompts/references/pagesmapping.json"));
    }
    return _mapping;
};

// Keys to always skip (authoring templates, not real pages)
const SKIP_KEYS = new Set(["domain_template", "product_template"]);

/**
 * Compute intersection of two arrays (case-insensitive platform names).
 */
const platformIntersect = (pagePlatforms = [], userPlatforms = []) => {
    const userSet = new Set(userPlatforms.map(p => String(p).toLowerCase()));
    return pagePlatforms.filter(p => userSet.has(String(p).toLowerCase()));
};

/**
 * Render a human-readable platform label from a list of platforms.
 * e.g. ["android", "ios"] → "Android / iOS"
 */
const platformLabel = (platforms = []) =>
    platforms.map(p => {
        const map = {
            "android": "Android",
            "ios": "iOS",
            "mobile-web": "Mobile Web",
            "desktop-web": "Desktop Web",
            "backend": "Backend",
        };
        return map[String(p).toLowerCase()] || p;
    }).join(" / ");

/**
 * Render a single page entry as Markdown lines.
 * Returns null if no platform entries match.
 */
const renderPageEntry = (page, userPlatforms) => {
    const lines = [];

    // --- mobile_app row ---
    const mobileMatch = platformIntersect(page.mobile_app?.platforms || [], userPlatforms);
    const mobileValue = String(page.mobile_app?.value || "").trim();
    const hasMobile = mobileMatch.length > 0 && mobileValue;

    // --- web row ---
    const webMatch = platformIntersect(page.web?.platforms || [], userPlatforms);
    const webValue = String(page.web?.value || "").trim();
    const hasWeb = webMatch.length > 0 && webValue;

    // Skip page entirely if nothing matches
    if (!hasMobile && !hasWeb) return null;

    lines.push(`#### ${page.pageName}`);

    if (hasMobile) {
        lines.push(`- **${platformLabel(mobileMatch)} Deeplink:** \`${mobileValue}\``);
    }
    if (hasWeb) {
        lines.push(`- **${platformLabel(webMatch)} URL Path:** \`${webValue}\``);
    }

    lines.push(`- **Login Required:** ${page.loginRequired ? "Yes" : "No"}`);

    if (Array.isArray(page.aliases) && page.aliases.length > 0) {
        lines.push(`- **Also known as:** ${page.aliases.join(", ")}`);
    }

    if (Array.isArray(page.notes) && page.notes.filter(Boolean).length > 0) {
        page.notes.filter(Boolean).forEach(note => {
            lines.push(`- **Note:** ${note}`);
        });
    }

    return lines.join("\n");
};

/**
 * Build a Markdown page reference context block filtered by products and platforms.
 *
 * @param {Array<{ domain: string, product: string, label: string }>} products
 * @param {string[]} platforms  e.g. ["android", "ios", "mobile-web"]
 * @returns {string}  Markdown block, or "" if nothing to inject
 */
const buildPromptContext = (products = [], platforms = []) => {
    if (!Array.isArray(products) || products.length === 0) return "";
    if (!Array.isArray(platforms) || platforms.length === 0) return "";

    const mapping = getMapping();
    const productSections = [];

    for (const { domain, product, label } of products) {
        if (!domain || !product) continue;
        if (SKIP_KEYS.has(domain) || SKIP_KEYS.has(product)) continue;

        const domainData = mapping[domain];
        if (!domainData || typeof domainData !== "object") continue;

        const productData = domainData[product];
        if (!productData || !Array.isArray(productData.pages)) continue;

        const pageEntries = productData.pages
            .map(page => renderPageEntry(page, platforms))
            .filter(Boolean);

        if (pageEntries.length === 0) continue;

        const desc = productData.desc ? ` — ${productData.desc}` : "";
        const header = `### ${label || product}${desc}`;
        productSections.push([header, ...pageEntries].join("\n\n"));
    }

    if (productSections.length === 0) return "";

    return [
        "## Page & Navigation Reference",
        "",
        "> Use the entries below when writing navigation-state **preconditions** AND entry-point / navigation **steps**.",
        "> Append the matching deeplink or URL in parentheses — `(deeplink: <value>)` for mobile app, `(url: <value>)` for web.",
        "> Do NOT invent values — only use what is listed here.",
        "",
        productSections.join("\n\n---\n\n"),
    ].join("\n");
};

module.exports = {
    buildPromptContext,
};
