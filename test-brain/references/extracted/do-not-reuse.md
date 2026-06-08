# Do-Not-Reuse List

> Items from the Platform team solution that must NOT carry over to the Test Brain Strategy Generator skill.
> These are implementation artifacts specific to the platform — not logic assets.

---

## Code & Architecture (Platform-Specific)

| Item | Why Not Reuse |
|------|---------------|
| Express/Node server architecture (`app.js`, routes, controllers) | Test Brain is a skill, not a service |
| File-based persistence (`data/`, `promptdata.json`) | Skill uses structured JSON output + Feishu document, not file storage |
| AI provider adapters (Claude/Gemini/Copilot/LiteLLM service classes) | Skill is agent-platform agnostic — runs on any platform that supports the skill format |
| `sec_${ulid()}` section ID generation | Platform-specific persistence concern |
| Dashboard/UI frontend code (`public/`) | Irrelevant to reasoning skill |
| TestRail integration (`TestrailService`) | External sync is out of scope for the skill |

## Pipeline & Orchestration (Platform-Specific)

| Item | Why Not Reuse |
|------|---------------|
| Two-stage pipeline flow (ANALYZING → REVIEW → GENERATING) | Strategy Generator is a single-pass reasoning output, not a multi-stage pipeline |
| `autoGenerateTestCases` toggle / status state machine | UX/pipeline orchestration, not reasoning |
| `normalizeGeneratedTestCases()` post-processing | JSON normalization is platform-specific |
| Document enrichment pipeline (Figma API calls, Lark content fetch, PDF parsing) | Signal Hub / Adaptor concern — inputs arrive pre-normalized to the skill |
| Platform normalization logic (`normalizePlatforms()`) | Validation concern, not reasoning logic |

## Test Case-Specific Logic (Swimlane 4, Not Swimlane 2)

| Item | Why Not Reuse |
|------|---------------|
| TC JSON output schema (`TEST_CASE_OUTPUT_SCHEMA`) | Strategy outputs strategy, not test cases |
| TC title convention (Object + Expectation + Condition pattern) | Test case writing convention — irrelevant to strategy output |
| TC few-shot examples (good/bad login test case) | TC-level exemplars — strategy needs its own output examples |
| TC quality checklist (2+ steps, no combined actions, pass/fail clarity) | Validates TC quality, not strategy quality |
| Platform tagging rules (iOS biometrics, desktop keyboard shortcuts) | TC-level concern — strategy only notes which platforms are in scope |

---

## Key Distinction

**Reusable:** Logic patterns, reasoning rules, document handling principles, prompt assembly patterns, uncertainty handling philosophy.

**Not reusable:** Code, infrastructure, orchestration, TC-specific formatting, persistence, external integrations.
