const { DOC_TYPES, DOC_TYPE_MAP, resolveDocType, getDocTypePriority, sortByPriority } = require("../constants/docTypes");

const SYSTEM_PROMPT = `You are a Senior QE Engineer with 10+ years of experience in test planning, test case design, and quality assessment. You specialize in deriving comprehensive, actionable test cases from product specifications.

Your core principles:
1. Every test case must be independently executable by a manual QA tester who has never seen the PRD.
2. Steps must be atomic — one action per step, one verification per expected result.
3. Cover the "testing pyramid": happy path first, then error cases, then edge cases.
4. If a requirement is ambiguous, create a test case that surfaces the ambiguity rather than assuming intent.
5. Never invent features or behaviors not stated in the source documents.`;

const DEFAULT_PLATFORMS = Object.freeze(["ios", "android", "mobile-web", "desktop-web"]);

const VALID_PLATFORMS = ["ios", "android", "mobile-web", "desktop-web", "backend"];

const TEST_CASE_OUTPUT_SCHEMA = `{
    "feature": "string",
    "testCases": [
        {
            "section": "string",
            "testCases": [
                {
                    "id": "TC-001",
                    "title": "string",
                    "platforms": ["ios", "android", "mobile-web", "desktop-web", "backend"],
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

const PRIORITY_LABELS = {
    primary: "PRIMARY — source of truth",
    high: "HIGH — implementation/design detail",
    medium: "MEDIUM — supporting context",
    low: "LOW — supplemental reference",
};

const normalizeText = (value) => String(value || "").trim();

const normalizePlatforms = (value) => {
    if (typeof value === "string") {
        const parsed = value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const valid = parsed.filter(p => VALID_PLATFORMS.includes(p));
        return valid.length > 0 ? valid : [...DEFAULT_PLATFORMS];
    }
    if (Array.isArray(value) && value.length > 0) {
        const valid = value.map(s => String(s || "").trim().toLowerCase()).filter(p => VALID_PLATFORMS.includes(p));
        return valid.length > 0 ? valid : [...DEFAULT_PLATFORMS];
    }
    return [...DEFAULT_PLATFORMS];
};

// --- Document formatting (unified) ---

const describeExtractionStatus = (content = "") => {
    const length = normalizeText(content).length;
    if (!length) return "not extracted";
    if (length < 120) return `partial (${length} chars)`;
    return `extracted (${length} chars)`;
};

/**
 * Build Document Inventory section for the prompt.
 * Lists all documents with their type, priority, and extraction status.
 */
const buildDocumentInventory = (documents = []) => {
    if (!documents.length) return "Document Inventory:\n- No documents provided.";

    const rows = sortByPriority(documents).map((doc) => {
        const dtDef = DOC_TYPE_MAP[doc.docType] || { label: doc.docType, priority: "low" };
        const name = normalizeText(doc.name) || "Unnamed";
        const status = describeExtractionStatus(doc.content);
        const priority = PRIORITY_LABELS[dtDef.priority] || dtDef.priority;
        return `- [${doc.docType}] ${name} — priority: ${priority} (${status})`;
    });

    return ["Document Inventory:", ...rows].join("\n");
};

/**
 * Format a single document section for the prompt.
 */
const formatDocumentSection = (doc) => {
    const dtDef = DOC_TYPE_MAP[doc.docType] || { label: doc.docType };
    const label = dtDef.label || doc.docType;
    const name = normalizeText(doc.name) || "Unnamed";
    const content = normalizeText(doc.content);

    if (!content) {
        return `### ${label}: ${name}\nNot extracted (binary or empty). If this is an attached file, use the file attachment for context.`;
    }

    return [
        `### ${label}: ${name}`,
        "```text",
        content,
        "```",
    ].join("\n");
};

/**
 * Format all documents for prompt inclusion, sorted by priority.
 */
const formatAllDocuments = (documents = []) => {
    const sorted = sortByPriority(documents);
    if (!sorted.length) return "No documents provided.";
    return sorted.map(formatDocumentSection).join("\n\n");
};

/**
 * Get labels of all attached documents.
 */
const getAttachedDocumentLabels = (documents = []) => {
    return documents.map((doc) => {
        const dtDef = DOC_TYPE_MAP[doc.docType] || {};
        return dtDef.label || doc.docType;
    });
};

// --- Prompt input normalization ---

const normalizePromptInput = (input = {}) => {
    const documents = Array.isArray(input.documents) ? input.documents : [];

    // If no documents but prdText is provided (legacy/fallback), create a synthetic PRD doc
    if (!documents.length && normalizeText(input.prdText)) {
        documents.push({
            docType: "PRD",
            name: "inline-prd",
            content: normalizeText(input.prdText),
            path: "",
        });
    }

    return {
        feature: normalizeText(input.feature),
        platform: normalizeText(input.platform),
        platforms: normalizePlatforms(input.platforms),
        additionalContext: [
            normalizeText(input.additionalContext),
            normalizeText(input.context),
        ].filter(Boolean).join("\n\n"),
        documents,
    };
};

// --- Prompt builders ---

const buildPriorityGuidance = () => [
    "Document Priority Rules:",
    "- PRIMARY documents (PRD) are the source of truth. Derive all test scope from them.",
    "- HIGH priority documents (RFC, Figma, API Contract) provide implementation detail, design specs, and API behavior.",
    "- MEDIUM priority documents (Architecture, Test Plan, User Story) provide supporting context and constraints.",
    "- LOW priority documents (Release Notes, Other) are supplemental references — consider but do not rely on them for scope.",
    "- If documents conflict, follow this priority order: PRIMARY > HIGH > MEDIUM > LOW.",
].join("\n");

const buildTestCaseGenerationPrompt = (input = {}) => {
    const { feature, platforms, additionalContext, documents } = normalizePromptInput(input);
    const analysisContext = String(input.analysisContext || "").trim();
    const attachedLabels = getAttachedDocumentLabels(documents);
    const documentInventory = buildDocumentInventory(documents);
    const platformList = platforms.join(", ");

    const lines = [
        "Generate test cases for an application in valid JSON only.",
        "Use the PRIMARY document (PRD) as the source of truth. Use HIGH/MEDIUM/LOW priority documents to refine workflows, business rules, UI states, and edge cases.",
        "Group related cases into sections and keep each test case precise, executable, and review-friendly.",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Target Platforms: ${platformList}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "None"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        documentInventory,
        "",
        buildPriorityGuidance(),
        "",
        "Source Documents:",
        formatAllDocuments(documents),
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
        "- If a document is missing, do not invent those details.",
        "- Consider every document in the Document Inventory. Do not ignore listed artifacts.",
        "- Use concise but complete steps and expected results.",
        "- Each step in the 'steps' array MUST be an object with 'content' (the action) and 'expected' (the expected result for that step).",
        "- If the expected result for a specific step is unknown or not applicable, use 'N/A' as the value.",
        "- Steps must be sequential and each represent exactly one user action or system interaction.",
        "- Prefer stable section names that group related scenarios.",
        "- Do NOT include a sectionId field in the output. The system will assign unique section identifiers automatically.",
        "",
        "Platform Tagging Rules:",
        `- The target platforms for this feature are: ${platformList}.`,
        '- Each test case MUST include a "platforms" array listing which of the target platforms it applies to.',
        `- ONLY use platforms from the target list: ${platformList}. Do NOT include platforms outside this list.`,
        "- A test case may apply to multiple platforms if the behavior is identical across them (e.g., a UI button that exists on all frontends).",
        "- Consider platform-specific differences in behavior and implementation:",
        "  - iOS and Android may have different native controls, gestures, permissions, and lifecycle behaviors.",
        "  - mobile-web and desktop-web share web technologies but differ in viewport, touch vs. mouse, responsive layouts, and browser APIs.",
        "  - backend test cases cover API contracts, authentication flows, data validation, and server-side logic — they have no UI.",
        "- If a test case only applies to specific platforms (e.g., biometric login for iOS/Android only, keyboard shortcuts for desktop-web only), tag it with only those platforms.",
        "- Do NOT include a platform in the platforms array if the test case does not apply to it.",
        `- Only use these platform values in the "platforms" array: ${platformList}. Any other values will be rejected.`,
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
            "platforms": ["ios", "android", "mobile-web", "desktop-web"],
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
            "platforms": [],
            "type": "positive",
            "priority": "medium",
            "preconditions": ["User exists"],
            "steps": [{"content": "Login with invalid data", "expected": "Error shown"}],
            "expectedResult": "Should show error"
        }, null, 4),
        "```",
        "Problems with the above: vague title, missing platforms, unclear steps, no specific test data, ambiguous expected results.",
        "",
        "Before returning your response, verify each test case against this checklist:",
        "- Every test case has at least 2 steps",
        "- No step combines multiple actions (e.g., 'Enter email and click submit')",
        "- Every expected result is specific enough to pass/fail unambiguously",
        "- Each section has at least one negative or edge case",
        "- Test case titles follow the Object + Expectation + Condition pattern",
        "- No test case references information not present in the source documents",
        "- Every test case has a non-empty platforms array containing only valid target platforms",
        "- Platform-specific behaviors (e.g., biometrics, keyboard shortcuts, native gestures) are tagged to the correct platforms only",
        "If any check fails, revise the affected test cases before responding."
    );

    return lines.join("\n");
};

const buildTestAnalysisPrompt = (input = {}) => {
    const { feature, platforms, additionalContext, documents } = normalizePromptInput(input);
    const attachedLabels = getAttachedDocumentLabels(documents);
    const documentInventory = buildDocumentInventory(documents);
    const platformList = platforms.join(", ");

    return [
        "Create a testing analysis document in well-structured Markdown format.",
        "Use the PRIMARY document (PRD) as the source of truth. Use HIGH/MEDIUM/LOW priority documents only when provided.",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Target Platforms: ${platformList}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "None"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        documentInventory,
        "",
        buildPriorityGuidance(),
        "",
        "Source Documents:",
        formatAllDocuments(documents),
        "",
        "Required document structure (use exactly these markdown headings):",
        "",
        "# Testing Analysis Document",
        "(Include metadata: Feature, Target Platforms, Documents Used with their priority levels)",
        "",
        "## 1. Summary / Overview",
        "(Brief overview of what the feature does and the testing goal)",
        "",
        "## 2. Scope",
        "(List of functional areas in scope with document references if available)",
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
        "- Use tables (Markdown table syntax) where structured data is appropriate (e.g., scope items with Document Source, Area, Priority).",
        "- Do NOT return JSON.",
        "- Keep it concise and actionable.",
        "- If a document is missing or has empty content, explicitly mention assumptions.",
        "- When listing test scenarios or cases in the analysis, use the naming pattern: Object + Expectation + Condition (e.g., 'The user should be able to submit the form when all fields are valid').",
    ].join("\n");
};

module.exports = {
    SYSTEM_PROMPT,
    VALID_PLATFORMS,
    DEFAULT_PLATFORMS,
    buildTestAnalysisPrompt,
    buildTestCaseGenerationPrompt,
    formatDocumentSection,
    normalizePromptInput,
    normalizePlatforms,
};
