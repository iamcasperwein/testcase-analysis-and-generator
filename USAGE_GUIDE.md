# AI-Driven QE Test Case Generator — Usage Guide

## Introduction

The **QE Test Case Generator** is an AI-powered tool that ingests Product Requirements Documents (PRDs), RFCs, and Figma design exports to automatically generate:

1. **Test Analysis** — A structured breakdown of testable areas, risks, and coverage recommendations.
2. **Test Case Drafts** — Ready-to-use test cases organized by section, with preconditions, steps, and expected results.

The tool supports multiple AI agents (Gemini, Claude, GitHub Copilot) and integrates with TestRail for pushing generated test cases directly into your test management system.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | v18 or higher |
| **npm** | v9 or higher |
| **nodemon** | Installed globally (`npm i -g nodemon`) or available via npx |

### AI Provider (at least one required)

| Provider | Required Key |
|----------|-------------|
| Google Gemini | `GEMINI_API_KEY` |
| Anthropic Claude | `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` |
| GitHub Copilot | `GITHUB_TOKEN` + `GITHUB_MODEL` |

### Optional — TestRail Integration

| Key | Description |
|-----|-------------|
| `TESTRAIL_URL` | Your TestRail instance URL (e.g., `https://yourorg.testrail.net`) |
| `TESTRAIL_USERNAME` | TestRail login email |
| `TESTRAIL_PASSWORD` or `TESTRAIL_API_KEY` | TestRail password or API key |
| `TESTRAIL_PROJECT_ID` | Target project ID |
| `TESTRAIL_TESTSUITE_ID` | Target test suite ID |
| `TESTRAIL_SUITE_ID` | Alternative suite ID key |

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/qe-test-case-generator.git
cd qe-test-case-generator
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
touch .env
```

Add your API keys (at minimum, one AI provider):

```env
PORT=9009

# AI Providers (configure at least one)
GEMINI_API_KEY=your-google-ai-api-key
# CLAUDE_API_KEY=your-anthropic-api-key
# GITHUB_TOKEN=your-github-token
# GITHUB_MODEL=gpt-4o

# TestRail Integration (optional)
# TESTRAIL_URL=https://yourorg.testrail.net
# TESTRAIL_USERNAME=your-email@example.com
# TESTRAIL_PASSWORD=your-password-or-api-key
# TESTRAIL_PROJECT_ID=1
# TESTRAIL_TESTSUITE_ID=1
```

> **Tip:** You can also manage environment variables from the **Settings** page in the UI after starting the server.

---

## Running the Server

```bash
npm start
```

The server starts on the configured port (default: `9009`). Open your browser:

```
http://localhost:9009
```

The application serves both the API backend and the frontend from a single process — no separate frontend build required.

---

## Core Workflow

### Step 1: Submit Artifacts (Form Page)

Navigate to **Form** (`http://localhost:9009/#form`) and provide:

| Field | Description | Required |
|-------|-------------|----------|
| **QA Agent** | Select the AI model: Gemini, Claude, or GitHub Copilot | Yes |
| **Project / Feature Name** | A descriptive name for the feature under test | Yes |
| **Primary Artifact Type** | PRD, RFC, Figma, User Story, or Other | Yes |
| **PRD / Specs File** | Upload the primary document (`.pdf`, `.txt`, `.md`, `.doc`, `.docx`) | Yes |
| **RFC File** | Upload an optional RFC for additional architectural context | No |
| **Figma Export File** | Upload an exported Figma design (`.txt`, `.md`, `.json`, `.pdf`, `.png`) | No |
| **Additional Context** | Free-text notes for the AI — key flows, constraints, focus areas | No |

Click **Submit for Analysis**. The tool immediately returns a **Prompt ID** and processes in the background.

### Step 2: Monitor Progress (Dashboard)

Navigate to **Dashboard** (`http://localhost:9009/#dashboard`) to see:

- Prompt status: `RECEIVED` → `IN_PROGRESS` → `COMPLETED` or `FAILED`
- Test case counts, turnaround time, and creation date
- **Actions per prompt:**
  - 📊 View Analysis
  - ☑️ View Test Cases
  - 🖥️ View Processing Log (real-time terminal view)
  - ⚠️ View Failure Details (on failed prompts)

### Step 3: Review Test Analysis

Navigate to **Test Analysis** (`http://localhost:9009/#test-analysis`):

- Select a prompt from the dropdown
- Browse the structured analysis with a table of contents
- Download the analysis as a Markdown file

### Step 4: Review & Manage Test Cases

Navigate to **Test Cases** (`http://localhost:9009/#testcases`):

- Select a prompt from the dropdown
- Browse test cases organized by section
- **Per test case actions:** View details, Edit, Delete
- **Bulk actions:** Select multiple → Move section, Post to TestRail, Delete
- Filter by section, search by title/ID, toggle column visibility

#### Test Case Steps Format

Each test case step is a structured object with:
- **Action** — The user action to perform
- **Expected Result** — The expected outcome for that specific step (or "N/A" if not applicable)

The Edit modal provides a visual step editor where you can:
- Add/remove steps
- Reorder steps with up/down arrows
- Edit action and expected result per step independently

### Step 5: Post to TestRail (Optional)

From the Test Cases page:

1. Enable **Select** mode
2. Choose test cases (or select entire sections)
3. Click **Post to TestRail**
4. Review the summary (new sections to create, existing sections to reuse)
5. Confirm — test cases are posted and marked with a TestRail badge

---

## Project Structure

```
qe-test-case-generator/
├── app.js                    # Express server entry point
├── package.json
├── .env                      # Environment variables (git-ignored)
├── controller/               # Route handlers
│   ├── Dashboard.js
│   ├── QAgent.js
│   ├── Settings.js
│   ├── TestCase.js
│   └── Testrail.js
├── service/                  # Business logic
│   ├── ClaudeService.js
│   ├── CopilotService.js
│   ├── GeminiService.js
│   ├── QAgentService.js
│   ├── DashboardService.js
│   ├── SettingsService.js
│   ├── TestCaseService.js
│   └── TestrailService.js
├── routes/                   # Express routers
├── prompts/                  # AI prompt templates
│   ├── index.js
│   └── testCaseGeneration.js
├── utils/                    # Utilities
│   ├── AppLogger.js
│   ├── BaseUtils.js
│   ├── FileExtractor.js
│   └── FileReader.js
├── public/                   # Frontend (served statically)
│   ├── index.html
│   ├── css/index.css
│   └── js/index.js
└── data/                     # Runtime data (git-ignored)
    ├── promptdata.json       # Prompt records
    ├── uploads/              # Uploaded files
    ├── analyze/              # Generated analysis files
    ├── testcases/            # Generated test case JSON
    └── runtime/              # Processing logs
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/generate/ask` | Submit artifacts for AI analysis (multipart form) |
| `GET` | `/dashboard` | Get dashboard summary with prompt stats |
| `GET` | `/dashboard/prompts` | List all prompts (for dropdowns) |
| `GET` | `/dashboard/log/:promptId` | Get processing log for a prompt |
| `GET` | `/testcase/:promptId` | Get generated test cases |
| `GET` | `/testcase/getAnalyzeResult/:promptId` | Get analysis document |
| `POST` | `/testcase/edit?testcaseId=X&promptID=Y` | Edit a test case |
| `DELETE` | `/testcase/deleteTestCase/:promptId/:tcId` | Delete a test case |
| `GET` | `/testrail/getsections` | Fetch sections from TestRail |
| `POST` | `/testrail/posttestcases` | Post test cases to TestRail |
| `GET` | `/settings` | List current environment settings |
| `GET` | `/settings/key` | List available setting keys |
| `POST` | `/settings` | Save multiple settings |
| `PUT` | `/settings/:key` | Update a single setting |
| `DELETE` | `/settings/:key` | Delete a setting |

---

## URL Hash Navigation

The frontend uses hash-based routing. Bookmarkable URLs:

| URL | Page |
|-----|------|
| `http://localhost:9009/#dashboard` | Dashboard |
| `http://localhost:9009/#form` | Submit Artifacts |
| `http://localhost:9009/#test-analysis` | Test Analysis Viewer |
| `http://localhost:9009/#testcases` | Test Cases Manager |
| `http://localhost:9009/#settings` | Environment Settings |

---

## Example: Basic Usage

```bash
# 1. Start the server
npm start

# 2. Open browser
open http://localhost:9009/#form

# 3. Fill in the form:
#    - QA Agent: Gemini
#    - Project Name: "Login Flow Revamp"
#    - Upload: PRD_Login_Flow.pdf
#    - Context: "Focus on OAuth2 flows and error handling"

# 4. Click "Submit for Analysis"
#    → Prompt ID is returned immediately

# 5. Monitor at http://localhost:9009/#dashboard
#    → Watch status change from RECEIVED → IN_PROGRESS → COMPLETED

# 6. View results at http://localhost:9009/#testcases
#    → Browse generated test cases grouped by section

# 7. (Optional) Select test cases → Post to TestRail
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `GEMINI_API_KEY is not configured` | Add your Google AI API key in Settings or `.env` |
| `503 Service Unavailable` | The AI model is experiencing high demand. Retry later. |
| `CLAUDE_API_KEY or ANTHROPIC_API_KEY is required` | Configure Claude key in Settings if using Claude agent |
| Server won't start | Ensure `nodemon` is installed: `npm i -g nodemon` |
| No test cases generated | Check the Processing Log (terminal icon) in Dashboard for errors |

---

## License

Internal use. See repository license file for details.