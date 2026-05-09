# QE Test Case Generator — AI Strategy & Improvement Proposal

> Prepared for the QE Test Case Generator project
> Goal: Maximize AI agent effectiveness for test analysis and test case generation, despite model-tier constraints

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Core Problems Identified](#2-core-problems-identified)
3. [Proposal 1: Prompt Engineering Overhaul](#3-proposal-1-prompt-engineering-overhaul)
4. [Proposal 2: Context Management Strategy](#4-proposal-2-context-management-strategy)
5. [Proposal 3: Multi-Stage Pipeline Redesign](#5-proposal-3-multi-stage-pipeline-redesign)
6. [Proposal 4: Model Routing & Constraint Handling](#6-proposal-4-model-routing--constraint-handling)
7. [Proposal 5: AI-Driven Development Tooling](#7-proposal-5-ai-driven-development-tooling)
8. [Proposal 6: Quality Feedback Loop](#8-proposal-6-quality-feedback-loop)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Do's and Don'ts for AI Communication](#10-dos-and-donts-for-ai-communication)

---

## 1. Current State Assessment

### What works well

- **Two-stage pipeline** (analyze then generate) — this is correct. Grounding test cases on a prior analysis produces higher quality output than single-shot generation.
- **Strategy pattern** for agent selection — clean architecture for swapping providers.
- **Structured JSON schema** in the generation prompt — gives the AI a clear target format.
- **Test case title convention** (Object + Expectation + Condition) — good practice for consistent naming.

### What needs improvement

| Area | Current State | Impact |
|---|---|---|
| **No system prompt** | All instructions sent as user message | Models can't distinguish role/persona from task content — reduces instruction-following accuracy |
| **No temperature control for Gemini** | SDK default (likely 1.0) | Inconsistent, creative outputs instead of deterministic test cases |
| **File attachments ignored for Claude/Copilot** | Binary files silently dropped | PDFs/images not processed when using Claude or Copilot — silent data loss |
| **No token/context management** | No counting, no truncation, no chunking | Large PRDs silently exceed context window → API error → job fails |
| **No retry on transient errors** | Single attempt, then FAILED | 429/503 from providers kills the job unnecessarily |
| **Hardcoded model names** | `resolveModelName` result never passed to services | `GEMINI_MODEL` / `CLAUDE_MODEL` env vars have no effect |
| **Identical prompts for all providers** | Same text regardless of model capabilities | Misses provider-specific optimizations (e.g., Claude's XML preference, Gemini's multimodal strength) |
| **No few-shot examples** | Zero-shot generation only | Lower quality from smaller/cheaper models that need demonstration |
| **No output validation** | JSON parsed but never schema-validated | Malformed test cases silently pass through |

---

## 2. Core Problems Identified

### Problem A: Model Tier Constraint

You cannot use premium models (Claude Opus, GPT-4o, etc.) through the company's GitHub Copilot tier. This means you're working with models like `gpt-4.1-mini`, `claude-sonnet`, and `gemini-2.5-flash` — capable models, but they need better prompting to perform at the level of premium models.

**The key insight:** The gap between a cheap model with great prompting and an expensive model with basic prompting is smaller than most people think. The investment should go into prompt engineering, context management, and pipeline design — not model upgrades.

### Problem B: AI Doesn't Understand the Task Deeply

The current prompts tell the AI *what format* to produce but not *how to think* about testing. There's no:
- Domain expertise injection (what makes a good test case vs a bad one)
- Reasoning scaffolding (chain-of-thought for analysis)
- Quality criteria (how to self-evaluate output)
- Negative examples (common mistakes to avoid)

### Problem C: Context Window Waste

The prompts embed full document text inline, including boilerplate. There's no:
- Relevance filtering (extracting only testable requirements)
- Chunking strategy for large docs
- Priority ordering of context (most important information first)

---

## 3. Proposal 1: Prompt Engineering Overhaul

### 3.1 Adopt System Prompts

All three providers support system prompts. Use them to separate the AI's persona/expertise from the task content.

**Current (everything in one user message):**
```
You are a Senior QE Engineer.
Generate test cases for...
[entire document content]
```

**Proposed:**

```
// System prompt — sets expertise and constraints
SYSTEM:
You are a Senior QE Engineer with 10+ years of experience in test planning,
test case design, and quality assessment. You specialize in deriving
comprehensive, actionable test cases from product specifications.

Your core principles:
1. Every test case must be independently executable by a manual QA tester
   who has never seen the PRD.
2. Steps must be atomic — one action per step, one verification per expected result.
3. Cover the "testing pyramid": happy path first, then error cases, then edge cases.
4. If a requirement is ambiguous, create a test case that surfaces the ambiguity
   rather than assuming intent.
5. Never invent features or behaviors not stated in the source documents.

// User prompt — the actual task + context
USER:
[task instructions + documents]
```

**Why this matters for cheaper models:** System prompts receive higher attention weight in most architectures. The model will adhere more consistently to the persona and rules when they're in the system slot.

### 3.2 Add Chain-of-Thought to Analysis

For the analysis stage, instruct the model to reason step-by-step before producing output. This is the single highest-impact technique for improving output quality on mid-tier models.

```
Before writing the analysis, work through these steps internally:

Step 1: Identify every functional requirement in the PRD.
        List each as a single sentence.
Step 2: For each requirement, identify:
        - The happy path behavior
        - At least one failure mode
        - Any boundary conditions
Step 3: Cross-reference with RFC (if provided) for implementation constraints
        that create additional test scenarios.
Step 4: Cross-reference with Figma (if provided) for UI states, transitions,
        and visual validation points.
Step 5: Group related requirements into logical test sections.
Step 6: Identify any gaps — requirements that are vague, contradictory,
        or missing acceptance criteria.

Now write the analysis document following the structure below.
```

### 3.3 Add Few-Shot Examples

Include 1-2 examples of ideal test cases in the prompt. This is critical for cheaper models.

```
Here is an example of a well-written test case:

{
    "id": "TC-001",
    "title": "Login form should display error message when user enters invalid email format",
    "type": "negative",
    "priority": "high",
    "preconditions": [
        "User is on the login page",
        "User has not authenticated"
    ],
    "steps": [
        {
            "content": "Enter 'invalid-email' (without @ symbol) in the email field",
            "expected": "Email field accepts the input"
        },
        {
            "content": "Enter 'ValidPass123!' in the password field",
            "expected": "Password field accepts the input and masks characters"
        },
        {
            "content": "Click the 'Login' button",
            "expected": "Error message 'Please enter a valid email address' is displayed below the email field. Login is not performed."
        }
    ],
    "expectedResult": "User sees inline validation error for invalid email format and is not logged in"
}

Here is an example of a POORLY written test case (avoid this):

{
    "id": "TC-001",
    "title": "Test login",
    "type": "positive",
    "priority": "medium",
    "preconditions": ["User exists"],
    "steps": [
        {
            "content": "Login with invalid data",
            "expected": "Error shown"
        }
    ],
    "expectedResult": "Should show error"
}
Problems: vague title, unclear steps, no specific test data, ambiguous expected results.
```

### 3.4 Add Self-Evaluation Instruction

Ask the model to check its own output before responding. This acts as a quality gate without requiring a separate API call.

```
Before returning your response, verify:
- [ ] Every test case has at least 2 steps
- [ ] No step combines multiple actions (e.g., "Enter email and click submit")
- [ ] Every expected result is specific enough to pass/fail unambiguously
- [ ] Each section has at least one negative or edge case
- [ ] Test case titles follow the Object + Expectation + Condition pattern
- [ ] No test case references information not present in the source documents

If any check fails, revise the affected test cases before responding.
```

---

## 4. Proposal 2: Context Management Strategy

### 4.1 Token Counting

Add `tiktoken` (or a lightweight equivalent) to count tokens before sending:

```js
const MODEL_CONTEXT_LIMITS = {
    "models/gemini-2.5-flash": 1_000_000,  // 1M context
    "claude-sonnet-4-6":        200_000,     // 200K context
    "openai/gpt-4.1-mini":      128_000,     // 128K context
};

const estimateTokens = (text) => Math.ceil(text.length / 3.5); // rough approximation

const validateContextFits = (prompt, model) => {
    const estimated = estimateTokens(prompt);
    const limit = MODEL_CONTEXT_LIMITS[model] || 128_000;
    const safeLimit = Math.floor(limit * 0.85); // 15% buffer for output
    if (estimated > safeLimit) {
        return { fits: false, estimated, limit: safeLimit, excess: estimated - safeLimit };
    }
    return { fits: true, estimated, limit: safeLimit };
};
```

### 4.2 Document Chunking for Large PRDs

When a document exceeds the safe context limit, chunk it and run multiple analysis passes:

```
Strategy:
1. Split document into logical sections (by headings, page breaks)
2. Run analysis on each chunk with shared context header
3. Merge analyses before test case generation
```

This is especially important for Copilot/GPT-4.1-mini with its 128K limit.

### 4.3 Context Priority Ordering

Restructure the prompt to put the most important information first (models attend more to the beginning and end of context):

```
Order:
1. System prompt (persona + rules)
2. Output schema + examples
3. Document Inventory (what's available)
4. PRD content (primary source)
5. Testing Analysis context (for stage 2)
6. RFC content (secondary)
7. Figma content (tertiary)
8. Additional documents (supplementary)
```

Currently, the schema and rules are at the **end** of the prompt. For mid-tier models, this means the instructions are furthest from the model's strongest attention window. Move them to the beginning, right after the system prompt.

---

## 5. Proposal 3: Multi-Stage Pipeline Redesign

### Current: 2 Stages

```
Documents → [Stage 1: Analysis] → [Stage 2: Test Cases] → Done
```

### Proposed: 4 Stages

```
Documents → [Stage 1: Requirement Extraction]
          → [Stage 2: Test Analysis]
          → [Stage 3: Test Case Generation]
          → [Stage 4: Self-Review & Refinement]
```

#### Stage 1: Requirement Extraction (NEW)

Purpose: Reduce noise. Extract only testable requirements from the PRD/RFC/Figma.

```
Prompt: "Extract every testable requirement from the following document.
For each requirement, provide:
- Requirement ID (REQ-001, REQ-002, ...)
- Source (PRD section name or page)
- Requirement statement (one clear sentence)
- Acceptance criteria (if stated, otherwise mark as 'Implicit')
- Testability: High / Medium / Low

Return as a numbered list."
```

**Why:** This forces the model to read carefully before generating. It also produces a structured intermediate artifact that can be reviewed by the QA engineer before test case generation begins — giving the human a checkpoint.

#### Stage 2: Test Analysis (EXISTING, improved)

Same as current but now grounded on the extracted requirements list instead of raw document text. This significantly reduces hallucination.

#### Stage 3: Test Case Generation (EXISTING, improved)

Same as current but with few-shot examples, self-evaluation, and the requirements list as additional context.

#### Stage 4: Self-Review & Refinement (NEW)

After generation, run one more call:

```
Prompt: "Review the following test cases against the source requirements.
For each test case, check:
1. Does it map to a stated requirement? If not, flag it as 'UNMAPPED'.
2. Are the steps specific enough for a tester to execute without ambiguity?
3. Is there a test case for the negative/error path of each requirement?
4. Are there any requirements with no test coverage?

Return the revised test case JSON with any corrections applied.
Also return a coverage summary:
- Requirements covered: X/Y
- Requirements with no test coverage: [list]
- Unmapped test cases (testing something not in requirements): [list]"
```

**Why:** This catches the most common AI failure — generating test cases for things that aren't in the PRD, or missing requirements entirely. The coverage summary gives QAs immediate visibility into gaps.

**Cost consideration:** This adds 2 more API calls per job. With mid-tier models, the cost per call is low (fractions of a cent). The quality improvement is worth it.

---

## 6. Proposal 4: Model Routing & Constraint Handling

### 6.1 Fix Hardcoded Models (Bug)

The immediate fix: pass the resolved model name to each service.

```js
// QAgentService.js — pass model to agent call
const agentResult = await agentFn(prompt, {
    ...options,
    model: resolvedModel,  // currently not passed
});

// GeminiService.js — use passed model instead of hardcoded
const generateFromPrompt = async (prompt, options = {}) => {
    const model = options.model || "models/gemini-2.5-flash";
    // ...
};
```

### 6.2 Provider-Aware Prompt Optimization

Different models respond better to different prompt styles:

| Provider | Optimization |
|---|---|
| **Claude** | Use XML tags for structure (`<requirements>`, `<test-cases>`). Claude is trained to respect XML boundaries. Add `thinking` parameter for extended thinking on Sonnet. |
| **Gemini** | Leverage multimodal — send PDFs/images as file attachments (already supported). Set explicit temperature and top-p. |
| **Copilot/GPT** | Use markdown structure with clear `###` sections. GPT models respond well to numbered instruction lists. |

Example for Claude:

```xml
<instructions>
Generate test cases following the schema in <output-schema>.
Ground all test cases in the requirements listed in <requirements>.
</instructions>

<requirements>
${extractedRequirements}
</requirements>

<source-documents>
${documentContent}
</source-documents>

<output-schema>
${jsonSchema}
</output-schema>
```

### 6.3 Smart Model Selection

When the user doesn't specify an agent, route based on the task characteristics:

```js
const selectOptimalAgent = (payload) => {
    const hasBinaryFiles = payload.additionalDocuments?.some(d =>
        /\.(pdf|png|jpg|jpeg)$/i.test(d.path)
    );

    // Gemini handles binary files natively — prefer it when PDFs/images are involved
    if (hasBinaryFiles) return "gemini";

    // For text-only, prefer the agent with the best text reasoning at the tier
    return process.env.DEFAULT_AGENT || "claude";
};
```

### 6.4 File Attachment Support for Claude and Copilot

Currently, Claude and Copilot silently ignore file attachments. Fix this:

**Claude** supports base64 PDF/image attachments in the messages API:
```js
messages: [{
    role: "user",
    content: [
        { type: "text", text: prompt },
        {
            type: "document",
            source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Content
            }
        }
    ]
}]
```

**Copilot/GPT** does not natively support PDF attachments. For this provider, ensure PDF text extraction happens before prompt building (which it partially does already via `enrichDocumentContents`), and include a clear note in the prompt that binary content could not be processed.

---

## 7. Proposal 5: AI-Driven Development Tooling

These are project-level files that help AI coding assistants (Copilot, Cursor, Claude Code, OpenCode) work effectively on this codebase.

### 7.1 AI Instructions File

Create `.github/copilot-instructions.md` and `CLAUDE.md` (same content, different tools read different files):

```markdown
# Project: QE Test Case Generator

## Architecture
Layered N-tier: Routes → Controller → Service → Utils / FileStore
- Controllers: HTTP validation and response shaping only. No business logic.
- Services: All business logic. Services never import Express or req/res.
- Utils: Pure functions, no side effects except FileReader.

## Code Style
- JavaScript (Node.js), CommonJS (`require`/`module.exports`)
- No TypeScript
- Tab indentation
- PascalCase for file names (e.g., QAgentService.js)
- camelCase for variables and functions
- No semicolons is acceptable, but be consistent within a file

## Adding a New AI Agent
1. Create `service/NewAgentService.js` following `ClaudeService.js` pattern
2. Add entry to `AGENTS` map in `service/QAgentService.js`
3. Add model env var to `DEFAULT_SETTING_KEYS` in `service/SettingsService.js`
4. Add model to `DEFAULT_MODELS` in `service/QAgentService.js`

## Adding a New Route
1. Create router in `routes/`
2. Create controller in `controller/`
3. Create service in `service/`
4. Mount router in `app.js`

## Key Files
- `service/QAgentService.js` — AI pipeline orchestrator
- `prompts/testCaseGeneration.js` — All prompt templates
- `utils/FileReader.js` — File-based persistence (data/ directory)

## Do Not
- Add database dependencies (file-based storage is intentional for now)
- Commit .env files
- Put business logic in controllers
- Use TypeScript or ES modules
```

### 7.2 Linter & Formatter

```bash
npm install --save-dev eslint prettier eslint-config-prettier
```

Minimal `.eslintrc.js`:
```js
module.exports = {
    env: { node: true, es2021: true },
    extends: ["eslint:recommended", "prettier"],
    parserOptions: { ecmaVersion: 2022 },
    rules: {
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        "no-console": "off",
    },
};
```

### 7.3 Basic Test Setup

```bash
npm install --save-dev jest
```

Start with smoke tests for the most critical path:

```js
// __tests__/prompts.test.js
const { buildTestCaseGenerationPrompt } = require("../prompts/testCaseGeneration");

test("prompt includes feature name", () => {
    const result = buildTestCaseGenerationPrompt({
        feature: "User Login",
        documents: { prd: { name: "prd.md", content: "Login flow" } }
    });
    expect(result).toContain("User Login");
});
```

This gives AI tools a `npm test` command to verify changes.

---

## 8. Proposal 6: Quality Feedback Loop

### 8.1 Track AI Output Quality

Add a simple rating mechanism. When a QA engineer edits, moves, or deletes a generated test case, log that action:

```js
// In TestCaseService.editTestCase
const edit = {
    promptId,
    testcaseId,
    action: "edit", // or "delete", "move"
    fieldsChanged: Object.keys(changes),
    timestamp: new Date().toISOString(),
};
```

Over time, this data reveals:
- Which types of test cases get edited most (quality signal)
- Which sections get deleted entirely (hallucination signal)
- Which prompt patterns produce test cases that are used as-is (success signal)

### 8.2 Prompt Versioning

Version your prompts so you can A/B test changes:

```js
const PROMPT_VERSION = "v2.1";

// Include in the prompt record
const record = {
    promptId,
    promptVersion: PROMPT_VERSION,
    agent,
    model,
    // ...
};
```

This lets you compare output quality across prompt versions.

### 8.3 Output Schema Validation

After JSON extraction, validate against the expected schema before saving:

```js
const validateTestCaseSchema = (data) => {
    const errors = [];
    if (!data.testCases || !Array.isArray(data.testCases)) {
        errors.push("Missing testCases array");
    }
    data.testCases?.forEach((section, si) => {
        if (!section.section) errors.push(`Section ${si}: missing section name`);
        section.testCases?.forEach((tc, ti) => {
            if (!tc.title) errors.push(`Section ${si}, TC ${ti}: missing title`);
            if (!tc.steps?.length) errors.push(`Section ${si}, TC ${ti}: no steps`);
            tc.steps?.forEach((step, stepi) => {
                if (!step.content) errors.push(`Section ${si}, TC ${ti}, Step ${stepi}: missing content`);
                if (!step.expected) errors.push(`Section ${si}, TC ${ti}, Step ${stepi}: missing expected`);
            });
        });
    });
    return { valid: errors.length === 0, errors };
};
```

If validation fails, you could either:
- Re-prompt once with the errors ("Fix these issues in your output: ...")
- Save with a `quality: "partial"` flag for human review

---

## 9. Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

These require minimal code changes and have immediate impact:

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | Add system prompts to all 3 providers | High — better instruction following | Small — add `system` field to API calls |
| 2 | Set temperature=0.2 for Gemini | High — consistent outputs | Trivial — one line |
| 3 | Fix hardcoded model names | High — env vars actually work | Small — pass `model` param through |
| 4 | Add few-shot examples to test case prompt | High — better output from cheap models | Small — add example JSON to prompt |
| 5 | Add self-evaluation checklist to prompts | Medium — catches obvious errors | Trivial — append text to prompt |
| 6 | Add token estimation + context limit check | Medium — prevents silent failures | Small — utility function |

### Phase 2: Pipeline Improvements (3-5 days)

| # | Change | Impact | Effort |
|---|---|---|---|
| 7 | Add Stage 1: Requirement Extraction | High — reduces hallucination, adds human checkpoint | Medium — new prompt + pipeline step |
| 8 | Add Stage 4: Self-Review | High — catches coverage gaps | Medium — new prompt + pipeline step |
| 9 | Provider-specific prompt formatting (XML for Claude, etc.) | Medium — better model utilization | Medium — prompt adapter layer |
| 10 | Claude PDF attachment support | High — Claude can read PDFs directly | Small — update API call format |
| 11 | Output schema validation | Medium — catches malformed output | Small — validation function |

### Phase 3: Infrastructure (1-2 weeks)

| # | Change | Impact | Effort |
|---|---|---|---|
| 12 | Retry logic with exponential backoff | Medium — handles transient failures | Medium |
| 13 | Prompt versioning | Medium — enables A/B testing | Small |
| 14 | Edit tracking / quality feedback loop | Medium — data for prompt improvement | Medium |
| 15 | AI development tooling (copilot-instructions, eslint, tests) | Medium — better AI-assisted development | Medium |
| 16 | Document chunking for large PRDs | Medium — handles large docs on smaller context models | Large |

### Phase 4: Advanced (2-4 weeks)

| # | Change | Impact | Effort |
|---|---|---|---|
| 17 | Smart model routing based on task characteristics | Medium | Medium |
| 18 | Streaming responses (SSE to frontend) | UX improvement | Large |
| 19 | Prompt template management UI | Maintainability | Large |
| 20 | Requirement traceability matrix | High value for QA teams | Large |

---

## 10. Do's and Don'ts for AI Communication

### Do

| Practice | Why |
|---|---|
| **Use system prompts** | Establishes persona with higher attention weight |
| **Set temperature 0.1-0.3 for structured output** | Reduces randomness, increases JSON reliability |
| **Include 1-2 few-shot examples** | Most impactful technique for mid-tier models |
| **Use chain-of-thought ("think step by step")** | Dramatically improves reasoning quality |
| **Put instructions before content** | Models attend more strongly to the start of context |
| **Specify output format explicitly with schema** | Reduces format errors |
| **Add self-evaluation criteria** | Free quality gate — no extra API call |
| **Count tokens before sending** | Prevents silent context overflow |
| **Validate output schema after receiving** | Catches malformed responses |
| **Version your prompts** | Enables regression testing and A/B comparison |
| **Log the full prompt sent (in debug mode)** | Essential for debugging AI behavior |
| **Use provider-specific formatting** | XML for Claude, markdown for GPT, multimodal for Gemini |
| **Set `max_tokens` explicitly** | Prevents truncated output |

### Don't

| Anti-pattern | Why |
|---|---|
| **Don't send everything as a single user message** | Wastes the system prompt slot |
| **Don't use temperature > 0.5 for structured output** | Produces inconsistent/creative JSON that breaks parsing |
| **Don't assume the model read the whole document** | Models skip content in long contexts — put key info at top and bottom |
| **Don't silently drop file attachments** | Current Claude/Copilot behavior — fails without warning |
| **Don't retry the exact same prompt on failure** | If it failed once, it'll likely fail again — modify or truncate |
| **Don't hardcode model names in service files** | Makes env configuration useless |
| **Don't send identical prompts to all providers** | Each model family has different strengths |
| **Don't trust AI output without validation** | Always validate schema, especially JSON |
| **Don't ignore context window limits** | "Hope it fits" is not a strategy |
| **Don't put instructions at the end of a long prompt** | They'll get less attention from the model |
| **Don't include irrelevant document boilerplate** | Wastes context, dilutes signal |
| **Don't generate everything in one shot** | Multi-stage pipelines outperform single-shot on complex tasks |

---

## Summary

The biggest wins for this project, ranked by impact-to-effort ratio:

1. **System prompts + temperature control** — 30 minutes of work, immediate quality improvement
2. **Few-shot examples in prompts** — 1 hour of work, significant quality jump on cheaper models
3. **Fix hardcoded model names** — 30 minutes, makes configuration actually work
4. **Chain-of-thought for analysis** — 1 hour, better reasoning from all models
5. **Requirement extraction stage** — half a day, reduces hallucination and adds human checkpoint
6. **Self-review stage** — half a day, catches coverage gaps automatically

The theme across all proposals: **invest in prompt engineering and pipeline design, not model upgrades.** A well-prompted `gemini-2.5-flash` or `claude-sonnet` will outperform a poorly-prompted premium model for structured tasks like test case generation.

---

_This proposal was prepared based on a full code review of the QE Test Case Generator codebase._
