const SYSTEM_PROMPT = `You are a Senior QE Engineer with 10+ years of experience in test planning, test case design, and quality assessment. You specialize in deriving comprehensive, actionable test cases from product specifications.

Your core principles:
1. Every test case must be independently executable by a manual QA tester who has never seen the PRD.
2. Steps must be atomic — one action per step, one verification per expected result.
3. Cover the "testing pyramid": happy path first, then error cases, then edge cases.
4. If a requirement is ambiguous, create a test case that surfaces the ambiguity rather than assuming intent.
5. Never invent features or behaviors not stated in the source documents.`;

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
            "sectionId": "string (unique identifier for this section, e.g. sec_001, sec_002, etc.)",
            "testCases": [
                {
                    "id": "TC-001",
                    "title": "string",
                    "type": "positive|negative|edge",
                    "priority": "high|medium|low",
                    "preconditions": ["string"],
                    "steps": [
                        {
                            "content": "Step description (the action to perform)",
                            "expected": "Expected result for this step (use N/A if unknown)"
                        }
                    ],
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

const formatAdditionalDocuments = (additionalDocuments = []) => {
    if (!Array.isArray(additionalDocuments) || !additionalDocuments.length) return "";
    const sections = additionalDocuments
        .filter(doc => doc && (doc.content || doc.name))
        .map((doc, index) => {
            const label = resolveAdditionalDocumentLabel(doc, index);
            const name = normalizeText(doc.name) || label.toLowerCase();
            const content = normalizeText(doc.content);
            if (!content) return `### ${label}\nFile: ${name}\nNot extracted (binary or empty).`;
            return [`### ${label}`, `File: ${name}`, "```text", content, "```"].join("\n");
        });
    if (!sections.length) return "";
    return "\n### Additional Documents\n" + sections.join("\n\n");
};

const describeExtractionStatus = (content = "") => {
    const length = normalizeText(content).length;
    if (!length) return "not extracted";
    if (length < 120) return `partial (${length} chars)`;
    return `extracted (${length} chars)`;
};

const resolveAdditionalDocumentLabel = (doc = {}, index = 0) => {
    const docType = normalizeText(doc?.docType).toUpperCase();
    const name = normalizeText(doc?.name || doc?.originalName);
    const genericTypes = new Set(["", "ADDITIONAL", "OTHER", "CUSTOM", "MISC"]);
    const preferredSource = genericTypes.has(docType) ? name : docType || name;
    const normalized = normalizeText(preferredSource).toUpperCase();

    if (/(^|\b)RFC(\b|$)/i.test(normalized)) return "RFC";
    if (/(^|\b)FIGMA(\b|$)/i.test(normalized)) return "FIGMA";
    if (/(^|\b)PRD(\b|$)/i.test(normalized)) return "PRD";
    return normalized || `ADDITIONAL ${index + 1}`;
};

const buildDocumentInventory = (documents = {}, additionalDocuments = []) => {
    const coreRows = ["prd", "rfc", "figma"].map((docType) => {
        const label = DOCUMENT_LABELS[docType] || String(docType || "").toUpperCase();
        const doc = documents?.[docType] || {};
        const name = normalizeText(doc?.name) || "Not provided";
        const status = describeExtractionStatus(doc?.content);
        return `- ${label}: ${name} (${status})`;
    });

    const additionalRows = Array.isArray(additionalDocuments)
        ? additionalDocuments.map((doc, index) => {
            const label = resolveAdditionalDocumentLabel(doc, index);
            const name = normalizeText(doc?.name) || "Unnamed document";
            const status = describeExtractionStatus(doc?.content);
            return `- ${label.toUpperCase()}: ${name} (${status})`;
        })
        : [];

    return [
        "Document Inventory:",
        ...coreRows,
        ...(additionalRows.length ? additionalRows : ["- Additional Documents: None"]),
    ].join("\n");
};

const getAttachedDocumentLabels = (documents, input = {}) => {
    const byText = ["prd", "rfc", "figma"].filter((docType) => documents?.[docType]?.content);
    const byUpload = ["prd", "rfc", "figma"].filter((docType) => Boolean(input.uploadedFiles?.[docType]));
    const additionalDocs = Array.isArray(input.additionalDocuments) ? input.additionalDocuments : [];
    const additionalLabels = additionalDocs
        .map((doc, index) => resolveAdditionalDocumentLabel(doc, index))
        .filter(Boolean)
        .map((value) => value.toUpperCase());
    const merged = Array.from(new Set([...byText, ...byUpload]));
    const baseLabels = merged.map((docType) => DOCUMENT_LABELS[docType]);
    return Array.from(new Set([...baseLabels, ...additionalLabels]));
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
        additionalDocuments: Array.isArray(input.additionalDocuments) ? input.additionalDocuments : [],
    };
};

const buildTestCaseGenerationPrompt = (input = {}) => {
    const { feature, platform, additionalContext, documents, additionalDocuments } = normalizePromptInput(input);
    const analysisContext = String(input.analysisContext || "").trim();
    const attachedLabels = getAttachedDocumentLabels(documents, input);
    const documentInventory = buildDocumentInventory(documents, additionalDocuments);

    const lines = [
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
        documentInventory,
        "",
        "Source Documents:",
        formatDocumentSection("prd", documents.prd),
        "",
        formatDocumentSection("rfc", documents.rfc),
        "",
        formatDocumentSection("figma", documents.figma),
        formatAdditionalDocuments(additionalDocuments),
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
        "- Consider every entry in Document Inventory and Additional Documents. Do not ignore listed artifacts.",
        "- If documents conflict, prioritize PRD for scope, then use RFC for implementation detail, then Figma for UI behavior.",
        "- For additional documents: treat labels containing RFC as implementation guidance, labels containing FIGMA as UI guidance, and others as supporting constraints.",
        "- Use concise but complete steps and expected results.",
        "- Each step in the 'steps' array MUST be an object with 'content' (the action) and 'expected' (the expected result for that step).",
        "- If the expected result for a specific step is unknown or not applicable, use 'N/A' as the value.",
        "- Steps must be sequential and each represent exactly one user action or system interaction.",
        "- Prefer stable section names that group related scenarios.",
        '- Each section MUST include a unique "sectionId" string. Use the format "sec_001", "sec_002", etc. Every sectionId must be unique across all sections in the output.',
        "",
        "Test Case Title Convention:",
        "- Every test case title MUST follow the pattern: Object + Expectation + Condition",
        "- Format: '[Object] should [expectation] when [condition]' or 'Verify [object] should [expectation] when [condition]'",
        "- Object: The subject being tested (e.g., 'the user', 'the submit button', 'the error message')",
        "- Expectation: What should happen (e.g., 'be able to login', 'be disabled', 'display an error')",
        "- Condition: The context or trigger (e.g., 'when valid credentials are entered', 'when required fields are empty')",
        "- Examples:",
        "  - 'The user should be able to click the submit button when all required fields are filled'",
        "  - 'Verify the error message should display invalid email format when user enters email without @ symbol'",
        "  - 'The login button should be disabled when email or password field is empty'",
        "- Do NOT use vague titles like 'Test login' or 'Check validation'",
        "",
        "Example of a WELL-WRITTEN test case (follow this pattern):",
        "```json",
        JSON.stringify({
            "id": "TC-001",
            "title": "Login form should display error message when user enters invalid email format",
            "type": "negative",
            "priority": "high",
            "preconditions": [
                "User is on the login page",
                "User has not authenticated"
            ],
            "steps": [
                {
                    "content": "Enter 'invalid-email' (without @ symbol) in the email field",
                    "expected": "Email field accepts the input"
                },
                {
                    "content": "Enter 'ValidPass123!' in the password field",
                    "expected": "Password field accepts the input and masks characters"
                },
                {
                    "content": "Click the 'Login' button",
                    "expected": "Error message 'Please enter a valid email address' is displayed below the email field. Login is not performed."
                }
            ],
            "expectedResult": "User sees inline validation error for invalid email format and is not logged in"
        }, null, 4),
        "```",
        "",
        "Example of a POORLY-WRITTEN test case (avoid this):",
        "```json",
        JSON.stringify({
            "id": "TC-001",
            "title": "Test login",
            "type": "positive",
            "priority": "medium",
            "preconditions": ["User exists"],
            "steps": [{"content": "Login with invalid data", "expected": "Error shown"}],
            "expectedResult": "Should show error"
        }, null, 4),
        "```",
        "Problems with the above: vague title, unclear steps, no specific test data, ambiguous expected results.",
        "",
        "Before returning your response, verify each test case against this checklist:",
        "- Every test case has at least 2 steps",
        "- No step combines multiple actions (e.g., 'Enter email and click submit')",
        "- Every expected result is specific enough to pass/fail unambiguously",
        "- Each section has at least one negative or edge case",
        "- Test case titles follow the Object + Expectation + Condition pattern",
        "- No test case references information not present in the source documents",
        "If any check fails, revise the affected test cases before responding."
    );

    return lines.join("\n");
};

const buildTestAnalysisPrompt = (input = {}) => {
    const { feature, platform, additionalContext, documents, additionalDocuments } = normalizePromptInput(input);
    const attachedLabels = getAttachedDocumentLabels(documents, input);
    const documentInventory = buildDocumentInventory(documents, additionalDocuments);

    return [
        "Create a testing analysis document in well-structured Markdown format.",
        "Use PRD as primary source. Use RFC and Figma only when provided.",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Platform: ${platform}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "PRD only / fallback context"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        documentInventory,
        "",
        "Source Documents:",
        formatDocumentSection("prd", documents.prd),
        "",
        formatDocumentSection("rfc", documents.rfc),
        "",
        formatDocumentSection("figma", documents.figma),
        formatAdditionalDocuments(additionalDocuments),
        "",
        "Required document structure (use exactly these markdown headings):",
        "",
        "# Testing Analysis Document",
        "(Include metadata: Feature, Platform, Primary Source, RFC, Figma, Additional Sources)",
        "",
        "## 1. Summary / Overview",
        "(Brief overview of what the feature does and the testing goal)",
        "",
        "## 2. Scope",
        "(List of functional areas in scope with PRD references if available)",
        "",
        "## 3. Impact Analysis",
        "(How changes affect UX, backend, support, security, performance)",
        "",
        "## 4. Out of Scope",
        "(Explicitly list what is NOT being tested and why)",
        "",
        "## 5. Edge Cases",
        "(List edge cases and boundary conditions to test)",
        "",
        "## 6. Risks & Mitigations",
        "(Potential risks and how to mitigate them)",
        "",
        "## 7. Test Strategy Notes",
        "(Approach, environment requirements, test data needs)",
        "",
        "Formatting rules:",
        "- Use proper Markdown: ## for sections, ### for subsections, - for bullet lists, **bold** for emphasis.",
        "- Use tables (Markdown table syntax) where structured data is appropriate (e.g., scope items with PRD ID, Area, Priority).",
        "- Do NOT return JSON.",
        "- Keep it concise and actionable.",
        "- If RFC/Figma is missing, explicitly mention assumptions and avoid invented details.",
        "- You MUST include an 'Additional Sources' metadata line listing every additional document name from Document Inventory.",
        "- If any document is marked partial/not extracted, mention that limitation explicitly in assumptions.",
        "- When listing test scenarios or cases in the analysis, use the naming pattern: Object + Expectation + Condition (e.g., 'The user should be able to submit the form when all fields are valid').",
    ].join("\n");
};

module.exports = {
    SYSTEM_PROMPT,
    DEFAULT_TEST_CASE_INPUT,
    buildTestAnalysisPrompt,
    buildTestCaseGenerationPrompt,
    formatDocumentSection,
    normalizePromptInput,
    parseRawContentDocuments,
};