# Prompt Base — Raw Extractions from Platform Team

> Source: `src/prompts/testCaseGeneration.js`
> These are the actual working prompts from the Platform team solution — verbatim extraction with adaptation notes for the Test Strategy Generator.

---

## 1. Base System Prompt (SYSTEM_PROMPT)

**Source:** `src/prompts/testCaseGeneration.js` lines 3–10

```
You are a Senior QE Engineer with 10+ years of experience in test planning, test case design, and quality assessment. You specialize in deriving comprehensive, actionable test cases from product specifications.

Your core principles:
1. Every test case must be independently executable by a manual QA tester who has never seen the PRD.
2. Steps must be atomic — one action per step, one verification per expected result.
3. Cover the "testing pyramid": happy path first, then error cases, then edge cases.
4. If a requirement is ambiguous, create a test case that surfaces the ambiguity rather than assuming intent.
5. Never invent features or behaviors not stated in the source documents.
```

### Adaptation Notes for Strategy Generator

| Principle | Keep / Adapt / Drop |
|-----------|---------------------|
| Persona: "Senior QE Engineer with 10+ years" | **Keep** — proven persona framing |
| #1: Independently executable by manual tester | **Drop** — TC-specific, not strategy |
| #2: Atomic steps | **Drop** — TC-specific |
| #3: Testing pyramid (happy → error → edge) | **Adapt** — maps to scope decomposition order (functional → edge_cases → integration → non_functional) |
| #4: Ambiguity → surface it, don't assume | **Keep directly** — maps to `requirement_gaps` and `not_assessable` |
| #5: Never invent features not in source docs | **Keep directly** — core safety rule for strategy reasoning |

---

## 2. Analysis Prompt Builder (buildTestAnalysisPrompt)

**Source:** `src/prompts/testCaseGeneration.js` lines 317–393

```
Create a testing analysis document in well-structured Markdown format.
Cross-reference ALL provided documents equally. Flag any conflicts or mismatches between documents.
When a Figma design document is provided, explicitly analyze UI elements, interaction patterns, screen states, and visual flows in addition to functional requirements.
State any assumptions you make clearly.

Product Context:
- Feature: ${feature}
- Target Platforms: ${platformList}
- Additional Context: ${additionalContext || "N/A"}
- Attached Documents: ${attachedLabels.join(", ") || "None"}
- Some attached files may be binary (PDF/image). Use attached file context in addition to extracted text sections.
${documentInventory}

${buildDocumentGuidance()}

Source Documents:
${formatAllDocuments(documents)}

Required document structure (use exactly these markdown headings):

# Testing Analysis Document
(Include metadata: Feature, Target Platforms, Documents Used)

## 1. Summary / Overview
(Brief overview of what the feature does and the testing goal)

## 2. Scope
(List of functional areas in scope with document references if available)

## 3. Impact Analysis
(How changes affect UX, backend, support, security, performance)

## 4. Out of Scope
(Explicitly list what is NOT being tested and why)

## 5. Edge Cases
(List edge cases and boundary conditions to test)

## 6. Risks & Mitigations
(Potential risks and how to mitigate them)

## 7. Test Strategy Notes
(Approach, environment requirements, test data needs)

## 8. Assumptions
(List all assumptions made due to missing, incomplete, or ambiguous information across documents)

## 9. Document Conflicts & Mismatches
(Flag any contradictions or mismatches found between the provided documents. For each conflict, cite both sources and note which interpretation was used for testing.)

## 10. Document Assessment
(For EACH provided document, include:
  - Document name/type
  - What the document covers (brief summary of its content and purpose)
  - Key information extracted that is relevant for testing
  - Clarity rating: Clear / Partially Clear / Unclear
  - Gaps or missing information that would improve test coverage
  - If the document is insufficient for deriving test cases, explain what is lacking)

## 11. UI/Design Analysis (include only if Figma or design documents are provided)
(UI components identified, interaction patterns, screen states, visual flows, design-requirement gaps)

Formatting rules:
- Use proper Markdown: ## for sections, ### for subsections, - for bullet lists, **bold** for emphasis.
- Use tables (Markdown table syntax) where structured data is appropriate (e.g., scope items with Document Source, Area, Priority).
- Do NOT return JSON.
- Keep it concise and actionable.
- If a document is missing or has empty content, explicitly mention assumptions.
- When listing test scenarios or cases in the analysis, use the naming pattern: Object + Expectation + Condition (e.g., 'The user should be able to submit the form when all fields are valid').
```

### Adaptation Notes for Strategy Generator

| Section | Maps to TechDoc | Adaptation Required |
|---------|-----------------|---------------------|
| §1 Summary/Overview | `test_strategy_summary` | Keep — becomes the summary field |
| §2 Scope | `test_scope` (4 categories) | Restructure: split into functional/edge/integration/non_functional with per-item metadata |
| §3 Impact Analysis | Blast radius reasoning (§4.5.2) | Adapt: feed into `affected_modules` and disposition driver |
| §4 Out of Scope | Scope exclusion with `reason` | Keep structure — add explicit reason per excluded item |
| §5 Edge Cases | `test_scope.edge_cases` | Move into structured scope as a category |
| §6 Risks & Mitigations | `feature_risk_level` + `risk_areas[]` | Restructure: apply risk taxonomy rules, output enum + structured list |
| §7 Test Strategy Notes | `test_depth` + `test_mode[]` | Split: depth rules + mode rules → separate structured fields |
| §8 Assumptions | `requirement_gaps[]` | Restructure: each assumption → structured gap with impact + who to ask |
| §9 Document Conflicts | AI Transparency (§4.4) | Keep — becomes per-field `reason` citations |
| §10 Document Assessment | `requirement_maturity` + `confidence_breakdown.clarity` | Adapt: clarity ratings feed into numeric confidence formula |
| §11 UI/Design Analysis | Conditional scope expansion | Keep — drives additional scope items when Figma present |
| Output format: Markdown | Output format: JSON | **Full format change** |

---

## 3. Document Guidance Builder (buildDocumentGuidance)

**Source:** `src/prompts/testCaseGeneration.js` lines 153–171

```
Document Usage Rules:
- All provided documents have EQUAL weight. Cross-reference all documents to build a complete picture.
- If documents contain conflicting or mismatched requirements, explicitly flag each conflict in a dedicated section.
- If information is missing or ambiguous, state your assumptions clearly rather than guessing silently.

Figma Design Document Guidance (when provided):
- Figma documents contain extracted UI structure, text content, component hierarchy, and interactive elements from design mockups.
- Use Figma context to derive ADDITIONAL test cases that other documents may not cover, including:
  • UI layout and visual consistency tests (element positioning, alignment, responsive behavior)
  • Interactive element behavior (buttons, inputs, toggles, dropdowns — states: default, hover, active, disabled, error)
  • Navigation flows and screen transitions visible in the design
  • Text content accuracy (labels, placeholders, error messages, tooltips matching design)
  • Component state variations (empty states, loading states, error states shown in frames)
  • Accessibility considerations derived from the UI structure (contrast, touch targets, focus order)
  • Edge cases visible in design but not mentioned in other docs (e.g., truncation, overflow, empty lists)
- Cross-reference other documents with Figma screens to identify gaps: requirements without corresponding UI, or UI elements without documented requirements.
- If Figma shows multiple frames/screens, generate test cases covering the flow between them.
```

### Adaptation Notes for Strategy Generator

- "derive ADDITIONAL test cases" → adapt to "identify ADDITIONAL scope areas"
- Figma guidance is **directly reusable** for scope decomposition — it identifies specific functional/edge areas from design
- The cross-reference pattern (requirements ↔ Figma) is a gap detection technique that feeds `requirement_gaps`

---

## 4. Document Inventory Builder

**Source:** `src/prompts/testCaseGeneration.js` lines 72–83

**What it does:** Generates a "Document Inventory" section listing each input document with its type label, name, and extraction status. Extraction status is categorized as:
- "not extracted" — content is empty
- "partial (N chars)" — content exists but is less than 120 characters
- "extracted (N chars)" — content is 120+ characters

**Output format example:**
```
Document Inventory:
- [PRD] Payment Flow Redesign (extracted (4523 chars))
- [Figma] Checkout Screens (extracted (2100 chars))
- [TechSpec] API Changes (partial (89 chars))
```

**Reuse:** Directly reusable — strategy prompt needs the same input inventory for transparency and traceability.

---

## 5. Document Formatting

**Source:** `src/prompts/testCaseGeneration.js` lines 88–111

**What it does:** Formats each input document for inclusion in the prompt. For each document:
- Renders a heading with the document type label and name (e.g., `### PRD: Payment Flow Redesign`)
- If content is available: wraps the full text content inside a text code fence block
- If content is empty/binary: displays a note saying "Not extracted (binary or empty). If this is an attached file, use the file attachment for context."

All documents are then concatenated with blank line separators between them. If no documents are provided, outputs "No documents provided."

**Reuse:** Directly reusable — same document formatting for strategy prompt input.

---

## 6. Prompt Input Normalization

**Source:** `src/prompts/testCaseGeneration.js` lines 126–149

**What it does:** Standardizes raw input before prompt construction:
1. Ensures `documents` is always an array (empty if not provided)
2. If no documents but raw `prdText` is provided (legacy fallback), wraps it as a synthetic PRD document
3. Trims and normalizes all string fields (feature name, platform, context)
4. Resolves platforms to a validated list from allowed values: ios, android, mobile-web, desktop-web, backend. Falls back to all platforms if none are valid.
5. Merges `additionalContext` and `context` fields into a single string (handles both legacy and current input formats)

**Output shape:**
- `feature` — trimmed feature name string
- `platforms` — validated array of platform strings
- `additionalContext` — merged and trimmed context string
- `documents` — array of { docType, name, content, path }

**Reuse:** Directly reusable — strategy prompt needs the same input normalization. May need extension to accept `existingTestAssets` input for disposition matching.

---

## 7. Confidence Table Pattern (from Section 7a)

**Source:** Embedded in `buildTestAnalysisPrompt()` output — the AI is asked to produce this in its Markdown output.

```
### 7a. Confidence Assessment

| Recommendation | Confidence | Rationale | Information Gap |
|---------------|------------|-----------|----------------|

Confidence level criteria:
- High (80-100%): Requirement explicitly stated with acceptance criteria in source docs
- Medium (40-79%): Requirement implied or partially specified; reasonable inferences made
- Low (0-39%): Inferred from context or industry patterns; no direct doc support

For Medium/Low items, the Information Gap column MUST specify:
- What specific information is missing
- Who should be asked (e.g., Product, Backend team, Design, Mobile team)
- What impact the gap has on test coverage
```

### Adaptation Notes for Strategy Generator

This qualitative table becomes the **input signal** for the numeric confidence formula:
- "High" items → factor score ≥ 0.8
- "Medium" items → factor score 0.4–0.8
- "Low" items → factor score < 0.4
- "Information Gap" column → populates `requirement_gaps[]` structured array
- "Who should be asked" → preserved in gap item as `ask` field

---

## 8. Automation Strategy Pattern (from Section 7b)

**Source:** Embedded in `buildTestAnalysisPrompt()` output.

```
### 7b. Automation Strategy

Team's automation frameworks:
- Backend: Karate (API testing)
- Web: Playwright (UI testing)
- Mobile App: Maestro (iOS/Android UI testing)

| Area | Recommendation | Rationale | Framework |
|------|---------------|-----------|-----------|

Criteria for automation recommendation:
- Automate: Stable feature, deterministic outcome, executed frequently (≥3x per sprint), high regression risk
- Manual: Exploratory, subjective UX evaluation, one-time verification, feature still in flux
- Hybrid: Core happy path automated, edge cases manual
```

### Adaptation Notes for Strategy Generator

- Table structure maps directly to `test_mode[]`: `[{ area, mode, reason }]`
- Criteria map to TechDoc §7 "Automation vs Manual Rules"
- Framework references are contextual (team-specific) — keep as configurable reference, not hard-coded rules
