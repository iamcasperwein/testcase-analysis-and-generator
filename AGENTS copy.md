# QE Test Case Generator

## Project Overview

Node.js/Express backend that converts product specs (PRD, RFC, Figma) into structured QA test cases using AI (Claude, Gemini, GitHub Copilot). Frontend is vanilla JS in `public/`.

## Key Architecture

- **Layered**: Routes → Controllers → Services → Utils/FileStore
- **Flat data model**: Test cases stored as flat array with per-TC section metadata (`.section._default`, `.section.{platform}`)
- **File-based persistence**: `data/promptdata.json`, `data/analyze/`, `data/testcases/`, `data/figma/`
- **AI pipeline**: Two-stage (Analysis → Test Cases) with optional REVIEW checkpoint between stages

## Skills Documentation

Read `.opencode/skills/` for detailed reference on specific subsystems:
- `ai-pipeline-submission.md` — Status flow, endpoints, Figma enrichment, auto-generate toggle
- `qagent-service.md` — QAgentService orchestrator: agent dispatch, document enrichment, normalization, file locking
- `lark-service.md` — LarkService: URL parsing, singleton client, markdown/raw content fetching, wiki resolution
- `figma-service.md` — FigmaService: URL parsing, node extraction, frame images, AI context formatting
- `flat-data-model.md` — Core data model (flat TC array with section metadata)
- `frontend-testcase.md` — FE loading, rendering, section management, platform resolution
- `testanalysis-page.md` — Test Analysis page: view/edit modes, split view, live preview, generate trigger
- `testcase-service.md` — CRUD patterns in TestCaseService
- `testrail-service.md` — TestRail posting, section resolution, per-platform sync
- `testing-testcase.md` — Edge cases checklist, smoke test procedure

## Mandatory Rules

### Skills & Documentation Updates

CRITICAL: After EVERY code change (add, modify, revert, or delete), you MUST:

1. **Update `.opencode/skills/`** — If the change affects any subsystem documented in a skill file, update that skill file to reflect the new behavior. If a new subsystem is introduced, create a new skill file.
2. **Update `README.md`** — If the change affects any user-facing behavior, API endpoint, status flow, configuration, or architecture documented in the README, update the README accordingly.
3. **Do NOT ask** — Perform these updates proactively as part of completing the task. Never wait for the user to remind you.

### Code Conventions

- Use Bloom design system components for UI (toggle cards, modals, buttons)
- Accepted document links: Lark and Figma URLs only (error code: `INVALID_DOC_URL`)
- Section IDs generated server-side only (`sec_${ulid()}`) — never from AI output
- All documents treated with equal priority (no weighting system)
- Status flow: `RECEIVED → ANALYZING → REVIEW → GENERATING → COMPLETED/FAILED`
- `autoGenerateTestCases` default = `false` (review mode is default)

### Build & Run

```bash
npm install
npm start        # nodemon, port 9009
```

No test suite currently. Verify changes by:
1. `node -e "require('./service/QAgentService')"` — module loads without error
2. `node -e "require('./public/js/index.js')"` won't work (browser JS), check syntax manually
3. Start server and test endpoints via curl or browser
