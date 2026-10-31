# DevRecall — Codex Build Pack (v3)

**DevRecall** is a GitHub pull-request memory and question-answering app. Provide a **public GitHub repository URL**, let DevRecall traverse the repo's PRs and their discussion/review comments, then ask why decisions were made, what ideas were rejected, and which exact PR/comment supports the answer.

This pack is a **specification and reference bundle**, not a finished source-code implementation.

## Finalized stack

| Layer | Technology |
|---|---|
| Web UI | React + TypeScript + Vite + Tailwind CSS |
| Backend | **Node.js + Express.js + TypeScript** |
| Persistence + keyword search | SQLite + FTS5 |
| GitHub | Octokit / GitHub REST API, public read-only data |
| AI | Configurable open-weight model adapter, model/provider not chosen yet |
| App input | GitHub repo URL **only** |

Older plans mentioning FastAPI, PostgreSQL or MongoDB are **superseded**.

## User experience

- Sidebar lists real demonstration repositories (Flask, Django, CPython) and Add Repository.
- Add Repository modal accepts only `https://github.com/owner/repo`, validates and previews actual repo details, then starts real indexing.
- Indexer retrieves **all accessible open + closed PRs, PR body, issue-style comments attached to PRs, review bodies, and inline review comments**; stores deep links to individual comments.
- Top dashboard shows real decisions, features rejected/removed, PRs analyzed, comments analyzed, last scan, indexing coverage.
- Ask DevRecall is a repo-scoped chat interface. The model reasons over stored PR evidence; answers include links to exact GitHub source comments and honest uncertainty.
- Existing repo opens cached data. Manual Sync updates it.

## Demo repos

- [pallets/flask](https://github.com/pallets/flask)
- [django/django](https://github.com/django/django)
- [python/cpython](https://github.com/python/cpython)

They're **real links but not pre-analyzed**. When user selects Analyze, they run through the same genuine ingestion process as custom repos. Large projects may require considerable GitHub/API/model time; UI displays progress rather than fake "complete" data.

## Files in this pack

```text
AGENTS.md                         Codex agent constraints and definition of done
PRD.md                            Full user requirements and acceptance criteria
CODEX_TASKS.md                    Ordered implementation stages
README.md                         This guide
.env.example                      Config placeholders, no secrets
config/demo-repositories.json     Real starter repository links
db/schema.sql                     Concrete SQLite relational schema + FTS5
docs/ARCHITECTURE.md              GitHub ingestion, AI evidence checks, job design
docs/API_SPEC.md                  Express REST API request/response contracts
docs/TEST_PLAN.md                 Unit, integration and end-to-end acceptance
docs/DEMO_SETUP.md                Demo UX and non-fabrication instructions
fixtures/peplike-synthetic-discussion.json  Test-only rejected-alternatives fixture
design_refs/repository-dashboard.png        Prior approved concept screenshot
design_refs/add-repository-modal.png        Prior approved add-repo screenshot
```

## How to use with Codex

1. Extract ZIP and copy specification files into the **existing project** (or create a new repo only if permitted by event workflow).
2. Read `AGENTS.md` and `PRD.md` first. `CODEX_TASKS.md` is the execution order.
3. Configure local `.env` from `.env.example`. Store GitHub and model credentials privately. **Never paste secrets into source or commit them.**
4. Have Codex implement the application, not just the UI mockups.
5. Run and verify tests, sample real GitHub source citation, and recorded example output.

Paste the following in Codex:

> Read AGENTS.md, PRD.md, CODEX_TASKS.md, docs/ARCHITECTURE.md, docs/API_SPEC.md, db/schema.sql, docs/TEST_PLAN.md and design_refs before writing code. The user has finalized Express.js + SQLite, PR-only ingestion, URL-only input, real demo repos, repository-scoped cited Q&A. Implement in order, use actual data, do not hardcode counts/citations, preserve first-commit/PR hackathon rules. Start by inspecting the repository, then implement actual code, run tests and document results.

## Real-world limitations and evaluation

- Only **public GitHub.com** repositories are supported in MVP. Private repos and GitLab are out of scope.
- No AI provider/model has been chosen; until configured, ingestion may fetch real PRs but decision extraction/chat must show an honest configuration error.
- The official PDF for Problem 06 also covers discussions outside PRs (for example PEP forum threads). The user intentionally restricted this product's ingestion to **PRs and their comments**, so the PR-only product may not fully satisfy the official PEP-discussion evaluation dataset. A **test-only** PEP-style fixture harness is prescribed to verify the same extraction engine without changing the UI input format.
- GitHub's rate limits require a token for practical large scans. Correct pagination, robust backoff and durable progress matter as much as the AI.

## Hackathon compliance note

According to the provided PDF, the **first commit** in a new hackathon repository must contain **only HACKATHON.md**; later changes must enter via pull requests with mandatory PR template and passing CI. Required final files include MIT/Apache-2.0 license, README, `.github/pull_request_template.md`, `.github/workflows/ci.yml`, and `examples/` with real inputs/outputs. Do not rewrite an existing first commit. Do not post automated issues or comments to third-party repositories.

## API documentation references

- https://docs.github.com/en/rest/pulls/pulls
- https://docs.github.com/en/rest/issues/comments
- https://docs.github.com/en/rest/pulls/reviews
- https://docs.github.com/en/rest/pulls/comments
- https://docs.github.com/en/rest/repos/repos
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
