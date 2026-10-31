# Architecture v2 implementation status — 1 November 2026

## Audit

Read the supplied implementation plan, original PRD, v2 PRD revision, supplied README, repository README and HACKATHON.md. V2 supersedes the earlier SQLite/Ollama and Next/Express architecture. Existing untracked project-guide documents and historical examples were preserved. The initial commit `6c9d3b9` contains only HACKATHON.md. Current branch: `feat/devrecall-mvp`; no Git remote, public visibility, PR or remote CI result is available. No history was rewritten.

## Stage outcomes

| Stage | Outcome |
| --- | --- |
| 0 audit | Completed locally; external repository/PR compliance unverified because no remote exists. |
| 1 persistence | FastAPI scaffolding, SQLAlchemy models, Alembic migration, real PostgreSQL/Mongo connections/indexes, cached APIs, UUID linkage, cross-database publication/revisions/reconciliation. Tested against real databases before starting ingestion. |
| 2 ingestion | Read-only public GitHub resolver, bounded paginated issue/PR/comments/reviews, durable polling worker, hash dedup, restart recovery, explicit partial resume, UI. Tested with simulated GitHub HTTP and real databases. Live metadata request returned 403/429 classification; no live crawl success claimed. |
| 3 engine | Provider protocol, explicit unavailable production implementation, evidence validation, stable topic mapping contract and tested write saga. Real adapter, model chunking/reconciliation and model accuracy remain pending selection. |
| 4 evaluation | Separate transient discussion-only API, form and CLI. No fabricated repository ID or PEP fetch. Real new model output remains blocked on selection. |
| 5 retrieval/sync | Repository-scoped keyword search, citation-checked Q&A orchestration, explicit sync and exact supplied-path relevance. Actual Q&A inference awaits provider; no automatic PR diff/rename support. |
| 6 delivery | Setup/limitations documentation, CI with disposable database services, PR template and preserved genuine historical examples. Local tests/build pass; no remote CI or PR claimed. |

## Executed validation

- **18 Python tests passed**, requiring real PostgreSQL 18 and MongoDB 8.0.16. Covered FK/uniqueness constraints, scope isolation, rename identity, cache bypass, concurrent writes/jobs, injected Mongo/SQL failures, stale pending revision recovery, evidence provenance, source hash dedup, manual sync, partial resume, search/Q&A/path scoping and Alembic downgrade/upgrade/metadata parity.
- **15 legacy JavaScript regression tests passed**, preserving the historical discussion evaluation pipeline.
- **Vite production build passed**.
- `git diff --check` passed.
- Browser inspection covered repository/evaluation screens, responsive layouts and the explicit missing-model response. The live GitHub metadata request was rate-limited/forbidden; no repository analysis or AI result was fabricated.
- Synthetic providers and simulated GitHub responses exist only in tests. No newly generated model examples are claimed. Historical examples remain unmodified.

## Review notes

SQL contains only metadata/index/state. Mongo carries rich content and immutable message/decision revisions. Ordinary repository browsing never invokes GitHub or AI. Unknown aliases resolve against GitHub and retain the numeric ID through renames. A pending document cannot be returned as a completed decision. Published old revisions remain readable if reanalysis fails. Manual scans re-fetch content to catch edits but invoke inference only for changed hashes.

Known limits are detailed in README.md: provider selection/integration, transient-only standalone evaluation, source-wide supersession, page-offset drift during deletion, and bounded lexical/path retrieval. None is represented as completed model behavior.
