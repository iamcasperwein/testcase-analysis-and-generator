const { DOC_TYPES, DOC_TYPE_MAP, resolveDocType } = require("../constants/docTypes");
const {
    buildRiskRulesGuidance,
    buildDepthRulesGuidance,
    buildAutomationRulesGuidance,
    buildCompletenessRulesGuidance,
    buildConfidenceGuidance,
} = require("./strategyRules");

const SYSTEM_PROMPT = `You are a Senior QE Engineer with 10+ years of experience in test planning, test case design, and quality assessment. You specialize in deriving comprehensive, actionable test cases from product specifications.

Your core principles:
1. Every test case must be independently executable by a manual QA tester who has never seen the PRD.
2. Steps must be atomic — one action per step, one verification per expected result.
3. Cover the "testing pyramid": happy path first, then error cases, then edge cases.
4. If a requirement is ambiguous, create a test case that surfaces the ambiguity rather than assuming intent.
5. Never invent features or behaviors not stated in the source documents.`;

const DEFAULT_PLATFORMS = Object.freeze(["ios", "android", "mobile-web", "desktop-web", "backend"]);

const VALID_PLATFORMS = ["ios", "android", "mobile-web", "desktop-web", "backend"];

const TEST_CASE_OUTPUT_SCHEMA = `{
    "feature": "string",
    "assumptions": ["string — assumptions made due to missing or ambiguous info"],
    "documentConflicts": ["string — mismatches or contradictions found between documents"],
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
 * Lists all documents with their type and extraction status.
 */
const buildDocumentInventory = (documents = []) => {
    if (!documents.length) return "Document Inventory:\n- No documents provided.";

    const rows = documents.map((doc) => {
        const dtDef = DOC_TYPE_MAP[doc.docType] || { label: doc.docType };
        const name = normalizeText(doc.name) || "Unnamed";
        const status = describeExtractionStatus(doc.content);
        return `- [${doc.docType}] ${name} (${status})`;
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
 * Format all documents for prompt inclusion.
 */
const formatAllDocuments = (documents = []) => {
    if (!documents.length) return "No documents provided.";
    return documents.map(formatDocumentSection).join("\n\n");
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

const buildDocumentGuidance = () => [
    "Document Usage Rules:",
    "- All provided documents have EQUAL weight. Cross-reference all documents to build a complete picture.",
    "- If documents contain conflicting or mismatched requirements, explicitly flag each conflict in a dedicated section.",
    "- If information is missing or ambiguous, state your assumptions clearly rather than guessing silently.",
    "",
    "Figma Design Document Guidance (when provided):",
    "- Figma documents contain extracted UI structure, text content, component hierarchy, and interactive elements from design mockups.",
    "- Use Figma context to derive ADDITIONAL test cases that other documents may not cover, including:",
    "  • UI layout and visual consistency tests (element positioning, alignment, responsive behavior)",
    "  • Interactive element behavior (buttons, inputs, toggles, dropdowns — states: default, hover, active, disabled, error)",
    "  • Navigation flows and screen transitions visible in the design",
    "  • Text content accuracy (labels, placeholders, error messages, tooltips matching design)",
    "  • Component state variations (empty states, loading states, error states shown in frames)",
    "  • Accessibility considerations derived from the UI structure (contrast, touch targets, focus order)",
    "  • Edge cases visible in design but not mentioned in other docs (e.g., truncation, overflow, empty lists)",
    "- Cross-reference other documents with Figma screens to identify gaps: requirements without corresponding UI, or UI elements without documented requirements.",
    "- If Figma shows multiple frames/screens, generate test cases covering the flow between them.",
].join("\n");

const buildTestCaseGenerationPrompt = (input = {}) => {
    const { feature, platforms, additionalContext, documents } = normalizePromptInput(input);
    const analysisContext = String(input.analysisContext || "").trim();
    const attachedLabels = getAttachedDocumentLabels(documents);
    const documentInventory = buildDocumentInventory(documents);
    const platformList = platforms.join(", ");

    const lines = [
        "Generate test cases for an application in valid JSON only.",
        "Cross-reference ALL provided documents equally to derive comprehensive test cases. Flag any conflicts or mismatches between documents.",
        "State any assumptions you make explicitly in the output.",
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
        buildDocumentGuidance(),
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
        '- The "assumptions" array must list any assumptions made due to missing, incomplete, or ambiguous information. Use an empty array if none.',
        '- The "documentConflicts" array must list any contradictions or mismatches found between the provided documents. Use an empty array if none.',
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
        "Cross-reference ALL provided documents equally. Flag any conflicts or mismatches between documents.",
        "When a Figma design document is provided, explicitly analyze UI elements, interaction patterns, screen states, and visual flows in addition to functional requirements.",
        "State any assumptions you make clearly.",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Target Platforms: ${platformList}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "None"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        documentInventory,
        "",
        buildDocumentGuidance(),
        "",
        "Source Documents:",
        formatAllDocuments(documents),
        "",
        "Required document structure (use exactly these markdown headings):",
        "",
        "# Testing Analysis Document",
        "(Include metadata: Feature, Target Platforms, Documents Used)",
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
        "## 8. Assumptions",
        "(List all assumptions made due to missing, incomplete, or ambiguous information across documents)",
        "",
        "## 9. Document Conflicts & Mismatches",
        "(Flag any contradictions or mismatches found between the provided documents. For each conflict, cite both sources and note which interpretation was used for testing.)",
        "",
        "## 10. Document Assessment",
        "(For EACH provided document, include:",
        "  - Document name/type",
        "  - What the document covers (brief summary of its content and purpose)",
        "  - Key information extracted that is relevant for testing",
        "  - Clarity rating: Clear / Partially Clear / Unclear",
        "  - Gaps or missing information that would improve test coverage",
        "  - If the document is insufficient for deriving test cases, explain what is lacking)",
        "",
        "## 11. UI/Design Analysis (include only if Figma or design documents are provided)",
        "(UI components identified, interaction patterns, screen states, visual flows, design-requirement gaps)",
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

const STRATEGY_SYSTEM_PROMPT = `You are a Senior QE Strategist with 10+ years of experience in test strategy, risk assessment, and quality planning. You specialize in determining what to test, at what depth, and with what approach — based on product specifications and risk analysis.

Your core principles:
1. Minimum sufficient coverage — determine the minimum testing needed to manage risk, not maximize testing.
2. Risk vs maturity distinction — always distinguish feature risk (severity of failure) from requirement maturity (completeness of spec).
3. Explicit uncertainty — never assume missing information. Surface gaps explicitly.
4. Evidence-backed reasoning — every decision MUST cite evidence from the source documents.
5. Document equality — all provided documents have EQUAL weight. Cross-reference all to build a complete picture.
6. Change-driven — every analysis is triggered by a specific change. There is no "general" analysis.
7. Domain-aware risk — apply domain-specific reasoning per the risk taxonomy.
8. Conservative defaults — when uncertain: higher risk, deeper depth, more manual.`;

const TEST_STRATEGY_OUTPUT_SCHEMA = `{
    "task_id": "string — unique identifier (format: strategy_<feature_slug>)",
    "platforms": ["string — target platforms from input"],
    "feature_risk_level": "high | medium | low",
    "requirement_maturity": "high | medium | low",
    "risk_areas": [
        { "area": "string — risk area name", "level": "high | elevated | medium | low", "reason": "string — why this risk level" }
    ],
    "test_scope": {
        "functional": [
            {
                "id": "string — e.g. func_001",
                "description": "string — what this scope item covers",
                "disposition": "reuse | update | new | retire | regression_keep",
                "change_relation": "string — how this item relates to the change trigger",
                "existing_case_refs": ["string — IDs of matched existing cases, or empty array"],
                "match_basis": "trace_link | tag | semantic | none",
                "match_confidence": "high | medium | low | none",
                "reason": "string — why this disposition was assigned"
            }
        ],
        "edge_cases": [
            { "id": "string — e.g. edge_001", "description": "string", "disposition": "reuse | update | new | retire | regression_keep", "change_relation": "string", "existing_case_refs": [], "match_basis": "trace_link | tag | semantic | none", "match_confidence": "high | medium | low | none", "reason": "string" }
        ],
        "integration": [
            { "id": "string — e.g. intg_001", "description": "string", "disposition": "reuse | update | new | retire | regression_keep", "change_relation": "string", "existing_case_refs": [], "match_basis": "trace_link | tag | semantic | none", "match_confidence": "high | medium | low | none", "reason": "string" }
        ],
        "non_functional": [
            { "id": "string — e.g. nf_001", "description": "string", "disposition": "reuse | update | new | retire | regression_keep", "change_relation": "string", "existing_case_refs": [], "match_basis": "trace_link | tag | semantic | none", "match_confidence": "high | medium | low | none", "reason": "string" }
        ]
    },
    "test_depth": {
        "functional": "deep | medium | shallow",
        "edge_cases": "deep | medium | shallow",
        "integration": "deep | medium | shallow",
        "non_functional": "deep | medium | shallow"
    },
    "test_mode": [
        { "area": "string — scope area name", "mode": "automation-first | manual-first | hybrid", "reason": "string — why this mode" }
    ],
    "existing_coverage_summary": { "reuse": "number", "update": "number", "new": "number", "retire": "number", "coverage_gap": ["string — identified gaps"] },
    "asset_hygiene_report": { "trace_link_pct": "number 0.0-1.0", "tag_pct": "number 0.0-1.0", "semantic_pct": "number 0.0-1.0" },
    "requirement_gaps": [
        { "gap": "string — what is missing", "impact": "string — how it affects testing", "ask": "string — who to clarify with" }
    ],
    "not_assessable": [
        { "item": "string — what cannot be evaluated", "reason": "string — why" }
    ],
    "confidence": "number 0.0-1.0 — overall confidence score",
    "confidence_breakdown": {
        "requirement_completeness": "number 0.0-1.0",
        "clarity": "number 0.0-1.0",
        "uncertainty": "number 0.0-1.0",
        "risk_identifiability": "number 0.0-1.0"
    },
    "coverage_assessment_confidence": "number 0.0-1.0 or null if no existing assets",
    "workflow_mode": "blocked | strategy_only | controlled | full",
    "test_strategy_summary": "string — human-readable strategy summary with rationale"
}`;

const TEST_STRATEGY_FEW_SHOT = `
--- FEW-SHOT EXAMPLE (Greenfield Feature — No Existing Assets) ---

Scenario: New user notification preferences feature — first-time build, no existing test coverage.

{
  "task_id": "strategy_notif_prefs_001",
  "platforms": ["iOS", "Android", "Desktop-Web"],
  "feature_risk_level": "medium",
  "requirement_maturity": "high",
  "risk_areas": [
    { "area": "User preference persistence", "level": "medium", "reason": "Data persistence — user settings must survive across sessions" },
    { "area": "Cross-platform consistency", "level": "medium", "reason": "Preferences set on one platform must reflect on all" }
  ],
  "test_scope": {
    "functional": [
      { "id": "func_001", "description": "User can toggle individual notification channels (email, push, SMS)", "disposition": "new", "change_relation": "Greenfield feature", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage" }
    ],
    "edge_cases": [
      { "id": "edge_001", "description": "User disables all notification channels simultaneously", "disposition": "new", "change_relation": "Boundary condition", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage" }
    ],
    "integration": [
      { "id": "intg_001", "description": "Preference changes propagate to notification delivery service", "disposition": "new", "change_relation": "New integration point", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage" }
    ],
    "non_functional": [
      { "id": "nf_001", "description": "Preference page load time within SLA", "disposition": "new", "change_relation": "New page", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage" }
    ]
  },
  "test_depth": { "functional": "medium", "edge_cases": "medium", "integration": "medium", "non_functional": "shallow" },
  "test_mode": [
    { "area": "Preference API CRUD", "mode": "automation-first", "reason": "Deterministic backend, high regression value" },
    { "area": "Preference UI toggles", "mode": "automation-first", "reason": "Stable UI, repeatable interactions" }
  ],
  "existing_coverage_summary": null,
  "asset_hygiene_report": null,
  "requirement_gaps": [],
  "not_assessable": [],
  "confidence": 0.85,
  "confidence_breakdown": { "requirement_completeness": 0.9, "clarity": 0.85, "uncertainty": 0.15, "risk_identifiability": 0.9 },
  "coverage_assessment_confidence": null,
  "workflow_mode": "full",
  "test_strategy_summary": "Medium-risk greenfield feature with clear requirements. All scope items are new (no existing assets). High confidence (0.85) — requirements are well-specified with acceptance criteria. Recommend proceeding directly to test case generation."
}`;

const buildTestStrategyPrompt = (input = {}) => {
    const { feature, platforms, additionalContext, documents } = normalizePromptInput(input);
    const attachedLabels = getAttachedDocumentLabels(documents);
    const documentInventory = buildDocumentInventory(documents);
    const platformList = platforms.join(", ");

    const lines = [
        "Generate a structured test strategy in valid JSON only.",
        "Cross-reference ALL provided documents equally to derive a comprehensive testing strategy.",
        "The strategy must determine: what to test, at what depth, and with what approach (automation vs manual).",
        "",
        "Product Context:",
        `- Feature: ${feature}`,
        `- Target Platforms: ${platformList}`,
        `- Additional Context: ${additionalContext || "N/A"}`,
        `- Attached Documents: ${attachedLabels.join(", ") || "None"}`,
        "- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.",
        documentInventory,
        "",
        buildDocumentGuidance(),
        "",
        "Source Documents:",
        formatAllDocuments(documents),
        "",
        "--- STRATEGY RULES ---",
        "",
        buildRiskRulesGuidance(),
        "",
        buildDepthRulesGuidance(),
        "",
        buildAutomationRulesGuidance(),
        "",
        buildCompletenessRulesGuidance(),
        "",
        buildConfidenceGuidance(),
        "",
        "--- OUTPUT CONTRACT ---",
        "",
        "Output JSON schema (return ONLY this structure, no other text):",
        TEST_STRATEGY_OUTPUT_SCHEMA,
        "",
        TEST_STRATEGY_FEW_SHOT,
        "",
        "Rules:",
        "- Return valid JSON only. No markdown, no commentary, no wrapping.",
        "- Every field in the schema MUST be present in the output.",
        "- `platforms` MUST echo the target platforms provided in the input.",
        "- Each scope item MUST have a unique `id` within its category (use prefixes: func_, edge_, intg_, nf_).",
        "- Each `test_mode` entry MUST map to a scope area identified in `test_scope`.",
        "- The `test_strategy_summary` MUST be a concise human-readable paragraph explaining the overall strategy.",
        "- Do NOT invent features or behaviors not stated in the source documents.",
        "- If information is missing, add it to `requirement_gaps` — do NOT assume.",
        "- If a scope area cannot be assessed, add it to `not_assessable`.",
        `- Use the task_id format: strategy_<feature_slug> (derive from feature name).`,
        "",
        "Disposition & Coverage Rules:",
        "- If NO existing test assets/coverage data is provided in context: set `disposition` to `new` for all scope items, `existing_case_refs` to [], `match_basis` to `none`, `match_confidence` to `none`.",
        "- If existing test assets ARE provided: assign disposition (reuse/update/new/retire/regression_keep) based on match analysis.",
        "- `existing_coverage_summary` and `asset_hygiene_report` MUST be `null` when no existing test data is available.",
        "- `coverage_assessment_confidence` MUST be `null` when no existing test data is available.",
        "",
        "Confidence Rules:",
        "- `confidence` MUST be a decimal number between 0.0 and 1.0.",
        "- `confidence_breakdown` factors MUST each be a decimal number between 0.0 and 1.0.",
        "- Derive `workflow_mode` from confidence: <0.4 = blocked, 0.4-0.6 = strategy_only, 0.6-0.8 = controlled, >=0.8 = full.",
        "",
        "Scope Decomposition:",
        "- Decompose ALL testable areas into the 4 categories: functional, edge_cases, integration, non_functional.",
        "- functional: core feature behavior, happy paths, business logic.",
        "- edge_cases: boundary conditions, unusual inputs, error states.",
        "- integration: cross-system interactions, API contracts, data flow between services.",
        "- non_functional: performance, security, accessibility, reliability.",
        "- `change_relation` MUST describe how the scope item relates to the feature/change being tested.",
        "",
        "Platform Consideration:",
        `- Target platforms: ${platformList}.`,
        "- Consider platform-specific differences when assessing risk and scope.",
        "- Platform-specific test items should note the relevant platform in their description.",
        "",
        "Before returning your response, verify:",
        "- Every risk_area has a reason citing evidence from source documents.",
        "- Every scope item has a valid disposition and change_relation.",
        "- Every test_mode entry has a reason explaining the mode choice.",
        "- requirement_gaps lists ALL missing information (never empty unless spec is complete).",
        "- confidence (numeric) and workflow_mode are consistent with confidence rules.",
        "- test_strategy_summary accurately reflects the overall strategy.",
        "If any check fails, revise before responding.",
    ];

    return lines.join("\n");
};

module.exports = {
    SYSTEM_PROMPT,
    STRATEGY_SYSTEM_PROMPT,
    VALID_PLATFORMS,
    DEFAULT_PLATFORMS,
    buildTestAnalysisPrompt,
    buildTestCaseGenerationPrompt,
    buildTestStrategyPrompt,
    formatDocumentSection,
    normalizePromptInput,
    normalizePlatforms,
};
