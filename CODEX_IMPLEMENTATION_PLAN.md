# DevRecall — Codex Implementation Plan (Architecture v2)

**Project:** DevRecall  
**Official challenge:** Hacktoberfest 2026, Problem 06 — Open Source Decision Intelligence and Knowledge Recovery  
**Status:** Approved design decisions; implementation not yet verified  
**Authoritative architecture choices:** PostgreSQL for repository/decision index; MongoDB for detailed source and decision documents; manual repository sync; AI model not selected.

> **Codex: Read this file, `README.md`, `PRD_DevRecall_Codex.md`, and `HACKATHON.md` before writing code.** Where older proposals conflict, this v2 architecture supersedes them. Do not claim features or model integrations are complete unless you have run and tested them.

## 1. What the judges are testing

The official Problem 06 asks for a platform that analyzes public technical discussions, recovers decisions and reasoning, identifies rejected approaches and reasons, connects decisions to code, maintains references to original discussion, and surfaces relevant historical decisions when new PRs modify related code. Organizers will provide **Python PEP-related public discussions without the corresponding PEP** and evaluate recovery of rejected approaches and why they were rejected. Build for this blind evaluation: never fetch or inject the withheld PEP or use known PEP summaries as a shortcut.

The organizer did **not** specify PostgreSQL, MongoDB, model vendor, UI, or exact API shape; these are our implementation decisions. The general event rules require an open-source/open-weight model doing meaningful work, publicly accessible repo, required files, CI, and PR-only updates following the initial `HACKATHON.md`-only commit.

## 2. Final architecture and boundaries

| Concern | Final decision | Rule |
|---|---|---|
| Repository identity | GitHub REST `repository.id` numeric ID | `repositories.repo_id BIGINT PRIMARY KEY`; URLs/names are mutable aliases |
| PostgreSQL | Canonical repository metadata + relationship/index tables + job and sync state | Do **not** store the full LLM-generated decisions or entire comment bodies here |
| MongoDB | `decisions`, `source_threads`, `source_messages`, `analysis_runs` | Rich text, alternatives, rationale, original evidence, code refs |
| Decision identity | UUID shared by PostgreSQL index row and MongoDB document | `decisions.decision_id` = Mongo `decisions._id` |
| Cache behavior | Existing repository loads persisted results | No automatic crawling or LLM run on page open |
| Refresh behavior | User initiates **Sync Repository** | Incrementally inspect new or updated GitHub content |
| First use | New GitHub repo triggers initial ingestion and analysis when model configured | Explicit progress, pagination, bounded workload, resumable job |
| AI | Configurable adapter; selection pending | No vendor/model hardcoded; if missing, show `model_not_configured`; no fake outputs |
| API/UI | Python FastAPI, React + Vite + Tailwind | Real API-backed interactions |
| Source boundaries | Public sources only | Don't use private data or post to external repos |

### Runtime diagram

```text
User submits public GitHub URL
           |
       FastAPI -- GitHub repository lookup -> immutable GitHub repo_id
           |
   PostgreSQL repositories
           |
  +--------+----------+
  |                   |
Exists                Missing
  |                   |
Read decision IDs     Create repository + ingestion job
  |                   |
Mongo decisions       GitHub paginated issues/PRs/comments/reviews
  |                   |
Render cached data    Mongo raw threads/messages -> configured model
                      |                         |
                      |                 evidence validation
                      |                         |
                      +---- Mongo decisions <-+-+
                                       |
                               PostgreSQL decision index
                                       |
                                  Render report

Manual Sync: enqueue sync job -> identify changed GitHub sources -> re-analyze
  affected sources -> idempotent upsert -> update sync cursor after success.
```

## 3. Database specification

### PostgreSQL migrations (SQLAlchemy + Alembic)

**`repositories`** — canonical identity and sync state:

- `repo_id BIGINT PRIMARY KEY` — actual immutable GitHub numeric repository ID
- `github_node_id TEXT NULL`, `owner_login TEXT NOT NULL`, `name TEXT NOT NULL`
- `full_name TEXT NOT NULL`, `html_url TEXT NOT NULL`, `default_branch TEXT NULL`
- `visibility TEXT NOT NULL DEFAULT 'public'` — accept only public repositories
- `ingestion_status TEXT NOT NULL` — `new | queued | processing | completed | partial | failed`
- `last_synced_at TIMESTAMPTZ NULL`, `last_checked_at TIMESTAMPTZ NULL`
- `sync_state JSONB NOT NULL DEFAULT '{}'` — per endpoint/page checkpoints or watermarks
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- Unique index on `full_name` for current alias, with handling of GitHub renames. `repo_id` remains canonical.

**`decisions`** — thin index and relationship only:

- `decision_id UUID PRIMARY KEY`
- `repo_id BIGINT NOT NULL REFERENCES repositories(repo_id)` with index
- `source_key TEXT NOT NULL` — stable source thread identifier (`github:pr:123`, `github:issue:42`, etc.)
- `topic_key TEXT NOT NULL` — deterministic within-source candidate key, not a title-only hash
- `title TEXT NOT NULL`, `status TEXT NOT NULL` — lightweight card fields
- `document_status TEXT NOT NULL` — `pending | ready | error`; only `ready` shown as fully available
- `source_updated_at TIMESTAMPTZ NULL`, `created_at`, `updated_at`
- Unique constraint `(repo_id, source_key, topic_key)` to prevent duplicate creation during retries

**`ingestion_jobs`** — persistent scan jobs and visibility:

- `job_id UUID PRIMARY KEY`, `repo_id BIGINT REFERENCES repositories(repo_id)`
- `job_type TEXT` — `initial | manual_sync`
- `status TEXT` — `queued | running | partial | completed | failed`
- `sources_scanned INT`, `sources_total INT NULL`, `decisions_written INT`
- `checkpoint JSONB`, `error_summary TEXT NULL`, timestamps and retry count
- Prevent concurrent active jobs for the same repository in service logic, ideally using a database lock.

**`source_index`** — checkpoint/dedup metadata (not source body):

- `source_id UUID PRIMARY KEY`, `repo_id BIGINT FK`
- `source_key TEXT`, `kind TEXT`, `external_id TEXT`, `source_url TEXT`
- `github_updated_at TIMESTAMPTZ`, `content_hash TEXT`, `processed_at TIMESTAMPTZ NULL`
- Unique `(repo_id, source_key)`; index on `repo_id` and `github_updated_at`

PostgreSQL should not become a duplicate document store. Summary fields can support fast listing; detailed data is retrieved from MongoDB.

### MongoDB collections and indexes

1. **`decisions`** — `_id` = decision UUID string; `repo_id` = GitHub numeric ID; `source_key`; `topic_key`; title, status, question, chosen approach, structured alternatives, reasons, confidence/uncertainties, evidence arrays, code refs, extraction metadata, created/updated timestamps. Index `{repo_id:1}`, `{repo_id:1,source_key:1}`, unique `_id`.
2. **`source_threads`** — `_id` stable `repo_id:source_key`, repo ID, GitHub URL/type/external number, thread title, timestamps and indexing metadata. Index `{repo_id:1}`.
3. **`source_messages`** — `_id` stable source-specific message identifier, thread ID, sequence number, GitHub comment/review metadata, exact original `body`, author, timestamps, URL. Unique `_id`; index `{thread_id:1,sequence_number:1}`. Store messages separately to avoid MongoDB's 16-MB document limit for very long discussions.
4. **`analysis_runs`** — run UUID, `repo_id` if linked, `source_key`, provider, model ID (actual value only when configured), extraction schema version, state, errors, evidence-validation summary. Avoid unnecessarily storing private credentials or raw prompts.

Example **illustrative** Mongo `decisions` document (NOT an actual extracted result):

```json
{
  "_id": "7923e592-0f8b-4b65-bbb1-5652d00c07bd",
  "repo_id": 123456789,
  "source_key": "github:pr:42",
  "topic_key": "api-error-handling",
  "title": "Error handling approach",
  "status": "accepted",
  "chosen_approach": "Return structured errors",
  "alternatives": [
    {
      "name": "Return raw exception strings",
      "status": "rejected",
      "rejection_reason": "The discussion cites information exposure concerns",
      "evidence_message_ids": ["123456789:pr:42:comment:998"]
    }
  ],
  "evidence": [
    {
      "message_id": "123456789:pr:42:comment:998",
      "source_url": "https://github.com/example/repository/pull/42#issuecomment-998",
      "exact_quote": "Raw exceptions can expose internal details.",
      "quote_verified": true
    }
  ],
  "related_code": [{"path": "src/api/errors.py", "evidence_message_ids": ["123456789:pr:42:comment:998"]}],
  "uncertainties": [],
  "extraction": {"provider": "configured-provider", "model": "configured-model", "run_id": "run-uuid"}
}
```

### Cross-database write protocol (no distributed transaction)

- Allocate/reuse deterministic `(repo_id, source_key, topic_key)` mapping to one UUID in PostgreSQL.
- Upsert a thin PostgreSQL decision row as `document_status=pending`.
- Upsert the Mongo decision document with the same UUID `_id`.
- Set SQL `document_status=ready` **only after** Mongo write succeeds. Read APIs filter for `ready` and verify Mongo document exists.
- If the Mongo write fails, keep SQL `pending/error`, log a retriable job failure, never return a fake detailed decision.
- Retry with **idempotent upserts** and add a reconciliation task that identifies missing/orphaned documents.
- Advance GitHub sync checkpoints only after corresponding source content and decision writes succeed. Preserve prior verified results when reanalysis fails.
- Maintain original decision history; if a previous outcome changes, record version/revision information and timestamps instead of silently discarding evidence.

### Identity and dedup rules

- Accept GitHub URL `https://github.com/{owner}/{repo}`; resolve via GitHub API (rather than using lowercase string as the primary key); retain original ID through rename/transfer.
- Stable `source_key` uses GitHub issue/PR number plus kind and repo; source content hashes detect changes.
- Stable decision identity requires source key + normalized topic key and collision handling. Re-extraction should update existing IDs; it must not create a new decision just because the title wording changes.
- Do not merge two different contributors based on similar usernames.

## 4. Core API contract (v2)

All routes are under `/api`; contract examples are proposed, not organizer-prescribed.

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/api/health` | Health of API, PostgreSQL, MongoDB; model configured/available separately, no secrets |
| `POST` | `/api/repositories` | `{ "url": "https://github.com/owner/repo" }`; resolve GitHub ID; return cached repository immediately if known, else create repo + enqueue initial indexing; if no model, return explicit configuration-needed state |
| `GET` | `/api/repositories/{repo_id}` | Metadata, ingestion status, `last_synced_at`, counts |
| `GET` | `/api/repositories/{repo_id}/decisions` | SQL relationship/index search -> Mongo details for requested page |
| `GET` | `/api/decisions/{decision_id}` | Fetch SQL owner/index then Mongo detail with evidence |
| `POST` | `/api/repositories/{repo_id}/sync` | Explicitly enqueue a **manual** incremental sync; return `202`, job ID; do not auto-sync when browsing |
| `GET` | `/api/jobs/{job_id}` | Progress and errors (queued/running/partial/completed/failed) |
| `GET` | `/api/repositories/{repo_id}/search?q=...` | SQL metadata filter and/or Mongo text search; scoped by repo |
| `POST` | `/api/repositories/{repo_id}/ask` | Model-based evidence-grounded Q&A; cite original messages |
| `POST` | `/api/evaluations/analyze` | Analyze supplied PEP discussion **without final PEP**; either transient result or attach to explicitly selected real repo; never fabricate repo ID |
| `POST` | `/api/pr-context` | Match PR changed paths to source-linked historical decisions; return advisory results with evidence |

Suggested `POST /api/repositories` response for known repo:

```json
{
  "repo_id": 123456789,
  "cached": true,
  "ingestion_status": "completed",
  "last_synced_at": "2026-10-31T16:00:00Z",
  "decisions_url": "/api/repositories/123456789/decisions"
}
```

Missing repo response (if AI is not configured): repository may be registered, but the ingestion job must **not silently mark analysis successful**. Return `model_not_configured` / blocked state; allow retry after configuration. Never replace AI output with placeholder decisions.

API error handling: 400 invalid URL, 404 GitHub repo absent/inaccessible, 409 active scan already in progress, 422 invalid discussion, 429 rate limited, 503 model or database unavailable, with consistent structured bodies. Do not imply `202` is a completed analysis.

## 5. User flows / frontend screens

**Repository home:** URL form, repository metadata, last sync timestamp, number of persisted decisions, ingest state, an explicit **Sync Repository** action. Existing repositories must show their cached decisions without a GitHub crawl or AI invocation.

**First-time scan:** Real progress (PRs/issues found, comments fetched, sources analyzed, decisions saved); pending/error states; allow partial results when safe. Fetch PR description/comments, issue comments, review discussions via GitHub API; forum/Discussions integration can be a later adapter because API access differs. Scan public data only; paginate and obey rate limits.

**Decision browser:** Topic/title, current status (`accepted/rejected/proposed/contested/uncertain`), chosen approach, rejected options and their reasons, traceable quotes, original URLs, related code files if supported. Present unverified claims as unverified.

**Ask DevRecall:** Scoped questions should search persisted decisions and exact original comments, then compose citations. Answer “Insufficient evidence” when not supported; show a model-configuration message if no model is set.

**PR relevance:** Input a new PR URL or changed file list; find related decisions using evidence-backed path/symbol links and show advisory notices, not automatic comments on GitHub.

**Judge evaluation mode:** Paste or import a supplied public technical discussion; do not require indexing every PR in a repository first; do not input the corresponding PEP. Its results may be transient, or persisted *only* when explicitly linked to a real repository. This preserves the user's rule that all PostgreSQL decision rows belong to a real GitHub repo without fabricating an ID.

## 6. AI model configuration — undecided by design

Do **not** pick a vendor/model automatically in documentation or source code, and do not report model extraction as operational until a real compatible model is configured. Define an `AIProvider` interface with `extract_decisions(messages, context)`, `answer(question, evidence)`, and `health()`; implementation can be selected via environment.

`.env.example` placeholders (NO real credentials):

```dotenv
POSTGRES_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/devrecall
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/devrecall
MONGODB_DATABASE=devrecall
GITHUB_TOKEN=
AI_PROVIDER=
AI_MODEL=
AI_BASE_URL=
AI_API_KEY=
```

- Start with an adapter interface and one provider implementation **only after** user selects a compliant model/runtime. If an adapter is selected later, plug it in without changing API, storage schema, or evidence-verification rules.
- For hackathon compliance, the **actual core model must be open-source or open-weight**; verify the provider/model choice before use. The special Gemma-only/fully-local rule belongs to Problem 08, not Problem 06.
- Never put credentials or access tokens in source, READMEs, logs, screenshots, fixture output, or GitHub commits.
- CI should use a deterministic **mock provider only for tests** of the orchestration/evidence verifier; production must explicitly return `model_not_configured` if no real model exists.
- Make large discussions robust: chunk with overlapping context, summarize candidates then reconcile across chunks, validate citations against immutable stored message text.
- For every asserted rejection reason, include message IDs and exact, source-validated quotes. Avoid false certainty and do not infer acceptance from message order alone.

## 7. Ingestion and manual-sync logic

**Initial indexing** on first repository URL:

1. Normalize and validate GitHub URL; resolve GitHub immutable repo ID and public status via authenticated GitHub REST (optional token for public access, recommended for rate limits).
2. SQL upsert repository record keyed by numeric `repo_id`.
3. If never indexed and AI configured, enqueue durable `initial` ingestion job. Otherwise report explicit missing-configuration state.
4. Collect public issues, PRs, issue comments, PR review threads/comments and relevant source references via paginated, bounded API reads. Do not claim full coverage if a limit or rate limit interrupts scanning.
5. Normalize each source into Mongo thread + message documents, with stable source IDs and original URLs. Track source metadata/hash in PostgreSQL.
6. Run configured model on source messages. Validate structured output schema and exact evidence quotes. Distinguish decisions vs participant opinions; use `uncertain` when inconclusive.
7. Upsert decision detail into Mongo and decision index/relationship into PostgreSQL through the cross-database write protocol.
8. Save source checkpoints/last successful synced timestamp; mark job complete only after successful writes. Expose status to frontend.

**Manual Sync Repository**:

1. Start only from an explicit user action; reject overlapping active jobs.
2. Fetch changed/new source items using endpoint-specific timestamps and stored checkpoints, while handling pagination/deletes/edits and eventual consistency. Compare GitHub `updated_at` and content hashes rather than trusting timestamps alone.
3. Reprocess only affected threads, update/reconcile their decision records, preserve provenance/version history; keep unaffected decisions unchanged.
4. Advance checkpoints only after success. On failure report partial progress; retry safely without duplicates.

**Important:** Cached browsing, searching and viewing decisions must not trigger GitHub fetch or AI analysis automatically.

## 8. Implementation milestones for Codex (in this order)

### Stage 0 — Audit and repository compliance

- Inspect current source, docs, Git history and existing models before modifying. Do not overwrite existing work blindly.
- Confirm event's first commit had **only** `HACKATHON.md`. All later changes are feature branches + PRs; do not rewrite history without user permission.
- Preserve existing public repository, CI template, license, and `examples/` if present.

### Stage 1 — Persistence and API scaffolding (P0)

- FastAPI config, Pydantic schemas, SQLAlchemy/PostgreSQL + Alembic migrations, Mongo client and indexes.
- Create repository, decisions, ingestion_jobs, source_index SQL tables; Mongo decisions/source_threads/source_messages/analysis_runs collections.
- `/api/health`, repository resolve/lookup, cached decision list/detail and `job` status APIs.
- Tests for FK relationships, uniqueness, stable GitHub repo ID, SQL+Mongo integration (containerized test DBs or explicit integration env).

### Stage 2 — GitHub ingestion and cache workflow (P0)

- Public GitHub URL validation and numeric ID lookup, paginated issue/PR/review/comment ingestion, normalized source messages.
- Persistent job progression and a simple polling worker (no Redis required for MVP), dedup/content hashing, errors for rate limits and partial scans.
- Existing repo loads Mongo cached decisions without crawl; unknown repo creates a job.
- Frontend repo-input, cached state, progress, and status.

### Stage 3 — Evidence-first decision engine (P0, highest judging importance)

- Define model-agnostic `AIProvider` protocol, deterministic test double, unavailable state when model not configured.
- Once a compliant real open-weight model is chosen, implement its adapter and integrate actual calls; do not ship fabricated analyses.
- Parse structured decisions/alternatives; validate exact quote against stored source message, correct source URL, status/uncertainty.
- Idempotent SQL/Mongo write saga; evidence-first decision detail UI; tests for model errors, unsupported claims, reindex dedup.

### Stage 4 — PEP-style standalone evaluation mode (P0, judging-critical)

- Paste structured/unstructured discussion with message IDs, optionally source URLs; don't use the withheld PEP.
- Produce judge-style report of rejected approaches and their reasons; evidence links return to source messages even without GitHub URL.
- Support transient input or explicit link to a real repo; never invent a fake Github repository ID.
- Include real public inputs + actual model outputs once an AI provider is chosen; document any uncertainty.

### Stage 5 — Search, Q&A, manual sync and PR relevance (P1)

- Search indexed repository decisions; add Mongo text index as needed, no vector DB necessary.
- Grounded Ask DevRecall uses only retrieved verified evidence with citations; abstain if unavailable.
- Manual Sync button/API and incremental reanalysis of new/edited PRs/comments.
- Link decisions to supported source-file paths; match new PR file changes, explain relevance; preserve source URLs.

### Stage 6 — Documentation, tests, demo and CI (mandatory)

- `.env.example` placeholders, exact setup instructions for *both* databases and the configured AI runtime.
- Add `LICENSE` (MIT/Apache-2.0), PR template, GitHub Actions CI with backend + frontend checks, `examples/` with genuine input and actual system output.
- Test repo rename to same ID; second visit no recrawl; manual sync new thread; retry after partial writes; evidence-verification failures; blind PEP-style recovery.
- Final report: features working, actual model and provider, tests run, known limitations, no invented success claims.

## 9. Acceptance tests (must be demonstrable)

1. **Same repo identity:** URL alias/rename resolves to same numeric GitHub repo ID and does not duplicate repository records.
2. **First visit:** A new public repo is registered and, when a real AI adapter is configured, a visible scan job ingests public threads and saves evidence-linked decisions.
3. **Cached revisit:** Opening an indexed repo reads PostgreSQL/MongoDB; GitHub and AI services are **not called**.
4. **Decision linkage:** Each SQL decision row has a valid `repo_id` FK and matching Mongo document `_id`.
5. **Multiple decisions:** One repo owns multiple decision UUIDs; querying another repo never returns them.
6. **Dedup:** Re-running the same source or retrying a failed job does not create duplicate decisions.
7. **Manual sync:** No auto refresh occurs; clicking **Sync** processes only newly changed content where possible.
8. **Fault tolerance:** If Mongo write fails, SQL decision never appears ready; retries recover without lost data or false success.
9. **Evidence correctness:** Each non-uncertain acceptance/rejection reason points to an actual message and an exact matching quote; unsupported conclusions are flagged.
10. **Blind judging:** A previously unseen PEP discussion can be analyzed *without the PEP document*, yielding cited rejected alternatives or explicit uncertainty.
11. **No-model behavior:** Without a chosen model/configuration, app reports model not configured and does not output invented decisions.
12. **Compliance:** Public repo, initial `HACKATHON.md`-only commit, later PRs, license, CI, PR template, examples with actual outputs, and honest model records.

## 10. Suggested project file structure

```text
HACKATHON.md
README.md
PRD_DevRecall_Codex.md
CODEX_IMPLEMENTATION_PLAN.md
LICENSE
.env.example
.github/pull_request_template.md
.github/workflows/ci.yml
backend/
  app/
    main.py
    config.py
    api/{repositories,decisions,jobs,evaluations,search,pr_context}.py
    db/{postgres,mongo}.py
    models/{sql,schemas}.py
    services/{github_client,ingestion,model_provider,extraction,evidence,sync,reconcile}.py
    workers/ingestion_worker.py
  alembic/
  tests/
frontend/
  src/{pages,components,lib}/
examples/
  sample_discussion.json
  actual_output.json
  HOW_TO_REPRODUCE.md
```

This is a proposed file tree; Codex may make pragmatic layout adjustments without changing the data ownership, REST contract, evidence requirements, or event workflow.

## 11. Implementation instruction to Codex

> Implement this v2 plan in prioritized vertical slices. Begin by examining the existing repo and docs; preserve the initial-commit rule. Implement real PostgreSQL and MongoDB connections and testable repository-to-decision linking. Keep AI provider configurable and explicitly unavailable until a compliant model is chosen. Make cached reads bypass GitHub/model calls, and manual sync explicit. The central accuracy requirement is evidence-backed recovery of rejected alternatives from unseen discussion text without the final PEP. Show exactly which requirements are operational, which are blocked by missing configuration, and which are not implemented.
