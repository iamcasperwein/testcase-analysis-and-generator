# Disposition Model — Existing Coverage Decision

> Source: TechDoc §4.5 (entirely new — no platform equivalent exists)
> This defines how the strategy handles existing test assets: reuse, update, create new, or retire.

---

## 1. Disposition Types

Every `test_scope` item resolves to exactly ONE disposition:

| Disposition | Meaning | Trigger |
|-------------|---------|---------|
| `reuse` | Existing case fully covers the item; behavior unaffected by change — run as regression | Matched case + behavior unaffected |
| `update` | Existing case covers the area but change alters steps / expected result / data | Matched case + behavior modified |
| `new` | Scope item has no matching existing case | No match |
| `retire` | Existing case verifies behavior the change removes or invalidates — candidate for retirement | Matched case + behavior removed |
| `regression_keep` | Not directly in scope, but in change blast radius — keep as regression | Matched case + in blast radius + behavior unaffected |

**Critical:** `retire` is ALWAYS a recommendation, never automatic. Removing coverage is high-risk and MUST pass Human Gate.

---

## 2. Two Drivers of Disposition

### 2.1 Requirement Delta (Semantic)

Used when a comparable baseline exists (e.g., existing cases describe current behavior):

| Clause Status | + Existing Case | = Disposition |
|---------------|-----------------|---------------|
| Unchanged clause | Matched | `reuse` |
| Modified clause | Matched | `update` |
| New clause | No match | `new` |
| Removed clause | Matched | `retire` |

### 2.2 Blast Radius (Structural)

Used when the change is code/dependency/config with no clean requirement diff:

1. Identify `affected_modules` from change signal
2. Project onto cases attached to those modules
3. Judge whether behavior is affected:
   - Behavior unaffected → `regression_keep`
   - Behavior affected → `update`
   - Behavior removed → `retire`

**Many changes combine both drivers** (e.g., enhancement projects).

---

## 3. Baseline Definition

There is NO PRD versioning available. The reference for "what changed" is the system's **current as-built state**, evidenced by:

| Evidence Source | Reliability | Cost |
|-----------------|------------|------|
| Existing test cases | Medium (de-facto current spec) | Free / inherent |
| Implementation Wiki | Medium-high but often stale | Low |
| PM-declared Change Summary | High | Requires process alignment |

**Key insight:** Existing test cases ARE the de-facto current spec. Comparing new PRD vs existing cases yields the requirement delta AND the case mapping in a single step.

When PM Change Summary is absent → fall back to "new PRD vs existing cases" semantic comparison and list "cannot reliably distinguish increment" in `requirement_gaps`.

---

## 4. PM Change-Summary Convention

When present in PRD, this section directly drives dispositions:

```markdown
## Change Summary (for QE / Test Brain)
- Added:     <new features / behaviors>
- Changed:   <existing behaviors changed: was … now …>
- Removed:   <what is being sunset>
- Unchanged: <core flows explicitly not touched> (optional)
```

This is a **parallel dependency** (align with PM team) — it does NOT block the skill from running.

---

## 5. Matching Strategies (Graceful Degradation)

Scope items (demand) are matched against existing cases (supply) via three strategies in descending reliability:

```
trace_link (high) → tag (medium) → semantic similarity (low)
```

Every match carries `match_basis` and `match_confidence`:

| Strategy | Confidence | When Available |
|----------|-----------|----------------|
| `trace_link` | High | Cases have explicit PRD/requirement trace links |
| `tag` | Medium | Cases tagged by module/feature/area |
| `semantic` | Low — requires human confirmation | Fallback: text similarity matching |

**Critical rules:**
- When match confidence is low → MUST NOT assume `reuse`
- Low-confidence match → treat as `new` or route to `not_assessable`
- Never silently assume coverage exists

### Asset Hygiene Report (Diagnostic Byproduct)

Each run emits `asset_hygiene_report`:
```json
{ "trace_link_pct": 0.0, "tag_pct": 0.0, "semantic_pct": 0.0 }
```
This measures what share of relevant cases were matched by each strategy. Informs whether trace-link governance is worth investment.

---

## 6. Per-Scenario Disposition Profile

| Scenario | Primary Driver | Disposition Center of Gravity |
|----------|---------------|-------------------------------|
| Greenfield feature (no assets) | — | All `new`, reuse = 0 |
| New PRD within existing domain | Blast radius | Mostly `new` + adjacent `regression_keep` |
| PRD update / iteration | Requirement delta | Rich mix: `update` / `new` / `retire` |
| Enhancement project | Delta + blast radius | Core flow `reuse`, new capability `new`, boundary `update` |
| Refactor (no behavior change) | Blast radius | Strong `reuse`, ~zero functional `new` |
| Bug fix | Blast radius | `reuse` + targeted `new` regression case |
| Deprecation / sunset | Requirement delta (negative) | Mostly `retire` + `new` to verify graceful removal |
| Config / feature flag / A/B | — | Cases per state + toggle, mostly `new` |
| Dependency / upstream API change | Blast radius | `reuse` + targeted integration `new` |
| New-market / localization | Delta + blast radius | Core logic `reuse`, market-specific `new` |
| Multi-platform consistency | Blast radius | Case logic `reuse`, platform-specific `update` |
| Shared-component / platform change | Blast radius (fan-out) | Reuse fans out across multiple features' suites |

---

## 7. Human Gate Confirms Matches

In MVP, every disposition is an **evidence-backed proposal, not a conclusion**. The Human Gate MUST include a step to confirm/correct case matches. This:
- (a) Prevents low-confidence matches from being treated as fact
- (b) Produces feedback data that calibrates matching over time

---

## 8. When No Existing Assets Available

If the SDET index returns zero relevant cases for the feature/module:
- Skip disposition matching entirely
- All scope items default to `new`
- `existing_coverage_summary` = `{ reuse: 0, update: 0, new: <total>, retire: 0 }`
- `coverage_assessment_confidence` = N/A (greenfield)
- Note in output: "No existing test assets found for matching"
