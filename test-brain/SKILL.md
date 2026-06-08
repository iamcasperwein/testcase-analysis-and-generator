---
name: test-brain-strategy
description: "Feature Test Strategy Generator — AI decision layer that determines what to test, how to test, at what depth, and what existing coverage to reuse/update/retire. Produces structured strategy output with confidence scoring and workflow mode gating."
metadata:
  swimlane: "Feature Test Strategy"
  status: draft
  ref: "Test Strategy Generator - TechDoc §2, §4.5, §5, §6, §7, §8"
---

# Feature Test Strategy Generator

> **Swimlane 2 of 4** — Pre-execution AI decision layer
> Canonical spec: `ztest-swimlane-temp/Test Strategy Generator - TechDoc.md`

## Purpose

Construct the necessary context based on specific feature changes to perform risk assessment, test scope pruning, and the reuse of existing test assets. Define new testing strategies along with the automation strategy and its scope — all governed by established rule constraints — while providing a confidence level and supporting rationale for the approach.

## Core Design Principles

> Extracted from TechDoc §8 "System Prompt Design Principles" + Platform team proven principles

1. **Minimum sufficient coverage** — Goal is NOT to maximize testing, but to determine the minimum coverage to manage risk.
2. **Risk vs maturity distinction** — Always distinguish feature risk (severity of failure) from requirement maturity (completeness of spec).
3. **Explicit uncertainty** — Never assume missing information. If unclear, surface it in `requirement_gaps` or `not_assessable`.
4. **Evidence-backed reasoning** — Every decision (risk level, scope inclusion/exclusion, disposition) MUST cite evidence. Without transparency, human review is meaningless (TechDoc §4.4).
5. **Document equality** — All provided documents have EQUAL weight. Cross-reference all to build a complete picture.
6. **Change-driven** — Every analysis is triggered by a specific change (new feature, requirement update, code change). There is no "general" analysis.
7. **Domain-aware risk** — Apply domain-specific reasoning: payment/auth → high risk; UI+state → elevated risk.
8. **Conservative on retire** — `retire` is always a recommendation, never automatic. High-risk domains bias conservative.

## Inputs

The skill expects normalized inputs (from upstream PRD Assessment swimlane or adaptor):

- **Change signals** — PRD / Figma / Tech Spec / User Story (what triggered this analysis)
- **Background knowledge** — Wiki, existing test assets (from SDET index), incident history
- **Product context** — Feature name, target platforms, additional context

### Adaptive Input Handling

> Extracted from platform `buildDocumentGuidance()` pattern

The skill dynamically adjusts reasoning based on which inputs are available:
- When Figma/design docs present → include UI-specific scope areas (states, transitions, visual consistency)
- When existing test assets available → run disposition matching (§4.5)
- When PM Change Summary present → use requirement delta as primary disposition driver
- When no baseline available → treat as greenfield; flag reduced confidence

## Output Contract

Structured JSON following TechDoc §6 schema. See [`references/new-design/output-schema.md`](references/new-design/output-schema.md) for full specification.

Output is organized into 4 groups:
1. **Risk & Maturity** — feature_risk_level, requirement_maturity, risk_areas
2. **Test Design** — test_scope (with dispositions), test_depth, test_mode, existing_coverage_summary
3. **Uncertainty** — requirement_gaps, not_assessable
4. **Confidence** — confidence (0.0–1.0), confidence_breakdown, coverage_assessment_confidence, workflow_mode

## Reasoning Flow

```
Input Documents
    │
    ▼
┌─────────────────────────┐
│ 1. Scope Decomposition  │ → functional / edge_cases / integration / non_functional
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 2. Risk Assessment      │ → feature_risk_level + risk_areas (domain rules apply)
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 3. Depth Decision       │ → shallow/medium/deep per scope area (risk × uncertainty)
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 4. Mode Decision        │ → automation-first / manual-first / hybrid per area
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 5. Disposition Matching │ → reuse/update/new/retire per scope item (if existing assets available)
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 6. Confidence Scoring   │ → formula + penalty caps → workflow_mode
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 7. Strategy Summary     │ → human-readable rationale
└─────────────────────────┘
```

## References (read on demand)

### Extracted (proven platform logic)

| File | When to Read |
|------|-------------|
| [`extracted/prompt-base.md`](references/extracted/prompt-base.md) | Always — core system prompt structure |
| [`extracted/prompt-fragments.md`](references/extracted/prompt-fragments.md) | Always — reusable prompt patterns from platform |
| [`extracted/completeness-rules.md`](references/extracted/completeness-rules.md) | Steps 2–3 — requirement gap handling |
| [`extracted/do-not-reuse.md`](references/extracted/do-not-reuse.md) | Reference — what NOT to carry from platform implementation |

### New Design (TechDoc-derived, to be validated)

| File | When to Read |
|------|-------------|
| [`new-design/risk-rules.md`](references/new-design/risk-rules.md) | Steps 2–3 — risk assessment + depth decision |
| [`new-design/automation-rules.md`](references/new-design/automation-rules.md) | Step 4 (Mode Decision) — automation vs manual criteria |
| [`new-design/reuse-rules.md`](references/new-design/reuse-rules.md) | Step 5 — disposition matching + scope decomposition + precedence |
| [`new-design/confidence.md`](references/new-design/confidence.md) | Step 6 — confidence formula, penalty caps, workflow mode |
| [`new-design/disposition.md`](references/new-design/disposition.md) | Step 5 — when existing test assets are available for matching |
| [`new-design/output-schema.md`](references/new-design/output-schema.md) | When producing final output |
| [`new-design/few-shot-examples.md`](references/new-design/few-shot-examples.md) | For output calibration |

## Human Gate (§3.5)

Every strategy output passes through a Human Gate before downstream consumption:
- Accept strategy
- Override decisions
- Request more signal

> Pattern extracted from platform: REVIEW checkpoint (stop-and-resume). The platform proves this stop-and-resume pattern works for human review workflows.

## Constraints

- Output MUST be strict JSON conforming to the schema in `new-design/output-schema.md`
- Every judgment MUST include reasoning (§4.4 AI Transparency)
- `retire` dispositions MUST always pass Human Gate — never automatic
- When match confidence is low, MUST NOT assume `reuse` — treat as `new` or route to `not_assessable`
- Confidence penalty caps are non-negotiable (see `new-design/confidence.md`)
