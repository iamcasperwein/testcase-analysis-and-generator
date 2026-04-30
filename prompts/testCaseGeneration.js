const DEFAULT_TEST_CASE_INPUT = Object.freeze({
    feature: "login/register flow",
    platform: "mobile",
    prdText:
        "The User Experience (UX) and UI flow must prioritize a minimalist, conversion-focused design that guides users through authentication with zero ambiguity. The interface should utilize a progressive disclosure approach—where complex fields are hidden until needed—and provide instant, inline feedback for form validation to prevent error fatigue. For mobile users, the flow must be optimized for thumb-reachability, featuring high-contrast primary action buttons and clearly separated alternative login methods (e.g., social login buttons with recognizable brand logos). Key UI/UX Patterns: Inline Validation: Real-time feedback for password strength and email format directly beneath the input field, Contextual Assistance: Helpful tooltips for password requirements that disappear as conditions are met. Seamless Transitions: Smooth animations between Sign In and Sign Up states to keep the user oriented. Error Recovery: A direct path to the Forgot Password flow from any failed login attempt.",
    additionalContext: "",
    documents: Object.freeze({
        prd: Object.freeze({ name: "", content: "" }),
        rfc: Object.freeze({ name: "", content: "" }),
        figma: Object.freeze({ name: "", content: "" }),
    }),
});

const TEST_CASE_OUTPUT_SCHEMA = `{
    "feature": "string",
    "testCases": [
        {
            "section": "string",
            "testCases": [
                {
                    "id": "TC-001",
                    "title": "string",
                    "type": "positive|negative|edge",
                    "priority": "high|medium|low",
                    "preconditions": ["string"],
                    "steps": ["string"],
                    "expectedResult": "string"
                }
            ]
        }
    ]
}`;

const DOCUMENT_LABELS = {
    prd: "PRD",
    rfc: "RFC",
    figma: "FIGMA",
};

const normalizeText = (value) => String(value || "").trim();

const normalizeDocument = (value, fallbackName = "") => {
    if (typeof value === "string") {
        return {
            name: normalizeText(fallbackName),
            content: normalizeText(value),
        };
    }

    if (!value || typeof value !== "object") {
        return { name: normalizeText(fallbackName), content: "" };
    }

    return {
        name: normalizeText(value.name || fallbackName),
        content: normalizeText(value.content),
    };
};

const parseRawContentDocuments = (rawContent = "") => {
    const content = normalizeText(rawContent);

    if (!content) {
        return {
            documents: {
                prd: { name: "", content: "" },
                rfc: { name: "", content: "" },
                figma: { name: "", content: "" },
            },
            supplementalContext: "",
        };
    }

    const markerRegex = /(?:^|\n\n)(PRD|RFC|FIGMA) FILE \(([^)]+)\):\n/g;
    const matches = [...content.matchAll(markerRegex)];

    if (!matches.length) {
        return {
            documents: {
                prd: { name: "", content: "" },
                rfc: { name: "", content: "" },
                figma: { name: "", content: "" },
            },
            supplementalContext: content,
        };
    }

    const documents = {
        prd: { name: "", content: "" },
        rfc: { name: "", content: "" },
        figma: { name: "", content: "" },
    };
    const supplementalParts = [];
    let cursor = 0;

    matches.forEach((match, index) => {
        const startIndex = match.index ?? 0;
        const blockPrefix = content.slice(cursor, startIndex).trim();

        if (blockPrefix) {
            supplementalParts.push(blockPrefix);
        }

        const docType = String(match[1] || "").toLowerCase();
        const docName = normalizeText(match[2]);
        const bodyStart = startIndex + match[0].length;
        const bodyEnd = index + 1 < matches.length ? (matches[index + 1].index ?? content.length) : content.length;
        const docContent = content.slice(bodyStart, bodyEnd).trim();

        if (documents[docType]) {
            documents[docType] = {
                name: docName,
                content: docContent,
            };
        }

        cursor = bodyEnd;
    });

    const trailingContent = content.slice(cursor).trim();
    if (trailingContent) {
        supplementalParts.push(trailingContent);
    }

    return {
        documents,
        supplementalContext: supplementalParts.join("\n\n").trim(),
    };
};

const mergeDocumentSources = (...sources) => {
    const merged = {
        prd: { name: "", content: "" },
        rfc: { name: "", content: "" },
        figma: { name: "", content: "" },
    };

    sources.forEach((source) => {
        if (!source || typeof source !== "object") {
            return;
        }

        Object.keys(merged).forEach((docType) => {
            const nextDocument = normalizeDocument(source[docType]);
            if (nextDocument.name) {
                merged[docType].name = nextDocument.name;
            }
            if (nextDocument.content) {
                merged[docType].content = nextDocument.content;
            }
        });
    });

    return merged;
};

const formatDocumentSection = (docType, document) => {
    const label = DOCUMENT_LABELS[docType] || String(docType || "").toUpperCase();
    const docName = normalizeText(document?.name) || `${label.toLowerCase()}-document`;
    const docContent = normalizeText(document?.content);

    if (!docContent) {
        return `### ${label}\nNot provided.`;
    }

    return [
        `### ${label}`,
        `File: ${docName}`,
        "```text",
        docContent,
        "```",
    ].join("\n");
};

const getAttachedDocumentLabels = (documents, input = {}) => {
    const byText = ["prd", "rfc", "figma"].filter((docType) => documents?.[docType]?.content);
    const byUpload = ["prd", "rfc", "figma"].filter((docType) => Boolean(input.uploadedFiles?.[docType]));
    const merged = Array.from(new Set([...byText, ...byUpload]));
    return merged.map((docType) => DOCUMENT_LABELS[docType]);
};

const normalizePromptInput = (input = {}) => {
    const parsedRawContent = parseRawContentDocuments(input.rawContent);
    const incomingDocuments = input.documents && typeof input.documents === "object" ? input.documents : {};
    const legacyDocuments = {
        prd: {
            name: normalizeText(input.prdUrl),
            content: normalizeText(input.prdText),
        },
        rfc: {
            name: normalizeText(input.rfcUrl),
            content: "",
        },
        figma: {
            name: normalizeText(input.figmaUrl),
            content: "",
        },
    };

    const documents = mergeDocumentSources(
        DEFAULT_TEST_CASE_INPUT.documents,
        parsedRawContent.documents,
        legacyDocuments,
        incomingDocuments
    );

    const hasUploadedPrdBinary = Boolean(input.uploadMeta?.prdUploaded || input.uploadedFiles?.prd);
    const hasExplicitPrdInput = Boolean(
        normalizeText(input.prdText)
        || normalizeText(input.documents?.prd?.content)
        || normalizeText(parsedRawContent.documents?.prd?.content)
        || normalizeText(input.rawContent)
    );

    if (!documents.prd.content && !hasUploadedPrdBinary && !hasExplicitPrdInput) {
        documents.prd.content = normalizeText(input.prdText || DEFAULT_TEST_CASE_INPUT.prdText);
    }

    return {
        feature: normalizeText(input.feature || DEFAULT_TEST_CASE_INPUT.feature),
        platform: normalizeText(input.platform || DEFAULT_TEST_CASE_INPUT.platform),
        prdText: documents.prd.content,
        additionalContext: [
            normalizeText(input.additionalContext || DEFAULT_TEST_CASE_INPUT.additionalContext),
            normalizeText(input.context),
            parsedRawContent.supplementalContext,
        ].filter(Boolean).join("\n\n"),
        documents,
    };
};

const buildTestCaseGenerationPrompt = (input = {}) => {
    const { feature, platform, additionalContext, documents } = normalizePromptInput(input);
    const analysisContext = String(input.analysisContext || "").trim();
    const attachedLabels = getAttachedDocumentLabels(documents, input);

    const lines = [
        "You are a Senior QE Engineer.",
        "Generate test cases for a mobile or web application in valid JSON only.",
        "Use the PRD as the primary source of truth. Use RFC and Figma content when provided to refine workflows, business rules, UI states, and edge cases.",
        "Group related cases into sections and keep each test case precise, executable, and review-friendly.",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Platform: ${platform}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "PRD only / fallback context"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        "",
        "Source Documents:",
        formatDocumentSection("prd", documents.prd),
        "",
        formatDocumentSection("rfc", documents.rfc),
        "",
        formatDocumentSection("figma", documents.figma),
    ];

    if (analysisContext) {
        lines.push(
            "",
            "### Testing Analysis",
            "The following analysis was pre-generated from the same source documents.",
            "Use it as context to ensure test cases align with the identified scope, edge cases, and risks.",
            "```text",
            analysisContext,
            "```"
        );
    }

    lines.push(
        "",
        "Output JSON schema:",
        TEST_CASE_OUTPUT_SCHEMA,
        "",
        "Rules:",
        "- Return valid JSON only.",
        '- Each section must contain a "testCases" array.',
        "- Derive test case sections from the Testing Analysis scope and edge cases when available.",
        "- If RFC or Figma is missing, do not invent those details.",
        "- If documents conflict, prioritize PRD for scope, then use RFC for implementation detail, then Figma for UI behavior.",
        "- Use concise but complete steps and expected results.",
        "- Prefer stable section names that group related scenarios."
    );

    return lines.join("\n");
};

const buildTestAnalysisPrompt = (input = {}) => {
    const { feature, platform, additionalContext, documents } = normalizePromptInput(input);
    const attachedLabels = getAttachedDocumentLabels(documents, input);

    return [
        "You are a Senior QE Engineer.",
        "Create a testing analysis document in plain text/markdown (not JSON).",
        "Use PRD as primary source. Use RFC and Figma only when provided.",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Platform: ${platform}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "PRD only / fallback context"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        "",
        "Source Documents:",
        formatDocumentSection("prd", documents.prd),
        "",
        formatDocumentSection("rfc", documents.rfc),
        "",
        formatDocumentSection("figma", documents.figma),
        "",
        "Required sections:",
        "1. Summary/Overview",
        "2. Scope",
        "3. Impact Analysis",
        "4. Out of Scope",
        "5. Edge Cases",
        "6. Risks & Mitigations",
        "7. Test Strategy Notes",
        "",
        "Rules:",
        "- Do not return JSON.",
        "- Keep it concise and actionable.",
        "- If RFC/Figma is missing, explicitly mention assumptions and avoid invented details.",
    ].join("\n");
};

module.exports = {
    DEFAULT_TEST_CASE_INPUT,
    buildTestAnalysisPrompt,
    buildTestCaseGenerationPrompt,
    formatDocumentSection,
    normalizePromptInput,
    parseRawContentDocuments,
};