# DevRecall

**Every decision has a reason. Never lose it.**

DevRecall recovers engineering choices, rejected alternatives and source evidence from public discussions. Built for Problem 06, Hacktoberfest 2026 — Hack Day Sonipat.

## Stack

- **Frontend:** React.js + Next.js 16 App Router, JavaScript, existing dark responsive interface.
- **Backend:** Express.js 5 on Node.js, JavaScript ES modules.
- **Storage:** SQLite through Node's built-in SQLite API.
- **Inference:** configurable local Ollama open-weight model; default `qwen2.5:3b`.
- **Validation/testing:** Ajv JSON Schema and Node's built-in test runner.

Python and Vite are no longer application dependencies. The existing SQLite schema is retained; upgrading does not reset discussions, message IDs, runs or decision payloads.

## Install and run

Requires **Node.js 22.13+** (tested with 22.20.0), npm, and [Ollama](https://ollama.com/download). Run all commands from the repository root.

```sh
npm ci
cp .env.example .env
```

Start Ollama separately, then install the configured model:

```sh
ollama serve
```

```sh
ollama pull qwen2.5:3b
```

Start both application servers:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Next.js serves the React app and proxies `/api/*` to Express at **http://127.0.0.1:8000**.

Run the servers separately if preferred:

```sh
npm run dev:backend
npm run dev:frontend
```

Production:

```sh
npm run build
npm run start:backend
# In another terminal:
npm run start:frontend
```

Express serves the API; Next.js serves the frontend in both development and production. Keep both on loopback: this is a single-user local tool without authentication.

Configuration in the root `.env`:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
MODEL_TIMEOUT=240
PORT=8000
API_BASE_URL=http://127.0.0.1:8000
# DEVRECALL_DB=/absolute/path/to/devrecall.db
```

The default database remains `backend/devrecall.db` and is ignored by Git. `MODEL_TIMEOUT` is seconds per inference request. Changing API_BASE_URL requires restarting development or rebuilding production; other configuration changes require restarting Express. Next.js reads the same root environment file for its API proxy. The built-in SQLite API is experimental in the tested Node 22 release and emits a warning; it is covered by persistence tests.

## Implemented workflow

1. Paste a public discussion, import structured JSON messages, or import a public GitHub issue/PR.
2. Analyze with the configured local Ollama model. The app never substitutes fixtures for inference.
3. Inspect chosen approaches, alternatives, reasons, status and immutable original-message citations.
4. Search decisions or ask questions grounded in stored evidence and relevant original messages.
5. Export JSON/Markdown or match changed paths to explicit code references.

Imports preserve speaker/URL attribution when supplied. Raw paste is one honestly unattributed message. Failed inference preserves the source and previous successful results. Rerun after connecting/installing the model.

Extraction chunks on message boundaries, uses one general pass and focused objection-message passes, validates schema output with one repair retry, verifies exact quotes and conservatively merges matching technical questions. Outcome promotion requires explicit English outcome vocabulary and a literal approach name in the quote. Unsupported claims remain uncertain. Reasons are preserved as source excerpts; code references survive only when literally quoted.

All API paths remain under `/api`:

| Endpoint | Purpose |
| --- | --- |
| GET /health | API/database health and model availability |
| GET/POST /discussions | List/import discussions |
| GET /discussions/:id | Original messages and extraction runs |
| POST /discussions/:id/analyze | Real inference and evidence validation |
| GET /discussions/:id/decisions | Stored decisions |
| GET /decisions/:id | Decision detail |
| GET /search?q=... | Keyword search |
| POST /ask | Grounded answer or abstention |
| GET /discussions/:id/export?format=json | JSON or Markdown export |
| POST /github/import | Public issue/PR description and issue comments |
| POST /pr-context | Exact cited-path matches |

## Verify

```sh
npm test
npm run build
```

**Migration validation: 15 JavaScript tests passed and the Next.js production build passed.** Tests use actual Express HTTP requests and SQLite, replacing the LLM adapter at the inference boundary. Coverage includes quote checking, uncertainty, schema repair, disagreement, search, exports, persistence, model errors, concurrent analysis, original-message retrieval and cited answers. Adapter transport failure tests use an isolated fake HTTP transport and do not claim real inference.

GitHub Actions installs from the root lockfile and runs these same checks. A remote CI result is not claimed without a configured remote.

Real inference, with the application servers and Ollama running:

```sh
npm run evaluate -- --input examples/synthetic_discussion.json --output examples/node_synthetic_output.json
npm run evaluate -- --input examples/public_discussion.json --output examples/node_sample_output.json
```

The evaluator calls the Express API, stores the discussion/run and saves untouched actual output with model digest and Node runtime metadata. It does not mock the model. The synthetic input is clearly labeled. Original `sample_output.json`, `synthetic_output.json`, `sample_answer.json` and `attempts/` are historical outputs from the earlier implementation, not JavaScript-run claims. See [migration verification](examples/JAVASCRIPT_MIGRATION.md) and [reproduction instructions](examples/HOW_TO_REPRODUCE.md).

## Files

```text
package.json, package-lock.json     npm workspaces and shared commands
backend/
  package.json
  src/
    server.js, app.js               Express lifecycle and routes
    config.js, errors.js            Environment and API errors
    database.js                    Compatible SQLite schema/storage
    schemas.js                     Input and model-output JSON schemas
    llm.js                         Real Ollama adapter
    extraction.js                  Chunking and approach extraction
    evidence.js                    Source validation and uncertainty
    retrieval.js                   Search and grounded Q&A
    github.js                      Public GitHub import
  test/pipeline.test.js             JavaScript unit/integration tests
  scripts/evaluate-discussion.js    Actual inference evaluator
frontend/
  package.json, next.config.mjs
  app/layout.jsx, app/page.jsx      Next.js App Router entry points
  src/App.jsx                      React client workspace
  src/api.js, src/styles.css        API client and visual system
examples/                          Public/synthetic inputs and real outputs
.github/                           CI and PR template
HACKATHON.md, LICENSE, .env.example
PRODUCT.md, DESIGN.md              Product and visual context
```

## Practical limits

- Quote matching proves source presence, **not semantic entailment or consensus**. Interpretations and answers still require human review.
- The small 3B model has limited rejected-alternative recall on the public Python case. The conservative guard keeps questionable outcomes uncertain. No full organizer benchmark pass is claimed; see the [historical evaluation](examples/EVALUATION.md).
- Input bounds: 200,000 characters, 500 messages, 60,000 characters per structured message. Analysis requires each message to fit 22,000 characters. Focused passes prioritize at most eight objection messages per chunk; implicit and non-English objections can be missed.
- Question retrieval is lexical. Broad wording can retrieve unrelated context; the answer validator abstains on invalid citations.
- GitHub import is public and unauthenticated, capped at 400 issue comments. Inline PR reviews, attachments, private repositories and automatic PR diff retrieval are not included.
- Code matching is exact, without semantic compatibility or rename detection. Nothing is posted to upstream repositories.
- No auth, webhooks, vector search or public cloud deployment. Your Ollama endpoint must be reachable by Express.
- The UI loads optional DM Sans from Google Fonts and falls back to system fonts offline. Refreshing returns to Overview, preserving SQLite data.

## Event and AI disclosure

The initial commit `6c9d3b9` contains only the original HACKATHON.md. Work remains on feature branch `feat/devrecall-mvp`; no additional work was committed directly to main. No Git remote was configured, so no public repository, PR merge, event submission or remote CI pass is claimed.

Extraction/answering use Qwen2.5 3B through Ollama; actual model/version details are in HACKATHON.md and run metadata. Coding assistant: OpenAI Codex (exact underlying coding-model version not exposed).

The development Ollama binary/models remain under `/private/tmp/devrecall-ollama`. While those files exist, restart that temporary runtime with:

```sh
OLLAMA_MODELS=/private/tmp/devrecall-ollama/models OLLAMA_HOST=127.0.0.1:11434 /private/tmp/devrecall-ollama/ollama serve
```

Install Ollama normally for persistent use. Fixtures are never automatically seeded.
