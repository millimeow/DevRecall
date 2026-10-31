# Implementation architecture

This is implementation documentation written during the build; the pack's referenced original was not supplied.

## Boundaries

`web` is a React/TypeScript Vite application with Tailwind and a small component stylesheet. `server` is Express/TypeScript. `github.ts` only makes read-only requests to `api.github.com`, follows same-origin redirects, constructs endpoints from parsed owner/name pairs, rejects private repositories, and normalizes rate-limit errors without reflecting upstream secrets.

`db.ts` opens SQLite with foreign keys, WAL and a busy timeout. Numbered transactional migrations apply the supplied logical schema, install FTS5 maintenance triggers and job cursors, and extend evidence identity to preserve multiple excerpts. Numeric GitHub repository IDs survive renames. Demo slugs are a separate JSON catalog until resolved; synthetic numeric GitHub IDs are never assigned.

## Durable worker

One background worker processes a SQLite-backed queue. `queued` → `running` → `completed` or `partial`; the repository separately exposes queued/indexing/analyzing/ready/partial states. On startup, interrupted running jobs return to queued. No network request is held open for an entire index.

Discovery traverses `pulls?state=all&sort=created&direction=asc&per_page=100`. PRs, bodies and progress are committed with each complete page; the saved cursor advances atomically. Created order reduces shifting pages as existing PRs update. GitHub pagination is not a point-in-time snapshot: concurrent upstream changes can require the next Sync to reconcile.

Each PR then traverses all pages of `issues/:number/comments`, `pulls/:number/reviews`, and `pulls/:number/comments`. Source writes and endpoint/page checkpoints commit together. Source IDs include repo, kind and upstream ID. No issues are enumerated independently. Empty review text is ignored. Exact returned `html_url`, attribution, timestamps and inline paths are preserved.

An interrupted endpoint resumes from its saved page. Old comments are removed only after every conversation endpoint has completed successfully, using per-job seen markers. Per-PR normalized hashes determine whether analysis needs refreshing. Refresh invalidates the current analysis badge before mutating its sources; stale decision rows are hidden while retained for stable-ID replacement. Hash/checkpoint updates are transactional. Sync is conservative and refetches every PR conversation so changed/deleted comments are detected.

Primary reset times and secondary Retry-After values become durable retry timestamps. Secondary 403 limits without explicit retry headers receive a minimum backoff. Network failures retry after a delay. Other failures remain visibly partial until manual resume. One request at a time bounds concurrency. A single inaccessible endpoint currently stops the job at that checkpoint rather than skipping ahead; this is shown as partial, never full completion.

## AI and provenance

`ai.ts` supports explicitly selected Ollama or self-hosted OpenAI-compatible models. Missing configuration is an error. JSON schemas constrain decisions, outcomes, categories, alternatives, reasons and citations. PR text and questions are untrusted data in prompts. Extraction traverses all source chunks without dropping oversized comments.

`evidence.ts` validates source ownership, PR scope, exact quote substrings, retrieved-context membership, and stored GitHub URL shape. All candidate decisions validate before an atomic replacement. Multiple distinct excerpts are retained. FTS tables update through insert/update/delete triggers; queries JOIN canonical tables and filter repo ID explicitly, never rely on the UNINDEXED FTS repo field.

Chat retrieves both direct source hits and evidence attached to current decision hits. Query-centered windows preserve late matches in oversized sources and bound prompt size. Each generated claim requires citations; literal quotations in prose and emitted URLs are also verified. Model-authored URLs never replace DB URLs. Missing evidence produces a fixed honest insufficient-evidence statement. All model factual paraphrases remain auditable judgments, not deterministic semantic proofs.

Chat sessions and source citations are always scoped to repository identity. The user/assistant pair is saved transactionally after validation. Existing chat history remains historical when sources later change; its saved excerpts/URLs show what was cited at the time, not a claim that upstream content is immutable.

## Operations

Default deployment is local, one API/worker process per SQLite database. The dev UI uses a Vite proxy; production Express serves `web/dist`. Credentials are backend environment variables. Graceful shutdown pauses at a persisted boundary; requests have timeouts. Full horizontal worker leasing, authentication, semantic search and a complete changed-path graph are out of scope.
