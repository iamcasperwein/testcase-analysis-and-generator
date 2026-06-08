# Automation vs Manual Rules

> Source: TechDoc §7 — Automation vs Manual Rules (new design, not present in platform implementation).
> Now implemented in platform via `src/prompts/strategyRules.js` → `buildAutomationRulesGuidance()`.

---

| Condition | Mode | Rationale |
|-----------|------|-----------|
| UI visual / UX / animation / subjective assessment | `manual-first` | Requires human judgment |
| Deterministic backend logic / API contracts | `automation-first` | Stable, repeatable, high regression value |
| Cross-service integration | `hybrid` | Core path automated, failure scenarios manual |
| Exploratory / one-time verification | `manual-first` | ROI of automation too low |
| Feature still in flux / unstable requirements | `manual-first` | Automation would churn |
| Core happy path + stable feature + executed ≥3x/sprint | `automation-first` | High regression risk justifies investment |
| Edge cases on stable core path | `hybrid` | Core automated, edges manual |

**Platform framework context (for reference, not hard-coded):**
- Backend API: Karate
- Web UI: Playwright
- Mobile: Maestro (iOS/Android)

**Application:** Mode is assigned per area in `test_mode[]`. Each entry carries `{ area, mode, reason }`.
