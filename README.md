# DevRecall

Every decision has a reason. Never lose it.

DevRecall recovers engineering decisions, rejected alternatives and their original evidence from public discussions. Built for Hacktoberfest 2026 Problem 06. The [v2 implementation plan](CODEX_IMPLEMENTATION_PLAN.md) is authoritative; it supersedes the original PRD's SQLite and model defaults.

## Current implementation

- FastAPI with PostgreSQL/SQLAlchemy/Alembic for GitHub numeric repository IDs, decision UUID relationships, jobs and source checkpoints.
- MongoDB for decisions, rejected alternatives, reasoning, evidence, original message versions and analysis runs. A separate `decision_revisions` collection preserves history without growing one document indefinitely.
- SQL foreign keys, source/topic uniqueness, and a partial unique index preventing overlapping repository scans. Titles are not decision identities.
- Retryable SQL/Mongo write protocol, readiness checks, repository-scoped cached reads, and an explicit reconciliation command. Prior published revisions remain readable during interrupted reanalysis.
- Public GitHub metadata resolution and bounded issue/PR/comment/review ingestion. Existing known aliases load cache without GitHub or inference calls. A newly encountered alias requires GitHub resolution; an existing numeric ID keeps its decisions after rename/transfer.
- Durable polling worker, initial jobs, manual-only sync, source hash deduplication, and explicit continuation after partial scans. Read APIs never enqueue jobs.
- React + Vite + Tailwind UI for repository input, job progress, cached decisions, evidence, keyword search, scoped Q&A and exact-path PR context.
- Separate transient PEP-discussion evaluation API/UI/CLI. It never fetches a final PEP or fabricates a repository ID.

**AI provider/model remain unselected.** Production has an `AIProvider` protocol and an unavailable implementation only. Blank configuration reports `model_not_configured`; configured names without an implemented adapter report `adapter_not_implemented`. No production test provider or placeholder decisions are shipped. Repository registration and cached reads work without a model; new scans and sync require a real adapter. Actual extraction, model-dependent Q&A, long-discussion model reconciliation and a fresh blind evaluation are therefore not operational yet.

## Setup

Requires Python 3.11+ (tested with 3.14), Node 22.13+, PostgreSQL 18 and MongoDB 8.0. Use local installations or the optional Compose file:

```sh
docker compose up -d
```

Compose uses local-only development credentials. Set root `.env` from `.env.example`, replacing the database placeholders. With Compose:

```dotenv
POSTGRES_DATABASE_URL=postgresql+psycopg://devrecall:local_dev_only@127.0.0.1:5432/devrecall
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=devrecall
GITHUB_TOKEN=
AI_PROVIDER=
AI_MODEL=
AI_BASE_URL=
AI_API_KEY=
API_BASE_URL=http://127.0.0.1:8000
```

GitHub token is optional for public API access. No vendor/model is selected automatically. Do not put credentials in Git. Keep the API on loopback: this is a single-user tool without authentication.

From the repository root:

```sh
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.lock.txt
pip install --no-deps -e backend
npm ci
python -m alembic -c backend/alembic.ini upgrade head
python -m app.db.manage indexes
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to FastAPI on port 8000. Start the durable worker separately, with the virtual environment activated:

```sh
python -m app.workers.ingestion_worker
```

It polls explicitly queued jobs only; it never schedules automatic synchronization. `--once` handles at most one queued/recoverable job. A PostgreSQL advisory lock serializes worker processes, allowing safe recovery of an interrupted running job. Batches are capped at 50 sources; partial/failed jobs require another explicit **Sync Repository** action to resume. Do not expose Vite or these databases publicly. For a frontend build, use `npm run build`; deployment of the resulting `frontend/dist` needs a same-origin `/api` reverse proxy.

## Use

1. Enter a public repository URL. Known aliases return saved results immediately. New repositories resolve the permanent GitHub ID and register; without a model, analysis remains explicitly blocked.
2. Once a selected, compliant open-weight provider is implemented/configured, new repositories enqueue initial analysis. Existing repositories require **Sync Repository**.
3. Inspect decision alternatives, reasons, uncertainty, exact quotations and original messages. Quote presence does not prove consensus or semantic entailment.
4. Search saved repository content, ask an evidence-grounded question, or supply changed paths for advisory historical context. Nothing is posted to upstream GitHub repositories.
5. Use **Discussion evaluation** for pasted text or JSON messages. Results are transient and include the original supplied messages. Do not include the corresponding final PEP.

Evaluation CLI (requires an actual configured adapter; otherwise exits without writing an output):

```sh
npm run evaluate -- --input examples/public_discussion.json --output /tmp/devrecall-evaluation.json
```

## Databases and failure recovery

`repositories.repo_id` is GitHub's numeric ID. `decisions.decision_id` is a UUID reused for `(repo_id, source_key, normalized topic_key)`; Mongo `decisions._id` uses the same UUID string. Source/topic keys must be stable across title changes. The worker passes existing topic mappings to the provider; duplicate candidate keys fail explicitly rather than silently merging different topics.

New decisions commit a thin `pending` SQL row, write the Mongo revision and current document with majority acknowledgement, then publish the SQL revision as `ready`. Failures retain `error`/pending state; published earlier revisions remain available. Read APIs verify document ownership and revision. Missing documents return 503, never synthetic detail. Reconciliation does not delete orphaned evidence:

```sh
python -m app.db.manage reconcile
python -m app.db.manage reconcile --repair
```

Repair publishes already-written pending revisions. Missing published documents without a pending snapshot are reported for operator restoration. Messages are stored separately, with content-versioned IDs; previous evidence stays inspectable after GitHub edits. Checkpoints and source hashes advance only after successful source publication. A failed source may have individual verified decisions already committed, but its job is never falsely marked complete.

Manual sync traverses public source metadata and fetches source content to detect edits, then invokes inference only for changed hashes. It currently favors correctness over API efficiency: it does not use a timestamp-only incremental shortcut, which could miss review changes. Comment/review endpoints are bounded to 20 pages each. Incomplete sources are not analyzed. Pagination limits and rate limits produce visible failed/partial jobs.

## Tests

Activate the virtual environment first. Offline tests run without databases; integration tests explicitly skip when database URLs are absent:

```sh
python -m pytest backend/tests -q
npm run test:legacy
npm run build
```

For full validation, provision an **isolated disposable PostgreSQL database whose name ends in `_test`**. The integration suite truncates its four application tables. Mongo tests create/drop uniquely named temporary databases.

```sh
export TEST_POSTGRES_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@127.0.0.1:5432/devrecall_test'
export TEST_MONGODB_URI='mongodb://127.0.0.1:27017'
REQUIRE_DB_TESTS=1 python -m pytest backend/tests -q
```

CI provisions PostgreSQL/MongoDB services, requires integration tests (missing configuration fails), and runs the frontend build plus preserved legacy evaluation regression. Tests use synthetic providers and simulated GitHub transport, with real database servers; they are not evidence of actual model accuracy or a live crawl.

## Layout

```text
backend/app/
  main.py, config.py, schemas.py, evidence.py
  db/             SQL models, real connections, Mongo indexes, administration
  services/       persistence saga, GitHub client, ingestion, AI protocol
  workers/        durable polling worker
backend/alembic/  versioned PostgreSQL migration
backend/tests/    offline and real-database integration tests
backend/src/      preserved legacy Express/SQLite evaluation implementation
backend/test/     preserved legacy regression tests
frontend/src/     React repository/evaluation UI, existing design system
examples/         historical real outputs and labeled synthetic inputs
```

Existing SQLite data is not automatically migrated: old discussions have no trustworthy GitHub repository ownership. The old evaluator and outputs are preserved under `backend/src`, `backend/scripts/evaluate-discussion.js`, and `examples/`; `npm run evaluate:legacy` targets that old API only. They are not v2 output claims. See [legacy setup](docs/LEGACY_README.md). Do not run both APIs on the same port.

## Remaining limitations and compliance

- A compliant real provider/model must be selected and integrated; this includes bounded chunking/reconciliation, actual inference validation and fresh blind PEP evaluation. Setting environment names alone cannot enable inference.
- Pasted evaluation currently supports transient results only, not attachment to a selected real repository.
- Deleted/retracted decisions are retained as historical records; automatic source-wide supersession is not yet implemented. A model must maintain stable topic keys; semantic identity cannot be proven by the persistence layer.
- A source exceeding endpoint bounds needs a higher bounded limit or a smaller discussion import. A resumed scan uses stable created-order pages; source deletion during pagination can shift offsets. A subsequent full manual sync is the recovery path.
- Search is bounded keyword matching, not vector search. PR context uses supplied exact paths, without automatic PR diff fetching or rename tracking. GitHub Discussions/forums need separate adapters.
- The initial commit `6c9d3b9` contains only `HACKATHON.md`. Work remains on `feat/devrecall-mvp`; no history rewrite or direct-to-main commit was performed. No Git remote is configured, so public visibility, event submission, PR creation and remote CI success cannot be claimed.
- Historic Qwen/Ollama outputs remain intact and labeled. No new AI output or benchmark success is claimed for v2. Coding assistance: OpenAI Codex.
