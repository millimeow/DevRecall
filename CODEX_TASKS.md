# Codex Implementation Checklist — Ordered Execution Plan

Use alongside `PRD.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/API_SPEC.md`, `db/schema.sql`, `docs/TEST_PLAN.md` and design references. Dependencies form an execution path. Mark checked only after actual tests.

Implementation checkmarks record verified code/tests, not actual-model accuracy. Screenshot fidelity, a real cited model answer, remote CI and inherited history compliance have separate limitations in docs/VERIFICATION.md.
## Stage 0 — Repo and environment

- [x] Inspect git history and existing code; preserve initial HACKATHON-only commit rule; work via feature branches + PRs.
- [x] Bootstrap npm workspaces `web`, `server`, optionally `shared`. Node compatible with your environment; TypeScript strict mode.
- [x] `.env.example` documented; actual `.env` gitignored; `.gitignore`, `LICENSE`, README, `examples/`, PR template and CI workflow.
- [x] Error logger, test runner, lint, formatting, health endpoint.

**Exit:** clean install, lint and base tests work.

## Stage 1 — Data model / repository management

- [x] Implement SQLite migration based on `db/schema.sql`, FK, WAL, reliable DB path.
- [x] Implement strict URL parser and GitHub `repos.get` resolution; reject untrusted hostnames and inaccessible repos.
- [x] Store numeric GitHub repo ID; support renames, prevent duplicate add.
- [x] Seed demo catalog from `config/demo-repositories.json` without inventing numeric IDs or data.
- [x] Implement `/api/v1/repositories`, `/resolve`, `/:id`, `/demo-repositories`.
- [x] UI sidebar with demo slugs and Add Repository modal, verified preview, real statuses.

**Exit:** any public repo link can be added; the demo catalog appears; repo metadata is real; no static fake counters.

## Stage 2 — PR ingestion worker

- [x] `state=all` PR enumeration, pagination until exhaustion (including >=101 PR tests).
- [x] For each PR, fetch issue-style comments attached to PR, reviews with body, and inline review comments; paginate each.
- [x] Save exact `html_url`, author, timestamps, PR ID and number; expose affected paths if feasible.
- [x] Upsert/normalize/dedupe PRs and sources, recompute hash for changed data.
- [x] Durable background jobs, persisted progress, retry/backoff, graceful pause/resume, manual Sync.
- [x] If some source inaccessible or API limit hit, mark partial with explanation. No silent caps.
- [x] Build job polling API and UI progress indicators.

**Exit:** a real public repo's PRs and comments persist; rerunning is idempotent; job progress survives reload and restart.

## Stage 3 — Decision extraction and evidence validation

- [x] AI adapter interface supporting configurable local open-weight model; explicit missing model errors.
- [x] Strong extraction prompt + structured output schema: decision, outcome, category, reason, alternatives, source IDs, uncertainties.
- [x] Process PR threads in chunks without losing source mappings; idempotent extracted records.
- [x] Validate every source ID against DB and excerpt against source body; reject hallucinated citations; no evidence means uncertain/not confirmed.
- [x] Save decisions/alternatives/evidence and index sources/decisions in SQLite FTS5.
- [x] Distinguish rejected alternative from closed PR and removed feature from rejected suggestion.
- [x] Add synthetic PEP-style fixture test-only harness; no new UI upload feature.

**Exit:** sample fixture yields traceable rejected alternative/reason and invalid source IDs are blocked.

## Stage 4 — Grounded repository chat

- [x] Search corpus by repo ID, combine relevant decisions and PR source matches (FTS5).
- [x] Build chat endpoint with retrieval-grounded prompt, context size budget, structured citations.
- [x] Validate response citations after model generation; save sessions scoped to repo.
- [x] Never cite another repo. If not enough evidence, answer honestly. If AI unconfigured, explain missing config.
- [x] Render answer, PR/comment source card, author/excerpt/external link and uncertainty/coverage.

**Exit:** a real question about one repo yields a verified GitHub link; unsupported questions don't hallucinate.

## Stage 5 — UI fidelity / metrics

- [ ] Match `design_refs/repository-dashboard.png` and `design_refs/add-repository-modal.png` (do not copy fake metrics).
- [x] Dashboard cards: Decisions, Rejected/Removed Features, PRs Analyzed, Comments Analyzed.
- [x] Tabs Ask DevRecall, Decisions, Rejected/Removed. Responsive sidebar, keyboard-friendly modals and accessible status.
- [x] Count metrics from verified records and show progress denominator when available.
- [x] Implement empty/not_analyzed/indexing/partial/failed/ready and AI-unconfigured states.

**Exit:** demonstrated end-to-end user flow and no broken/placeholder actions.

## Stage 6 — Hackathon quality gate

- [x] Run `npm test`, `npm run lint`, `npm run build`, real/manual smoke test.
- [x] API integration coverage for full pagination, rate-limit handling, app restart, no PRs, duplicate sync, cross-repo citation isolation.
- [ ] GitHub Actions CI on PRs, installs/builds/tests from clean checkout; all passing.
- [ ] Complete `examples/` with actual input (repo URL + question) and actual output with evidence (do not invent output).
- [x] README explains GitHub token, model selection, limitations (public repos, PR only, large repo duration) and demo startup.
- [x] Record honest release limitations and unmet official broader PEP discussion-ingestion requirement if still out-of-scope.

**Exit:** functional end-to-end app, evidence-grounded demo, green CI and compliance docs.

## Prioritization if development time is short

Must have: a real repo add flow, at least one complete testable ingestion route with all comment types and pagination, truthful summary, real indexed chat citations, 3 demo catalog entries. Defer PR-change warnings and advanced semantic search. Never prioritize animation over citations or replace ingestion with fabricated fixture output.
