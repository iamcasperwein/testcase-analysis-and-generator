# Few-Shot Examples — Strategy Output

> These are NEW examples written for strategy output format (TechDoc §6 schema).
> NOT adapted from TC examples — written fresh for the Feature Test Strategy swimlane.
> Status: DRAFT — pending confirmation on scenario type (see todo.md #3)

---

## Example 1: Enhancement to Existing Feature (Payment Method Addition)

**Scenario:** Adding Apple Pay as a new payment method to existing checkout flow.

**Key characteristics:** Enhancement project — delta + blast radius. Core flow `reuse`, new capability `new`, boundary `update`.

```json
{
  "task_id": "strategy_applepay_001",
  "feature_risk_level": "high",
  "requirement_maturity": "medium",
  "risk_areas": [
    { "area": "Payment transaction processing", "level": "high", "reason": "Financial transaction — domain rule: payment → HIGH" },
    { "area": "Apple Pay SDK integration", "level": "high", "reason": "Third-party dependency with uncontrolled failure modes" },
    { "area": "Checkout UI state management", "level": "medium", "reason": "UI + state coupling — elevated per domain rule" }
  ],
  "test_scope": {
    "functional": [
      { "id": "func_001", "description": "User completes purchase using Apple Pay on supported devices", "disposition": "new", "change_relation": "New payment method — no existing coverage", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "Greenfield capability" },
      { "id": "func_002", "description": "Existing credit card checkout flow remains functional", "disposition": "reuse", "change_relation": "Core flow unaffected by addition", "existing_case_refs": ["TC-101", "TC-102", "TC-103"], "match_basis": "tag", "match_confidence": "medium", "reason": "Existing cases cover credit card flow; no behavior change" },
      { "id": "func_003", "description": "Payment method selection UI shows Apple Pay option", "disposition": "update", "change_relation": "Selection UI modified to add new option", "existing_case_refs": ["TC-110"], "match_basis": "tag", "match_confidence": "medium", "reason": "Existing case covers method selection but steps need updating for new option" }
    ],
    "edge_cases": [
      { "id": "edge_001", "description": "Apple Pay fails mid-transaction (network timeout)", "disposition": "new", "change_relation": "New failure mode for new payment method", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage for Apple Pay error states" },
      { "id": "edge_002", "description": "Device does not support Apple Pay — graceful degradation", "disposition": "new", "change_relation": "New device capability check", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "Platform-specific capability" }
    ],
    "integration": [
      { "id": "int_001", "description": "Apple Pay SDK token exchange with backend payment service", "disposition": "new", "change_relation": "New integration point", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "New third-party integration" },
      { "id": "int_002", "description": "Order service processes Apple Pay transactions correctly", "disposition": "regression_keep", "change_relation": "In blast radius — order service shared across methods", "existing_case_refs": ["TC-150", "TC-151"], "match_basis": "trace_link", "match_confidence": "high", "reason": "Order processing logic unaffected but in blast radius" }
    ],
    "non_functional": [
      { "id": "nf_001", "description": "Apple Pay transaction latency within SLA", "disposition": "new", "change_relation": "New performance baseline needed", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing performance coverage for Apple Pay" }
    ]
  },
  "test_depth": {
    "functional": "deep",
    "edge_cases": "deep",
    "integration": "medium",
    "non_functional": "shallow"
  },
  "test_mode": [
    { "area": "Apple Pay SDK token exchange", "mode": "automation-first", "reason": "Deterministic API contract, high regression value" },
    { "area": "Payment method selection UI", "mode": "hybrid", "reason": "Core path automated (Playwright), visual/UX manually" },
    { "area": "Apple Pay biometric flow (iOS)", "mode": "manual-first", "reason": "Device-specific biometric interaction, requires physical device" }
  ],
  "existing_coverage_summary": { "reuse": 3, "update": 1, "new": 5, "retire": 0, "coverage_gap": ["Apple Pay error handling not specified in PRD"] },
  "asset_hygiene_report": { "trace_link_pct": 0.15, "tag_pct": 0.62, "semantic_pct": 0.23 },
  "requirement_gaps": [
    { "gap": "Apple Pay error states and retry behavior not defined", "impact": "Cannot fully design edge case coverage for payment failures", "ask": "Product + Backend team" },
    { "gap": "Supported device list not specified", "impact": "Cannot determine scope of device-capability edge cases", "ask": "Mobile team" }
  ],
  "not_assessable": [
    { "item": "Apple Pay sandbox vs production behavior differences", "reason": "No documentation on Apple's sandbox fidelity" }
  ],
  "confidence": 0.65,
  "confidence_breakdown": { "requirement_completeness": 0.7, "clarity": 0.75, "uncertainty": 0.4, "risk_identifiability": 0.9 },
  "coverage_assessment_confidence": 0.6,
  "workflow_mode": "controlled",
  "test_strategy_summary": "High-risk payment enhancement adding Apple Pay to existing checkout. 5 new test areas needed (SDK integration, error handling, device capabilities), 3 existing cases reusable as regression, 1 case needs updating. Confidence is controlled (0.65) due to undefined error handling and device list — recommend Product/Backend clarification before test case generation. Biometric flow requires manual testing on physical devices."
}
```

---

## Example 2: Greenfield Feature (No Existing Assets)

**Scenario:** New user notification preferences feature — first-time build, no existing test coverage.

**Key characteristics:** Greenfield — all `new`, reuse = 0, simpler disposition logic.

```json
{
  "task_id": "strategy_notif_prefs_001",
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
      { "id": "int_001", "description": "Preference changes propagate to notification delivery service", "disposition": "new", "change_relation": "New integration point", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage" }
    ],
    "non_functional": [
      { "id": "nf_001", "description": "Preference page load time within SLA", "disposition": "new", "change_relation": "New page", "existing_case_refs": [], "match_basis": "none", "match_confidence": "none", "reason": "No existing coverage" }
    ]
  },
  "test_depth": { "functional": "medium", "edge_cases": "medium", "integration": "medium", "non_functional": "shallow" },
  "test_mode": [
    { "area": "Preference API CRUD", "mode": "automation-first", "reason": "Deterministic backend, high regression value" },
    { "area": "Preference UI toggles", "mode": "automation-first", "reason": "Stable UI, repeatable interactions (Playwright/Maestro)" }
  ],
  "existing_coverage_summary": { "reuse": 0, "update": 0, "new": 4, "retire": 0, "coverage_gap": [] },
  "asset_hygiene_report": { "trace_link_pct": 0.0, "tag_pct": 0.0, "semantic_pct": 0.0 },
  "requirement_gaps": [],
  "not_assessable": [],
  "confidence": 0.85,
  "confidence_breakdown": { "requirement_completeness": 0.9, "clarity": 0.85, "uncertainty": 0.15, "risk_identifiability": 0.9 },
  "coverage_assessment_confidence": null,
  "workflow_mode": "full",
  "test_strategy_summary": "Medium-risk greenfield feature with clear requirements. All scope items are new (no existing assets). High confidence (0.85) — requirements are well-specified with acceptance criteria. Recommend proceeding directly to test case generation."
}
```
