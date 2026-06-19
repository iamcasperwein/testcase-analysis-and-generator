"use strict";

const path = require("path");

// --- Load and cache testcontext.json at require-time ---
let _context = null;
const getContext = () => {
    if (!_context) {
        _context = require(path.join(__dirname, "../prompts/references/precond-context.json"));
    }
    return _context;
};

const isFilled = (val) => {
    const s = String(val || "").trim();
    return s.length > 0 && s !== "REPLACE_ME";
};

/**
 * Resolve the product-specific accounts for the selected products.
 * Accounts with empty or REPLACE_ME credentials are skipped — the _default
 * account acts as the fallback and is always appended last.
 *
 * @param {Array<{ domain: string, product: string, label: string }>} products
 * @returns {{ label: string, desc: string, username: string, password: string }[]}
 */
const resolveAccounts = (products = []) => {
    const ctx = getContext();
    const accounts = ctx.accounts || {};
    const result = [];
    const seen = new Set();

    for (const { domain, product, label } of products) {
        if (!domain || !product) continue;
        const domainAccounts = accounts[domain];
        if (!domainAccounts || typeof domainAccounts !== "object") continue;
        const acc = domainAccounts[product];
        if (!acc) continue;
        // Skip accounts with missing or placeholder credentials
        if (!isFilled(acc.username) || !isFilled(acc.password)) continue;
        const key = `${domain}:${product}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
            label: label || product,
            desc: acc.desc || "",
            username: acc.username,
            password: acc.password,
        });
    }

    // Always append _default as fallback — only if credentials are filled
    const def = accounts._default;
    if (def && isFilled(def.username) && isFilled(def.password)) {
        result.push({
            label: "Default account (all other products)",
            desc: def.desc || "",
            username: def.username,
            password: def.password,
        });
    }

    return result;
};

/**
 * Render the non-default locales as a bullet list for the AI.
 */
const renderAlternativeLocales = () => {
    const ctx = getContext();
    const locales = Array.isArray(ctx.locales) ? ctx.locales : [];
    const defaults = ctx.defaults || {};

    return locales
        .filter(l => !(
            l.currency === defaults.currency &&
            l.language === defaults.language
        ))
        .map(l => `  - \`${l.currency} / ${l.language}\` (${l.country})${l.notes ? ` — ${l.notes}` : ""}`)
        .join("\n");
};

/**
 * Build the Test Execution Context Markdown block.
 * This block is always injected into the test case generation prompt.
 *
 * @param {Array<{ domain: string, product: string, label: string }>} products
 * @returns {string}  Markdown block
 */
const buildPromptContext = (products = []) => {
    const ctx = getContext();
    const defaults = ctx.defaults || {};
    const defaultServer = defaults.server || "staging";
    const defaultCurrency = defaults.currency || "IDR";
    const defaultLanguage = defaults.language || "English";

    const alternativeLocales = renderAlternativeLocales();
    const resolvedAccounts = resolveAccounts(products);

    const lines = [
        "## Test Execution Context",
        "",
        "> The following preconditions are MANDATORY on every test case. Apply them in the exact order listed below.",
        "",
        "### 1. Server Environment",
        `- **Default:** \`${defaultServer}\``,
        `- Write as precondition: \`"Server: ${defaultServer}"\``,
        "- Only override to `\"Server: production\"` when the test case or source documents explicitly require production data or production-only behaviour. Treat production as an exception, not the default.",
        "",
        "### 2. Locale",
        `- **Default:** \`${defaultCurrency} / ${defaultLanguage}\``,
        `- Write as precondition: \`"Locale: ${defaultCurrency} / ${defaultLanguage}"\``,
        "- Only override when the test case explicitly targets a different market or language.",
    ];

    if (alternativeLocales) {
        lines.push(
            "- Known alternative locales:",
            alternativeLocales
        );
    }

    lines.push(
        "",
        "### 3. Test Account (login-required test cases only)",
        "- Include credentials ONLY when the test case requires the user to be logged in.",
        "- OMIT entirely for test cases testing non-authenticated or guest states.",
        "- Write as precondition: `\"Account: <username> | Password: <password>\"`",
        "- Use the product-specific account when available; fall back to the default account.",
        ""
    );

    // Render account entries
    for (const acc of resolvedAccounts) {
        lines.push(`#### ${acc.label}`);
        if (acc.desc) lines.push(`- *${acc.desc}*`);
        lines.push(`- Account: \`${acc.username}\` | Password: \`${acc.password}\``);
        lines.push("");
    }

    return lines.join("\n").trimEnd();
};

module.exports = {
    buildPromptContext,
};
