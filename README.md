# DevRecall

Recover the **why** behind a public GitHub repository: index pull requests and their conversations, extract engineering decisions with your selected open-weight model, and ask repository-specific questions with exact GitHub citations.

React + Vite + Tailwind CSS · Node.js + Express + TypeScript · SQLite + FTS5

## Run locally

Requires Node.js **22.13+** (Node 22 LTS recommended), npm, and disk space for your SQLite database. Native SQLite bindings may need a C++ toolchain if a prebuilt binary is unavailable.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open [DevRecall](http://127.0.0.1:5174). The API listens on `127.0.0.1:3001`. Port 5174 is intentional: another application already occupied 5173 during development. The frontend fails clearly if its port is busy. Production serves both UI and API from Express:

```sh
npm run build
npm start
```

Then open [the production app](http://127.0.0.1:3001). The database defaults to `data/devrecall.db` at the project root, independent of the working directory. Set an absolute `DATABASE_PATH` to relocate it. Run **one API/worker process per database**; this local MVP does not coordinate distributed workers.

## GitHub access

Set `GITHUB_TOKEN` privately in `.env` for practical indexing. Use public read-only access; the app rejects repositories marked private even if your token can read them. No repository code is cloned or executed, and DevRecall never posts comments or issues.

GitHub allows a small unauthenticated request budget, shared with the machine/network. The implementation handles primary and secondary rate limits, displays the error and retry time, and persists its cursor. A rate limit during initial verification means the repository cannot yet be added; retry after reset or configure a token. Tokens remain in the backend and never use a `VITE_` variable.

## Choose an open-weight model

**No model is selected or downloaded automatically.** GitHub ingestion works without AI. Extraction then stops at an honest `Partial / AI not configured` state; chat returns `AI_NOT_CONFIGURED`, and the dashboard provides setup instructions.

For an already installed Ollama model of your choice:

```dotenv
AI_PROVIDER=ollama
AI_MODEL=your-installed-model-name
AI_BASE_URL=http://127.0.0.1:11434
```

For a self-hosted vLLM, llama.cpp, or other compatible server:

```dotenv
AI_PROVIDER=openai-compatible
AI_MODEL=your-served-model-name
AI_BASE_URL=http://127.0.0.1:8000/v1
AI_API_KEY=
```

Select an open-weight model whose license and structured-JSON capability suit your use. Restart after changing `.env`, then choose **Resume analysis**. Use **Re-analyze all decisions** (brain icon beside Sync) to force re-extraction, including already analyzed PRs. Provider errors, invalid JSON, missing sources, wrong-repository evidence, and fabricated quotes fail closed rather than producing a fake answer. Model-generated paraphrases still require human judgment: exact source provenance does not prove semantic entailment.

`AI_CONTEXT_CHARS` bounds source text per extraction chunk / chat context; `AI_TIMEOUT_MS` bounds each model request. Long source text is split completely during extraction. Q&A retrieves query-centered passages so late matches are retained. Chunking can separate a proposal from its later resolution; uncertain output and direct evidence inspection remain important.

## Walkthrough

1. Select `pallets/flask`, `django/django`, or `python/cpython` in the sidebar. All three begin **Not analyzed**, with no fictional metrics.
2. Choose **Analyze Repository**, verify its real GitHub metadata, then analyze. Or add any public `https://github.com/owner/repo` URL; trailing `/` and `.git` are accepted.
3. Watch saved progress. All PR states and every accessible API page are traversed; comments include PR discussion comments, review bodies, and inline review comments. Large repositories require substantial API/model time.
4. With AI configured, browse **Decisions** and **Rejected / Removed**, search, and inspect exact evidence excerpts.
5. Ask a specific repository question. Each factual claim needs validated evidence from that repository. When retrieval cannot answer, the app says it could not find evidence. Chats survive reload and are repository-scoped.
6. **Sync repository** refreshes all PR conversations and reconciles deleted comments without duplicating records. Unchanged text avoids repeat model calls. Resume replays saved pages; analysis replacements are atomic, stale decisions are hidden, and stable IDs are preserved where possible.

## Verify

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

API tests use Supertest and need loopback networking. Browser tests launch isolated servers on **4173 / 4311**, with an in-memory database and explicitly synthetic HTTP fixtures. They do not use or mutate an existing app on port 5173, nor require GitHub/model credentials. Unit/integration tests exercise real SQLite and FTS5 with injected HTTP/model boundaries. See [TEST_PLAN](docs/TEST_PLAN.md) and [verification report](docs/VERIFICATION.md) for actual results.

The offline synthetic PEP-discussion extractor harness uses your configured model:

```sh
node --env-file=.env --import tsx scripts/evaluate-pep.ts
```

The fixture excludes a final PEP and is explicitly synthetic. It is never seeded into the product. Without a configured model, evaluation exits with a configuration error and produces no invented output.

## Architecture and API

- [Architecture](docs/ARCHITECTURE.md): migrations, resumable jobs, normalization and evidence validation.
- [API contract](docs/API_SPEC.md): versioned repository, job, decision and chat endpoints.
- [Examples](examples/README.md): recorded real behavior and reproducible requests, with limitations labeled.
- [Product requirements](PRD.md) and [ordered checklist](CODEX_TASKS.md).

## Scope and limitations

Public **GitHub.com repositories only**; PR bodies and PR-linked comments/reviews only. No standalone issues, GitHub Discussions, forums, PEP ingestion in the UI, upload input, private repos, accounts, or automatic external comments. This intentionally does not cover the organizer's full PEP-discussion ingestion evaluation. Related-decision warnings on future code changes and semantic reranking are deferred. Paths are recorded from inline review comments, not a complete files-changed graph.

This is a single-user local application: bind to loopback, or add authentication and deployment-specific origin controls before exposing it. `APP_ORIGIN` adds a trusted UI origin for deployments. Source text renders as plain React text, not executable HTML. A hard process kill is recoverable through SQLite checkpoints; a graceful shutdown waits for the in-flight bounded API/model request.

The referenced screenshot files, official event PDF, and auxiliary pack documents were not present in the supplied files. The UI implements the PRD's navy sidebar, light dashboard, violet accent and specified workflows; pixel-for-pixel screenshot fidelity cannot be claimed. The architecture/API/test documentation in this repository describes the implementation and is newly written, not purported to be the missing originals.

## Hackathon delivery

MIT licensed. Coding assistant: OpenAI Codex. Runtime model: **not configured during this build**. `.github/pull_request_template.md`, CI, examples and a HACKATHON-only initial local commit are included. Implementation lives on a feature branch. The requested remote is [millimeow/DevRecall](https://github.com/millimeow/DevRecall); existing history must be preserved, including any earlier compliance gaps. Remote CI is only verified after an actual PR run; local passing checks are not a claim that GitHub Actions ran.
