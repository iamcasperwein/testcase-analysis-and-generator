# Reuse Decision Rules & Scope Decomposition Rules

> Source: TechDoc §4.5 + §7 — NEW design (not present in platform implementation).
> Platform treats everything as "new" — no reuse/disposition logic exists.

---

## Reuse Decision Rules

- No reliable baseline → do NOT assume `reuse`; treat as `new` or `not_assessable`
- Low match confidence (semantic-only, no human confirmation) → do NOT assume `reuse`
- `retire` MUST be explicit, carry a reason, and ALWAYS pass the Human Gate
- High-risk domains (payment / auth) → conservative on `retire`, prefer `regression_keep`
- Refactor / no behavior change → default `reuse`; `new` only for risk-elevating concerns (perf, integration)
- Risk level modulates `new` depth — minimum-sufficient coverage means `new` only where reuse genuinely leaves a gap
- When in doubt between `reuse` and `update` → choose `update` (safer)
- When in doubt between `new` and `not_assessable` → choose `not_assessable` and flag for human decision

---

## Scope Decomposition Rules

Every strategy MUST decompose test scope into these 4 categories:
- **functional** — core feature behavior, happy paths, business logic
- **edge_cases** — boundary conditions, unusual inputs, error states
- **integration** — cross-system interactions, API contracts, data flow between services
- **non_functional** — performance, security, accessibility, reliability

Each scope item carries: `{ id, description, disposition, change_relation, existing_case_refs, match_basis, match_confidence, reason }`

**Exclusion rules:**
- Items explicitly listed as "out of scope" MUST still appear in output with reason for exclusion
- Items in blast radius but with unaffected behavior → `regression_keep` (not excluded)

---

## Rule Precedence

When rules conflict:
1. Risk rules override depth/mode rules (high risk area cannot be `shallow`)
2. Requirement completeness rules override depth rules (incomplete spec → limit depth regardless of risk)
3. Reuse decision rules override scope rules (a matched `reuse` item still stays in scope as regression)
4. Conservative defaults always win (when uncertain: higher risk, deeper depth, more manual, no retire)
