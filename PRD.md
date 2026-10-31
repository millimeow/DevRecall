# DevRecall — Product Requirements Document (v3, Codex source of truth)

**Project:** Hacktoberfest 2026 — Problem 06, Open Source Decision Intelligence and Knowledge Recovery\
**Status:** Approved concept / implementation specification, NOT a claim of completed functionality\
**Last revised:** 2026-11-01\
**Frontend:** React + Vite + Tailwind CSS + TypeScript\
**Backend:** Node.js + Express.js + TypeScript\
**Database:** SQLite + FTS5 (**do not use PostgreSQL, MongoDB, or FastAPI**)\
**AI:** Pluggable open-weight model adapter; no model selected yet\
**Input:** Public GitHub repository URLs **only** (no text upload, file upload, or issue URL as a user input)

## 0. The one-sentence product

A user pastes a public GitHub repository URL; DevRecall indexes its pull requests and their conversations, extracts evidence-backed engineering decisions, then lets the user ask **why** something was chosen, rejected, changed, or removed—and links the exact GitHub PR/comment that supports each answer.

## 1. Why this is being built

Software teams discuss technical decisions inside pull requests, review threads, and comments. The merged result usually shows **what** changed, not **why** a design choice was made or an alternative rejected. Contributors leave; context disappears; new team members repeat failed ideas. DevRecall turns historical PR conversations into a searchable, cited repository memory.

### Relation to the official hackathon statement

The PDF asks for recovery of decisions and rationale, rejected alternatives and rejection reasons, source-code connections, original discussion references, and surfacing decisions when later PRs touch associated code. Its evaluation emphasizes extracting rejected ideas and reasons from Python PEP discussions **without the final PEP**. This PRD intentionally narrows the **user-facing input** to GitHub repository URLs and the **ingested data** to PR-related material, per the latest product decision. This trade-off means some organizer PEP-discussion evaluation inputs may fall outside the live UI's supported sources. Include a **test-only, offline evaluation harness** for PEP-style discussion fixtures to evaluate the extractor without adding a second UI input type. Do not claim full evaluation coverage based solely on GitHub PR ingestion.

## 2. Product goals, in priority order

- **P0:** Support arbitrary valid, accessible public `github.com/owner/repo` URLs (including a trailing slash and `.git` form); validate via the GitHub API; handle nonexistent, private/inaccessible, archived, renamed, empty, and large repos honestly.
- **P0:** Ingest **ALL** accessible pull requests (open and closed) and their PR bodies, regular discussion comments, PR reviews with textual bodies, and inline code-review comments. Follow GitHub API pagination to completion, checkpoint progress, and resume failures; do not silently sample.
- **P0:** Build repository-specific, evidence-backed AI question answering. Answers include short explanations and deep links to exact comments/PRs; explicitly state when there is insufficient evidence.
- **P0:** Extract structured decisions and explicitly rejected/removed features from PR evidence; do not equate closed PRs with rejected features.
- **P0:** Provide real demo repositories in the sidebar and an Add Repository modal matching the supplied design references. Demo repositories are real links, **not fabricated analysis results**.
- **P0:** Show truthful dashboard counts and ingestion coverage: decisions found, features rejected/removed, PRs analyzed, comments analyzed, last indexed, state.
- **P1:** Cached reload of previously indexed repositories; user-triggered **Re-analyze / Sync**. Sync should check updated PRs/comments and preserve prior chats and IDs where possible.
- **P1:** Search/filter extracted decisions and see cited source excerpts.
- **P2:** Surface related past decisions when a new PR touches an associated path (optional upgrade; not in the primary UI flow).

## 3. Explicit non-goals for this version

- No generic GitHub issue ingestion, forums, standalone GitHub Discussions, commits-only mining, wiki, documentation crawling, repository code execution, or local file uploads. PR *conversation* includes issue-style comments attached to PRs only.
- No fully automated GitHub App that posts on external projects. **Never** write comments, issues, or PRs to other repositories.
- No PostgreSQL, MongoDB, FastAPI, or dual-DB migration.
- No fake charts, fake analyzed statuses, fabricated comments, invented comment URLs, or hardcoded AI answers.
- No claim that all GitHub repositories can be fully indexed instantly; rate limits, archived PR counts, permissions and model throughput still apply.

## 4. People and primary flows

### Persona: New project contributor

Wants to know why a design was selected. Opens a saved repo, asks "Why was this caching approach rejected?", receives a concise explanation with a link to the reviewer comment and PR.

### Persona: Maintainer

Wants to understand previous rejected alternatives, recent removals and design tradeoffs. Checks summary counts, browses decisions, and clicks citations to audit the AI.

### Flow A — Add repo

1. Click **Add Repository** in sidebar.
2. Modal asks for *only* a GitHub repo URL.
3. Validate URL in frontend; backend resolves through `GET /repos/{owner}/{repo}` to canonical `id`, `full_name`, and default branch; don't trust client-derived metadata.
4. Show actual repository name/description if successfully fetched; never display invented stars or metrics.
5. Click **Analyze Repository**.
6. If known, open cached data and show current progress and manual Sync control; don't start duplicate jobs.
7. If new, create repository and enqueue durable full PR ingestion; return immediately with a job ID and progress view.
8. Allow navigate away and back; job survives reload and restart.

### Flow B — Index repo

1. List PRs with `state=all`, pagination (`per_page=100`), persist each PR including body and metadata.
2. For every PR, fetch its regular issue-style comments, review summaries with bodies, and inline review comments. Save exact GitHub `html_url`, author, timestamps, kind, PR number; deduplicate by GitHub IDs and source kind.
3. Normalize discussion into chronological, attributed text segments; preserve each segment's source ID and deep link.
4. Extract candidate decisions/alternatives with the configured model. Validate evidence references against stored source records and verify cited quotes are present in source text. Reject invalid citations; mark weak interpretations uncertain.
5. Save normalized decisions and supporting evidence; update FTS indexes and aggregate counts.
6. Track PRs scanned, comments scanned, PRs analyzed, decisions, coverage and errors; finish `completed` only when every accessible PR is indexed and analyzed. If endpoint limits block coverage, use `partial` with explicit reason.
7. For large repos, process in pages/batches; write checkpoints and continue asynchronously without exhausting Express request timeouts.

### Flow C — Ask repository question

1. User selects a repo in sidebar; ask box is always scoped to `repo_id`.
2. Backend checks index state, retrieves relevant PR/comment evidence with SQLite FTS5 and decision matches, and re-ranks if available.
3. Configured model answers using only retrieved context, with source IDs and precise citation URLs.
4. Backend ensures every cited source belongs to this repository and exists in the DB, and that quotes are exact substrings or non-quoted paraphrases tied to sources.
5. UI displays explanation, cited PR number, author, small excerpt, clickable deep link. If information absent, says "I couldn't find evidence for this in the indexed PRs/comments." Never guess.
6. Save chat history scoped to repository (simple local app; no accounts required for MVP).

### Flow D — Demo repos

At first startup seed sidebar with **real public repo entries** `pallets/flask`, `django/django`, `python/cpython` (or the configuration list in `config/demo-repositories.json`). These are examples of repository links, **not pre-analyzed data**. Each begins as `Not analyzed`, has a working Analyze button, and can be indexed from GitHub using the same path as user-added repos. User should not need to type a URL to discover examples. Optionally start a clearly marked, limited **Preview Index** on a subset, but never call it a full scan; for MVP, prefer on-demand full scanning. For an instant offline product walkthrough, a separately labeled **synthetic test fixture** is allowed only in automated tests—not as a supposedly real GitHub decision.

## 5. Screens and UX acceptance

### Sidebar

Logo `DevRecall`; **Repositories**; **Add Repository** action; list with GitHub icon, canonical owner/name, status dot. Active repo highlighted; persist last selected repo. Status values: `Not analyzed`, `Queued`, `Indexing`, `Analyzing`, `Partial`, `Ready`, `Failed`. Responsive drawer on mobile.

### Main repo view

Header: canonical repo name and external GitHub link, index/coverage status, last analyzed, **Re-analyze** button. Four metrics: **Technical Decisions**, **Features Rejected/Removed**, **PRs Analyzed**, **Comments Analyzed**. Optional features-added metric only if grounded in extracted evidence. Tabs: **Ask DevRecall** (default), **Decisions**, **Rejected / Removed**. Chat responses have compact evidence card with linked `PR #`, linked exact comment, author, timestamp, and snippet; a repository-scoped input fixed near bottom. States: initial, indexing, partial, ready, empty, error, missing AI config. Stats show coverage labels (e.g. "73 of 910 PRs scanned") during indexing, not misleading totals.

### Add Repository modal

Matches `design_refs/add-repository-modal.png`: title, single URL input, verification/progress, verified repo preview, plain-English "We will fetch all PRs and comments and extract decisions", Analyze button, error messages. No other source selector.

### UI visual style

Match references `design_refs/repository-dashboard.png` and `design_refs/add-repository-modal.png`: restrained dark navy sidebar, light main dashboard, violet accent, rounded cards, airy typography; accessibility AA-ish contrast, keyboard navigation, visible focus, loading skeletons. **Mockup text and numbers are illustrative only**; never ship them as actual metrics.

## 6. Data and semantics

### Definition: decision

A discernible engineering choice supported by PR evidence (e.g. adopt approach X, reject alternative Y, remove feature Z). Distinguish `accepted`, `rejected`, `removed`, `proposed`, `uncertain` outcomes. An open PR or a reviewer's idea does **not** imply consensus. Derive status from the conversation; consider `merged_at` as supplemental evidence but not proof that every suggestion was accepted.

### Definition: rejected/removed feature metric

Count distinct extracted **feature-related** decisions with outcome `rejected` or `removed` and verified evidence. Do not count all closed-unmerged PRs or duplicate alternatives as removals. Display `0` if no verified instances were found; optionally warn "few PRs analyzed" when coverage is low.

### Definition: evidence

Each claim references stored `pr_body`, `issue_comment_on_pr`, `review`, or `review_comment` entry with GitHub `html_url`. Evidence excerpt must be taken from actual persisted content. Evidence from the wrong repo or fake URL must be rejected. Citations can include PR body as PR link when no more specific comment exists.

### Definition: any repo

Any **public, accessible, GitHub.com** repository URL in `https://github.com/{owner}/{repo}` format, without being limited to hardcoded demo names. Not GitLab, private repos without auth, Gists, user profiles, or individual PR URLs. For huge repos, process may take time; show progress/errors and persist resumable cursor. GitHub API and AI costs/limits bound throughput.

## 7. Technical architecture

```text
React/Vite/Tailwind (web)
   | HTTPS REST + job status polling
Express.js/TypeScript API
   |-- URL validator and GitHub repo resolver
   |-- Octokit GitHub PR ingestion worker (read-only)
   |-- PR/comment normalizer + SQLite persistence
   |-- AI adapter (model/provider configurable, required for extraction and Q&A)
   |-- evidence validation + FTS5 retrieval
   |-- repository summary and Q&A APIs
   `-- SQLite (one DB file with migrations, FTS, WAL)
```

**Recommended dependencies:** `express`, `@octokit/rest` or `octokit`, `better-sqlite3`, `zod`, `cors`, `helmet`, `pino`, `dotenv`, `uuid`, `vitest`, `supertest` for API; React Router, TanStack Query, Tailwind, lucide-react. Only install what is needed. Prefer modern supported releases; check compatibility. Use a pluggable adapter interface rather than binding business logic to any specific AI service. At minimum support an Ollama-style local adapter and return a visible `AI_NOT_CONFIGURED` error until configured; no fabricated fallback.

### Security and operational rules

- Backend only holds GitHub token and AI credentials, loaded from `.env`; never put secrets into Vite env or committed artifacts.
- Allowlist `github.com` hostname; parse URL locally then construct Octokit requests from validated `owner`/`repo` strings—never fetch an arbitrary supplied URL (SSRF defense).
- Fetch public data only; sanitize markdown/HTML rendering; no execution of repo code.
- Paginate every endpoint; bounded concurrency and retry/backoff for primary and secondary rate limits (`Retry-After`, remaining/reset); queue persisted in SQLite.
- SQLite `foreign_keys=ON`, WAL, transactions per PR/decision upsert. Implement graceful shutdown and resume interrupted jobs.
- Prevent cross-repository context leaks by enforcing `repo_id` filters at retrieval, citations, session storage and every API.

## 8. Implementation milestones / order

**M0 — Baseline**: inspect repo; ensure HACKATHON.md was only first commit (if first commit already exists, don't rewrite history); make changes in branch/PR; establish monorepo, CI, README, MIT or Apache-2.0 license, examples directory, .env.example.

**M1 — Real database and API**: SQLite schema/migrations, repo resolver, GitHub URL validator, `/api/repositories` list/add/details, seed three real demo links, state-driven UI with no fake counts.

**M2 — Full GitHub ingestion**: read all PR pages, issue comments on each PR, PR review summaries and inline review comments; persist sources, dedupe, checkpoints, progress, resume. Test fixture pagination and rate limits.

**M3 — AI and evidence**: configurable adapter, deterministic JSON extraction schema, chunking, decision persistence, evidence validator, repository FTS5 search, Q&A grounded in selected repo.

**M4 — Finished interface**: sidebar, add modal, metrics, decisions/rejected views, chat/citations, polished statuses, mobile responsiveness.

**M5 — Quality and demo**: integration/e2e tests, repo URL edge cases, test-only PEP-discussion harness, real source-linked `examples/`, CI green, manual smoke verification.

## 9. Minimum acceptance criteria (release gate)

- [ ] Adding an arbitrary **valid public** GitHub repo URL saves the canonical repo and starts a real analysis job.
- [ ] Three real demo repository links appear in sidebar; none are falsely labeled pre-analyzed.
- [ ] GitHub ingestion includes all PR states and regular PR comments, review bodies, and inline review comments, with complete pagination (or explicit partial status + reason).
- [ ] Indexing resumes after interruption without duplicate PRs/comments/decisions.
- [ ] Ask a repository-specific question and get an evidence-grounded reply with a clickable exact source link, or a truthful "not found".
- [ ] Question on repo A cannot cite repo B.
- [ ] Summary counts equal DB records under specified definitions; UI doesn't use hardcoded sample totals.
- [ ] Manual Sync refreshes updated PRs; repeated Sync is idempotent.
- [ ] No model configured => clear configuration error, never mock AI output.
- [ ] CI tests cover URL validation, pagination, comments, evidence validation, FTS, metrics, chat isolation, error paths and resume.
- [ ] First hackathon commit rules, PR template, LICENSE, README, CI, and actual `examples/` satisfied.

## 10. Official source references

- Uploaded Hacktoberfest 2026 PDF: Problem 06 on pages 12–13, mandatory repository rules on pages 18–21; use as hackathon authority.
- GitHub REST [PRs](https://docs.github.com/en/rest/pulls/pulls), [issue-style comments](https://docs.github.com/en/rest/issues/comments), [reviews](https://docs.github.com/en/rest/pulls/reviews), [inline review comments](https://docs.github.com/en/rest/pulls/comments), [repos](https://docs.github.com/en/rest/repos/repos), [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

### Source-of-truth precedence

1. This v3 PRD and user's latest requirements > prior v1/v2 docs; 2. `docs/ARCHITECTURE.md`, `docs/API_SPEC.md`, schema > ambiguous older planning notes; 3. Uploaded event PDF governs hackathon compliance. **Do not restore the rejected dual-database plan or FastAPI.**
