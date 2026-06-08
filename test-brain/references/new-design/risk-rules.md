# Risk Rules & Test Depth Rules

> Source: TechDoc §7 — NEW design (not present in platform implementation).
> Platform currently has no codified risk taxonomy or depth decision logic.

---

## Risk Rules

| Signal | Risk Level | Notes |
|--------|-----------|-------|
| Payment / financial transactions | HIGH | Non-negotiable |
| Auth / permission / access control | HIGH | Non-negotiable |
| State transition / UI + state coupling | ELEVATED | Elevate by one level from baseline |
| Cross-system integration / multi-entity data | ELEVATED (integration) | Elevate integration risk specifically |
| User data persistence / data migration | ELEVATED | Data loss = high severity |
| Third-party dependency (external API) | ELEVATED | Uncontrolled failure modes |
| Feature flag / A/B test branching | MEDIUM | Combinatorial state space |
| Read-only / display-only changes | LOW (baseline) | Unless in high-risk domain |

**Application:** Risk rules produce `feature_risk_level` and populate `risk_areas[]`. Multiple signals combine (highest wins for overall level).

---

## Test Depth Rules

| Condition | Depth | Rationale |
|-----------|-------|-----------|
| High risk area | `deep` | Full scenario coverage including edge cases |
| Medium risk + high uncertainty | `deep` (edge cases focus) | Uncertainty demands broader exploration |
| Medium risk + clear requirements | `medium` | Standard coverage sufficient |
| Low risk + clear requirements | `medium` | Avoid under-testing even low risk |
| Low risk + low uncertainty | `shallow` | Smoke-level verification |
| Incomplete requirements (any risk) | Limit depth — do NOT over-design | Cannot design what isn't specified |

**Application:** Depth is assigned per `test_scope` item in the output. Never assign `deep` to areas with incomplete requirements (you'd be inventing tests for undefined behavior).
