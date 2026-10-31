# DevRecall

**Every decision has a reason. Never lose it.**

DevRecall recovers engineering decisions, rejected alternatives and their reasoning from public technical discussions. It pairs local open-weight inference with exact source-quote checking, durable SQLite storage and an evidence-first workspace. Built for Problem 06, Hacktoberfest 2026 — Hack Day Sonipat.

## What works

- Paste public discussion text or structured messages with speakers and original URLs.
- Import a public GitHub issue or PR description and issue comments, with bounded pagination and actionable rate-limit errors.
- Run real structured extraction with a configurable Ollama model. Invalid structured output gets one repair retry. Discussions chunk on message boundaries; a general pass recovers approaches and focused source-message passes look for objections. Matching questions merge conservatively, preserving conflicting outcomes.
- Inspect chosen approaches, accepted/rejected/proposed/contested/uncertain alternatives, rationale and exact quotes. Reasons are preserved as source excerpts. Missing evidence downgrades status or removes unsupported reasons. Confirmed outcome labels require the approach name and explicit choice/objection language in the cited quote. Code paths survive only when literally present in verified evidence.
- Persist discussions, immutable message IDs, extraction-run metadata and decision records in SQLite. Failed reruns preserve the previous successful results.
- Search titles, alternatives and reasons; ask evidence-grounded questions using recovered decisions and relevant original-message excerpts, with validated citations and explicit abstention.
- Export JSON or Markdown; match manually supplied changed paths to explicitly cited historical code paths.
- Responsive dark React workspace with honest model health, loading/error/empty states and original-message inspection.

The app does not substitute hard-coded answers when a model is unavailable. Nothing is sent to a cloud inference API. GitHub imports make public network requests; model inference uses your configured Ollama endpoint. The interface loads its optional DM Sans font from Google Fonts; the system-font fallback works offline.

## Run locally

Requires Python 3.11+, Node 22+, and [Ollama](https://ollama.com/download). Run commands from the repository root unless stated otherwise.

```sh
cp .env.example .env
python3 -m venv backend/.venv
backend/.venv/bin/pip install -c backend/requirements.lock.txt -e './backend[dev]'
npm ci --prefix frontend
```

Start Ollama in one terminal, then install the configured open-weight model in another:

```sh
ollama serve
```

```sh
ollama pull qwen2.5:3b
```

Start the backend:

```sh
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```sh
npm run dev --prefix frontend
```

Open **http://127.0.0.1:5173**. API docs: **http://127.0.0.1:8000/docs**. Use **127.0.0.1** rather than a public network interface; this is a single-user local tool without authentication.

For a single application server, run `npm run build --prefix frontend` **before** starting the backend, then open **http://127.0.0.1:8000**. The FastAPI app serves the production bundle when it exists at startup.

Configuration in `.env`:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
MODEL_TIMEOUT=240
# DEVRECALL_DB=/absolute/path/to/devrecall.db
```

The default SQLite database is `backend/devrecall.db` (ignored by Git). Restart the backend after changing configuration. Swapping models requires only changing `OLLAMA_MODEL`; alternative providers can implement `app/llm.py`'s `generate` and `health` functions. Context and output budgets are bounded in that adapter.

## Try it

1. Open **Overview**. Choose **Paste discussion**, **Structured JSON**, or **GitHub URL**.
2. Add a title, source URL if available, and public discussion. For JSON, paste the `messages` array from `examples/public_discussion.json`, or the entire fixture object and set the form title/source fields.
3. Analyze. Local inference may take several minutes. If Ollama fails, your imported messages remain saved; use **Analyze again** after connecting the model.
4. Inspect alternatives and expand their evidence. Each quote links to the internal original message and, when available, the public source.
5. Ask a question within the discussion or across the library. Search for an alternative name or reason. Export your result to check it independently.

Raw paste is honestly treated as one unattributed message. For long threads or reliable attribution, use structured messages. The importer never executes discussion code or follows instructions embedded in discussion text.

## Tests and real-model evaluation

```sh
backend/.venv/bin/pytest -q backend/tests
npm run build --prefix frontend
```

Offline tests mock **only the LLM adapter** and exercise ingestion, SQLite, evidence checking, uncertainty, repair retry, conflicting segments, search, grounded citations, exports and API failure states. They never claim mocked inference as a real demonstration. The GitHub Actions workflow runs the same offline checks and frontend build.

Local verification: **15 backend tests passed**, the frontend production build passed, and actual extraction/QA outputs are saved in `examples/`. The public discussion has important extraction-coverage limitations; see [the measured evaluation](examples/EVALUATION.md).

To reproduce real inference (Ollama and the configured model must be running):

```sh
backend/.venv/bin/python backend/scripts/evaluate_discussion.py \
  --input examples/public_discussion.json \
  --output examples/sample_output.json
```

This imports the public source, runs the real adapter, validates quotes, stores the result and exports source messages, decisions, model name, timestamps and elapsed time. It writes to your configured database. The synthetic fixture is clearly labeled in `examples/synthetic_discussion.json`; use a different output filename when evaluating it. See `examples/HOW_TO_REPRODUCE.md` for provenance and measured results.

`backend/requirements.lock.txt` records the Python dependency versions used locally; the editable app itself is installed separately using the command above. Frontend dependencies are locked in `frontend/package-lock.json`.

## Architecture and files

```text
HACKATHON.md               Preserved event/team record and actual AI disclosure
README.md, LICENSE         Setup and MIT license
.env.example               Local model configuration
.github/                   CI and mandatory PR template
backend/
  pyproject.toml, requirements.lock.txt
  app/
    main.py                API, ingestion, search, QA, GitHub, export, PR context
    config.py              Environment configuration
    database.py            SQLite schema and connections
    schemas.py             Validated inputs and model-output schemas
    llm.py                 Configurable real Ollama adapter
    extraction.py          Chunking, schema repair, conservative merge
    evidence.py            Exact quote checks and uncertainty enforcement
  tests/                   Offline pipeline, API and model-contract tests
  scripts/evaluate_discussion.py
frontend/
  package.json, package-lock.json, vite.config.js, index.html
  src/App.jsx              Workspace, import, library, details, Ask, context
  src/api.js, main.jsx, styles.css
examples/                  Public discussion, synthetic fixture, actual outputs
PRODUCT.md, DESIGN.md       Product constraints and visual system
```

FastAPI + Pydantic → Ollama JSON schema → quote validation → SQLite → React. SQLite stores messages and runs relationally, and decisions with alternatives/rationales/evidence as structured JSON payloads in the decision table. Keyword retrieval is a bounded MVP scan of stored decisions, rather than FTS5 or a vector service.

## Honest limits

- Exact quote verification proves text is present in a message; it **does not prove semantic entailment**, authority, or consensus. Summaries and answers are model interpretations, and even valid citations require human judgment. A misleading interpretation of a genuine quote can pass source matching. The conservative status guard uses English outcome vocabulary and literal approach names; it can miss valid non-English or paraphrased outcomes and keeps them uncertain.
- Input is limited to 200,000 characters and 500 messages. A single message over 22,000 characters must be split before analysis. Each chunk uses a 22,000-character budget with modest overlap. A general pass is followed by up to eight keyword-prioritized objection-message passes (or one whole-chunk objection pass when none match). This bounds inference but can miss implicit or differently worded objections. The 240-second timeout is per model call.
- Duplicate questions merge only when their normalized question text matches exactly. Paraphrased duplicates may remain separate. Implicit and evolving decisions are difficult for small models; coverage is not guaranteed.
- GitHub import includes issue comments, not inline reviews, review submissions or attached files. It is unauthenticated and subject to public API limits, with at most 400 comments. Private repositories are unsupported.
- Code context uses exact explicitly cited paths only; it does not detect renames or perform semantic compatibility checks. No comments or issues are posted to upstream repositories.
- No auth, webhooks, vector search, automatic PR diff fetching or public deployment is implemented. Keep the server on loopback. This local Ollama architecture is intentionally not deployed to cloud hosting that cannot access your machine.
- The app has no browser route persistence: refreshing returns to Overview, with all source records preserved in SQLite.

## Event workflow

The repository was initialized with **only the original `HACKATHON.md`** in initial commit `6c9d3b9`. Implementation is on **`feat/devrecall-mvp`**. No remote existed at inspection. A public repository, remote CI result, PR creation/merge and event submission cannot be claimed without configuring a remote; they remain delivery steps. All future changes should enter main through PRs using the provided template.

Coding assistant: OpenAI Codex; the exact underlying model version is not exposed to this session. See `HACKATHON.md` and the actual example run metadata for extraction-model disclosure.

The adapter supplies the output schema in both the request's `format` and the model instructions, following [Ollama's structured-output guidance](https://docs.ollama.com/capabilities/structured-outputs).

During this build, the temporary Ollama runtime and models were placed under `/private/tmp/devrecall-ollama`. To restart that verification runtime while those files remain available:

```sh
OLLAMA_MODELS=/private/tmp/devrecall-ollama/models \
OLLAMA_HOST=127.0.0.1:11434 \
/private/tmp/devrecall-ollama/ollama serve
```

Install Ollama normally for persistent use. Fixtures are never automatically seeded at startup; the current development database contains actual evaluation records created during verification.
