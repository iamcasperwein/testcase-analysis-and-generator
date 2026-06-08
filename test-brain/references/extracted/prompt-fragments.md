# Prompt Fragments — Adapted Patterns for Strategy Generator

> These are **adapted** prompt patterns — ready to embed in the Test Strategy Generator prompt.
> For the raw platform extractions, see [`prompt-base.md`](prompt-base.md).

---

## 1. Document Equality & Cross-Reference Rule

> Adapted from: `buildDocumentGuidance()` — no change needed, applies directly.

```
Document Usage Rules:
- All provided documents have EQUAL weight. Cross-reference all documents to build a complete picture.
- If documents contain conflicting or mismatched requirements, explicitly flag each conflict with citations from both sources.
- If information is missing or ambiguous, list it in requirement_gaps rather than guessing silently.
```

---

## 2. Figma/Design Scope Expansion (Conditional)

> Adapted from: `buildDocumentGuidance()` Figma section — reworded for strategy (scope areas, not test cases).

```
Figma Design Document Guidance (when provided):
- Figma documents contain extracted UI structure, text content, component hierarchy, and interactive elements.
- Use Figma context to identify ADDITIONAL scope areas that other documents may not cover:
  • UI state variations (empty, loading, error, success states) → add to test_scope.edge_cases
  • Interactive element behaviors (buttons, inputs, toggles — states: default, hover, active, disabled, error) → add to test_scope.functional
  • Navigation flows and screen transitions → add to test_scope.functional
  • Accessibility concerns (contrast, touch targets, focus order) → add to test_scope.non_functional
  • Edge cases visible in design but not in docs (truncation, overflow, empty lists) → add to test_scope.edge_cases
- Cross-reference requirement docs with Figma screens to identify gaps → add to requirement_gaps
```

---

## 3. Assumption → Requirement Gap Pattern

> Adapted from: Platform principle #4 + analysis section §8 — restructured for JSON output.

```
Requirement Gap Rules:
- For every piece of missing, incomplete, or ambiguous information:
  • Add a structured entry to requirement_gaps with: gap description, impact on strategy, who to ask
  • If the gap is critical (blocks core functionality understanding), mark it as critical → triggers confidence penalty cap
- Never assume missing business logic. If the spec doesn't define it, flag it — do not design strategy around assumptions.
- If a requirement is ambiguous, surface the ambiguity in requirement_gaps rather than assuming intent.
```

---

## 4. Conflict Detection → Transparency Pattern

> Adapted from: Analysis section §9 — restructured for per-field reasoning.

```
Document Conflict Rules:
- For any contradictions or mismatches found between provided documents:
  • Cite BOTH sources with specific references in the relevant scope item's reason field
  • Note which interpretation was used for the strategy decision
  • Assess conflict's impact: does it affect risk_level? scope? depth? confidence?
  • If conflict makes an area unresolvable, route to not_assessable
```

---

## 5. Per-Document Clarity → Confidence Input

> Adapted from: Analysis section §10 — clarity ratings now feed the numeric formula.

```
Document Assessment (evaluate internally for each input document):
- Clarity rating: Clear / Partially Clear / Unclear
- Map to confidence factor scores:
  • All docs "Clear" on relevant areas → requirement_completeness ≥ 0.8, clarity ≥ 0.8
  • Mix of "Clear" and "Partially Clear" → factors 0.5–0.8
  • Any doc "Unclear" on critical areas → factors ≤ 0.5
- Gaps identified per document → populate requirement_gaps[]
- If a document is insufficient for strategy decisions, explain what is lacking in not_assessable[]
```

---

## 6. Scope Decomposition Instruction

> Adapted from: Analysis sections 2–5 — restructured for 4-category JSON output.

```
Decompose the feature change into test scope using exactly these 4 categories:

1. functional — Core feature behavior, business logic, user workflows, happy paths
   (Derived from: requirement documents, user stories, acceptance criteria)

2. edge_cases — Boundary conditions, unusual inputs, error states, race conditions, empty states
   (Derived from: implications of functional scope, domain knowledge, design states, §5 of analysis)

3. integration — Cross-system interactions, API contracts, data flow between services, upstream/downstream impacts
   (Derived from: impact analysis, affected modules, dependency map)

4. non_functional — Performance, security, accessibility, reliability, scalability
   (Derived from: domain risk rules, compliance requirements, SLA expectations)

For each scope item, provide:
- id: unique identifier within this output
- description: what this item covers
- disposition: reuse | update | new | retire | regression_keep (if existing assets available; otherwise all "new")
- change_relation: how this item relates to the change trigger
- reason: why this item is in scope and why this disposition
```

---

## 7. Adaptive Input Assembly Pattern

> Adapted from: `buildDocumentGuidance()` conditional logic + `buildTestAnalysisPrompt()` Figma conditional.

**Design principle for prompt construction:**

The strategy prompt is assembled dynamically based on which inputs are available. The assembly follows this logic:

**Always include (every run):**
- Strategy system prompt (persona + principles)
- Document usage rules (equality, cross-reference, conflict flagging)
- Document inventory (list all inputs with extraction status)
- Formatted source documents (full content)
- Risk rules, depth rules, mode rules (from rules.md)
- Output schema definition (from output-schema.md)

**Conditionally include:**
- Figma scope guidance → only when design documents are present in the input
- Disposition rules + formatted existing test assets → only when existing test cases are provided
- Change context / blast radius input → only when change signals (code diff, affected modules) are available
- PM Change Summary parsing instructions → only when PRD contains a Change Summary section

**Omit when not applicable:**
- If no existing test assets → skip disposition matching instructions entirely, default all scope items to `new`
- If no Figma → skip UI/design scope expansion
- If no change context → treat as greenfield analysis

This mirrors the platform's proven approach where `buildDocumentGuidance()` and the Figma section are conditionally injected based on input availability — keeping the prompt focused and within token limits.

---

## 8. Human Gate Pattern (Stop-and-Resume)

> Adapted from: REVIEW checkpoint in QAgentService.js — applied to confidence-driven gating.

```
Workflow Integration:
- After strategy JSON is produced, evaluate workflow_mode:
  • "blocked" → MUST stop. Display warning: "Insufficient information for effective analysis."
  • "strategy_only" → Stop at REVIEW. Show strategy but warn: "Not execution-ready."
  • "controlled" → Stop at REVIEW (current default behavior). Human confirms before downstream proceeds.
  • "full" → May auto-proceed to downstream consumers (Test Case Generator) without additional review.
- Human Gate actions: Accept strategy / Override decisions / Request more signal
- All Human Gate decisions are recorded for calibration feedback loop.
```

---

## 9. Quality Self-Verification Gate

> Adapted from: Platform TC quality checklist (lines 302–311) — rewritten for strategy output.

```
Before finalizing strategy output, verify against this checklist:
- [ ] Every test_scope item has a non-empty description and reason
- [ ] feature_risk_level is consistent with risk_areas (if payment/auth in scope → must be "high")
- [ ] No scope item with high risk has test_depth "shallow"
- [ ] Every requirement_gaps item specifies impact and who to ask
- [ ] confidence_breakdown factors are consistent with document assessment
- [ ] Penalty caps are correctly applied (critical gaps → ≤0.6, low maturity → ≤0.65, not_assessable present → ≤0.7)
- [ ] workflow_mode matches the final confidence score
- [ ] No scope item assumes information not present in source documents
- [ ] If existing test assets were provided, every scope item has a disposition assigned
- [ ] test_strategy_summary accurately reflects the key decisions and rationale

If any check fails, revise the affected output before responding.
```
