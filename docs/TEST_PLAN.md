# Test and verification plan

The supplied pack did not include its referenced test-plan file. These checks describe the implemented test suite.

`npm test` runs Vitest, real in-memory/on-disk SQLite, injected GitHub HTTP responses and explicit model doubles. Synthetic evidence is never copied into the product database.

- URL validation: HTTPS host allowlist, trailing slash/.git, userinfo, paths, queries, ports, missing repos and private metadata.
- API: health, demo catalog without fabricated IDs, canonical metadata resolution, deduplicated jobs, accurate zero summaries, structured input/not-found/missing-AI errors.
- Migrations: repeat open preserves data, foreign keys, FTS availability and ordered version records.
- Ingestion: 101 PRs × 101 issue comments plus reviews/inline comments; all states; exact source kinds; complete pagination.
- Durability: rate-limit checkpoint, disk reopen, running-job recovery, idempotent sync, deleted comments, retained chat, interrupted-sync stale-decision suppression, canonical rename during resume.
- Model boundary: explicit provider/model, Ollama and compatible payloads, invalid JSON, redacted provider errors, analysis recovery, complete oversized-source chunking.
- Evidence: wrong repo/PR, fabricated excerpt, fabricated literal quote, multiple same-role excerpts, valid canonical GitHub citations, stable decision IDs and transaction rollback.
- Retrieval/chat: FTS metacharacter escaping, repo isolation, late passage in oversized comments, unsupported question, saved history, cross-repo session rejection.
- Synthetic PEP fixture: reject an alternative with rationale without access to a final PEP. A separate CLI runs the actual selected model; a schema-fixture test does not claim real model quality.

`npm run test:e2e` runs Chromium at 1440×1000 and 390×844. It verifies real demo navigation, URL-only modal, invalid-host error, Escape dismissal, verification/queued workflow, empty decision state and no horizontal overflow. HTTP metadata is explicitly synthetic within the tests. Dedicated ports/in-memory DB prevent interference with unrelated local apps.

`npm run lint` runs ESLint and strict TypeScript in both workspaces. `npm run build` compiles Express and bundles React. The GitHub Actions workflow repeats clean install, lint, tests, build and browser checks on pull requests.

Manual/live release checks require an available GitHub API budget and explicitly configured model: add a real repository, scan it, audit an extracted decision, ask a question, inspect its exact source, restart, and Sync. If unavailable, record the actual errors and mark live semantic verification incomplete; do not treat synthetic tests as a real AI demo.
