# Confidence & Workflow Control

> Source: TechDoc §8 + Platform team extracted logic (§2.4 qualitative confidence table)
> This file defines the confidence scoring formula, penalty caps, and workflow mode gating.

---

## 1. Confidence Formula

```
confidence =
  0.3 × requirement_completeness
+ 0.3 × clarity
+ 0.2 × (1 - uncertainty)
+ 0.2 × risk_identifiability
```

Each factor is scored 0.0–1.0:

| Factor | 1.0 (best) | 0.5 (mid) | 0.0 (worst) |
|--------|-----------|-----------|-------------|
| `requirement_completeness` | All functional areas have explicit requirements with acceptance criteria | Some areas specified, some implied | Most behavior undefined or missing |
| `clarity` | Requirements are unambiguous, single interpretation possible | Some ambiguity but reasonable inference possible | Multiple conflicting interpretations, contradictions |
| `uncertainty` | All unknowns identified and bounded | Some unknowns but scope is clear | Fundamental unknowns about feature purpose/behavior |
| `risk_identifiability` | All risk areas can be named and assessed | Some risk areas identifiable, others unclear | Cannot determine where risk lies |

### Qualitative-to-Numeric Bridge

> Extracted from platform Section 7a confidence table — provides the signal definitions.

| Platform Band | Numeric Equivalent | Signal |
|---------------|-------------------|--------|
| High (80-100%) | requirement_completeness ≥ 0.8 | Requirement explicitly stated with acceptance criteria in source docs |
| Medium (40-79%) | requirement_completeness 0.4–0.8 | Requirement implied or partially specified; reasonable inferences made |
| Low (0-39%) | requirement_completeness < 0.4 | Inferred from context or industry patterns; no direct doc support |

### Information Gap Impact

> Extracted from platform "Information Gap" column pattern.

For each gap identified, record:
- What specific information is missing
- Who should be asked (Product, Backend team, Design, Mobile team)
- What impact the gap has on strategy confidence

---

## 2. Forced Penalty Caps

Applied AFTER the formula. Earlier rules override later ones:

| # | Condition | Cap | Rationale |
|---|-----------|-----|-----------|
| 1 | Critical gaps exist (any `requirement_gaps` item marked critical) | confidence ≤ 0.6 | Cannot produce reliable strategy with critical unknowns |
| 2 | `requirement_maturity` = low | confidence ≤ 0.65 | Spec is too immature for high-confidence decisions |
| 3 | `not_assessable` non-empty | confidence ≤ 0.7 | Acknowledges known blind spots |

**Penalty caps are non-negotiable.** Even if the formula yields 0.9, a critical gap forces the score to ≤ 0.6.

---

## 3. Workflow Mode Mapping

| Confidence Range | Workflow Mode | Meaning | Downstream Behavior |
|-----------------|--------------|---------|---------------------|
| < 0.5 | `blocked` | Too little information for effective analysis | Output strategy skeleton only; flag as blocked; require human input before any action |
| 0.5 – 0.65 | `strategy_only` | Partial strategy possible but not execution-ready | Output strategy; do NOT recommend execution plan or test case generation |
| 0.65 – 0.8 | `controlled` | Strategy is viable but requires human confirmation | Output full strategy; mark areas needing human review; proceed only after Human Gate |
| ≥ 0.8 | `full` | High confidence — strategy is execution-ready | Output full strategy; downstream consumers may proceed without additional review |

---

## 4. Coverage Assessment Confidence (Independent)

`coverage_assessment_confidence` is tracked INDEPENDENTLY of requirement `confidence`:
- It reflects **asset-mapping reliability**, not requirement understanding
- When matching is mostly `semantic` (no trace_link or tag) and no PM-declared Change Summary exists → coverage confidence degrades independently
- This means `workflow_mode` may be **partitioned per section**: functional/risk assessment at `full` while coverage portion is at `controlled`

| Matching Quality | Coverage Confidence Range |
|-----------------|--------------------------|
| Mostly trace_link matches | 0.8–1.0 |
| Mostly tag matches | 0.6–0.8 |
| Mostly semantic matches (no human confirm) | 0.3–0.6 |
| No existing assets to match against | N/A (greenfield) |

---

## 5. Confidence Self-Check

Before finalizing confidence output, verify:
- [ ] All `requirement_gaps` items are reflected in the formula (lower `requirement_completeness`)
- [ ] All `not_assessable` items are reflected (raise `uncertainty`)
- [ ] Penalty caps applied after formula
- [ ] `coverage_assessment_confidence` scored independently from requirement confidence
- [ ] `workflow_mode` correctly derived from final (post-cap) confidence score
- [ ] If partitioned mode applies, it's noted in the output
