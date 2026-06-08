# Output Schema — Structured Strategy Output

> Source: TechDoc §6
> This is the contract between the Strategy Generator and downstream consumers (Test Case Generator, Smart Execution, Human Reviewers).

---

## Output Groups

### 1. Risk & Maturity

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Task identifier |
| `feature_risk_level` | enum: `high` \| `medium` \| `low` | Overall feature risk level |
| `requirement_maturity` | enum: `high` \| `medium` \| `low` | Completeness/quality of input requirements |
| `risk_areas` | array of objects | Identified risk areas with reasoning |

### 2. Test Design

| Field | Type | Description |
|-------|------|-------------|
| `test_scope` | object: `{ functional, edge_cases, integration, non_functional }` | Each category contains array of scope items |
| `test_depth` | object | Depth per dimension: `shallow` \| `medium` \| `deep` |
| `test_mode` | array: `[{ area, mode, reason }]` | Mode recommendation per area |
| `existing_coverage_summary` | object: `{ reuse, update, new, retire, coverage_gap[] }` | Counts + gap list |
| `asset_hygiene_report` | object: `{ trace_link_pct, tag_pct, semantic_pct }` | Match-basis distribution |

### 3. Uncertainty

| Field | Type | Description |
|-------|------|-------------|
| `requirement_gaps` | array of objects | What information is missing; each with impact and who to ask |
| `not_assessable` | array of objects | What cannot be evaluated with current info |

### 4. Confidence

| Field | Type | Description |
|-------|------|-------------|
| `confidence` | number: 0.0–1.0 | Overall confidence score (post penalty caps) |
| `confidence_breakdown` | object: `{ requirement_completeness, clarity, uncertainty, risk_identifiability }` | Per-factor scores |
| `coverage_assessment_confidence` | number: 0.0–1.0 | Independent confidence of existing-coverage mapping |
| `workflow_mode` | enum: `blocked` \| `strategy_only` \| `controlled` \| `full` | Derived from confidence |
| `test_strategy_summary` | string | Human-readable strategy summary with rationale |

---

## Scope Item Schema

Each item within `test_scope.{category}`:

```json
{
  "id": "string — unique within this output",
  "description": "string — what this scope item covers",
  "disposition": "reuse | update | new | retire | regression_keep",
  "change_relation": "string — how this item relates to the change trigger",
  "existing_case_refs": ["string — IDs of matched existing cases"],
  "match_basis": "trace_link | tag | semantic | none",
  "match_confidence": "high | medium | low | none",
  "reason": "string — why this disposition was assigned"
}
```

---

## Output Characteristics

- **Machine-oriented**: JSON schema for programmatic consumption
- **Human-friendly**: Rendered as readable document for review (via Feishu template)
- **Recordable**: Easy to version, compare, and audit
- **Transparent**: Every decision carries reasoning (§4.4 requirement)

---

## Example Output Structure

```json
{
  "task_id": "strategy_001",
  "feature_risk_level": "high",
  "requirement_maturity": "medium",
  "risk_areas": [
    { "area": "Payment processing", "level": "high", "reason": "Financial transaction — non-negotiable high risk per domain rules" }
  ],
  "test_scope": {
    "functional": [
      {
        "id": "func_001",
        "description": "User can complete checkout with valid payment method",
        "disposition": "update",
        "change_relation": "Checkout flow modified to support new payment provider",
        "existing_case_refs": ["TC-234", "TC-235"],
        "match_basis": "tag",
        "match_confidence": "medium",
        "reason": "Existing cases cover checkout but steps/expected results changed due to new provider integration"
      }
    ],
    "edge_cases": [],
    "integration": [],
    "non_functional": []
  },
  "test_depth": {
    "functional": "deep",
    "edge_cases": "deep",
    "integration": "medium",
    "non_functional": "shallow"
  },
  "test_mode": [
    { "area": "Payment API contracts", "mode": "automation-first", "reason": "Deterministic backend logic, high regression value" },
    { "area": "Checkout UI flow", "mode": "hybrid", "reason": "Core path automated, edge cases manual due to UX judgment" }
  ],
  "existing_coverage_summary": {
    "reuse": 5,
    "update": 3,
    "new": 8,
    "retire": 1,
    "coverage_gap": ["New payment provider error handling has no existing coverage"]
  },
  "asset_hygiene_report": { "trace_link_pct": 0.12, "tag_pct": 0.56, "semantic_pct": 0.32 },
  "requirement_gaps": [
    { "gap": "Error handling for payment timeout not specified", "impact": "Cannot design edge cases for timeout scenarios", "ask": "Backend team" }
  ],
  "not_assessable": [
    { "item": "Third-party payment provider SLA behavior", "reason": "No documentation available for provider failure modes" }
  ],
  "confidence": 0.65,
  "confidence_breakdown": {
    "requirement_completeness": 0.7,
    "clarity": 0.8,
    "uncertainty": 0.4,
    "risk_identifiability": 0.9
  },
  "coverage_assessment_confidence": 0.55,
  "workflow_mode": "controlled",
  "test_strategy_summary": "High-risk payment feature change requiring deep functional and edge case coverage. 3 existing cases need updating due to provider switch, 8 new cases needed for new integration points. Confidence is controlled (0.65) due to missing timeout error handling spec — recommend clarifying with backend team before full execution."
}
```
