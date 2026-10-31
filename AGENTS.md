# Instructions for Codex / coding agents

## Mission

Build **DevRecall v3** as defined in `PRD.md`. Do real engineering, not static mockup-only pages. The product accepts only public GitHub repository links, reads their **pull requests and PR-linked comments/reviews**, extracts evidence-backed decisions, and answers repository-scoped natural-language questions with direct GitHub source citations.

## Non-negotiables

1. **Backend is Node.js + Express.js + TypeScript; frontend React/Vite/Tailwind; DB SQLite/FTS5.** Do not use FastAPI, PostgreSQL or MongoDB. Latest user requirements replace all older plans.
2. **PR only**, including PR bodies, standard issue-style PR discussion comments, review bodies, and inline review comments. Do not ingest standalone issues or unrelated forums.
3. Users add repositories by `https://github.com/owner/repo` URL **only**. A test-only extractor harness may read fixtures but the product must not expose other input formats.
4. Sidebar contains the real demo repository links in `config/demo-repositories.json`. They are displayed as `Not analyzed` until actual indexing. No seeded fictional metrics, comments or AI answers.
5. Handle all accessible PR pages with resumable background jobs, explicit rate limits, and honest `partial` states. Never quietly process 20 PRs and call it done.
6. Every AI factual answer must have validated source evidence from **the selected repo**, or honestly state insufficient evidence. Preserve original `html_url` from GitHub; never invent citations.
7. Make AI provider/model configurable. No model has been selected; never silently use a cloud API or fake fallback. Require user config to enable extraction and answers.
8. Preserve hackathon workflow: first commit only `HACKATHON.md`, later changes via PRs. Check history rather than trying to rewrite it. MIT/Apache-2.0 license, README, CI, PR template, examples directory must exist.
9. Don't execute untrusted repository code, automatically post PR comments, or leak tokens. Public read-only operations only.

## Sources of truth

`PRD.md` > `docs/ARCHITECTURE.md` > `docs/API_SPEC.md` > `db/schema.sql` > `docs/TEST_PLAN.md` > prior docs. Official Hacktoberfest 2026 PDF governs event requirements. Do not interpret the screenshot's sample figures as real data.

## What to do first

1. Inspect existing files and git history. Explain what exists and what must change.
2. Read PRD and all docs. Print a concise implementation checklist; then **implement**, don't stop at planning.
3. Set up workspaces, database migrations, API/route tests, and README development instructions.
4. Add demo repos sidebar and real URL resolution; then indexing worker, AI adapter, validation, QA and dashboard.
5. Run tests/lint/build. Do not claim passing tests if they weren't run. Produce a completion report with setup steps, demo walkthrough, actual test output summary and limitations.

## Definition of done

A new arbitrary public GitHub repository can be added, indexed through every accessible PR and associated comments with resumable progress, then queried in a working UI. Responses show exact verified GitHub evidence links or explicitly lack evidence. The 3 demo repos are usable via the same flow; metrics reflect DB. Tests cover pagination, provenance, repo isolation, rate limits and reset/resume. GitHub Actions CI is green.

## Recommended commit/PR stages

`feat/initial-api-and-db`, `feat/github-pr-indexer`, `feat/ai-decision-extractor`, `feat/chat-and-evidence`, `feat/dashboard-and-demo`, `test/ci-and-examples`. Do not direct-commit main after initial HACKATHON.md commit. Keep each PR template complete, disclose model and coding assistant usage, and link tests.
