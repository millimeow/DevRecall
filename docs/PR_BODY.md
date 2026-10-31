## Problem and resulting behavior

The previous application uses superseded database/source workflows. This implementation follows PRD v3: a public GitHub repository URL starts a durable PR-only scan, stores every accessible PR conversation page in SQLite, extracts decisions with an explicitly configured open-weight model, and answers repository-scoped questions with validated GitHub citations.

React/Vite/Tailwind dashboard includes Flask/Django/CPython as unanalyzed links, URL verification, actual DB metrics, durable progress/error states, decisions/search, and cited chat. Express/TypeScript serves the API and production UI. Ollama and self-hosted compatible model adapters are implemented; no model is silently selected.

## Evidence and validation

- Clean `npm ci`, strict TypeScript/ESLint, unit/API tests, production build, desktop/mobile browser checks, and format checks were run locally; see `docs/VERIFICATION.md` for exact results.
- Ingestion tests cover 101 PRs × 101 discussion comments plus reviews/inline comments, rate-limit disk resume, sync/delete reconciliation, rename recovery and analysis failures.
- Review regressions cover stale evidence, stable IDs, long-comment retrieval, multiple excerpts, cross-repo citations/sessions, fabricated quotations, and URL validation.
- Browser tests cover add/verify/queue, real demo navigation, keyboard drawer, cited chat and repository switching with explicitly synthetic test HTTP fixtures.
- Actual live GitHub metadata resolution for `https://github.com/pallets/flask` is recorded under `examples/`; no real model extraction or fabricated answer is claimed.
- Dependency audit reports zero vulnerabilities after development-tool patches.

## AI disclosure

Coding assistant: OpenAI Codex. The session's exact underlying model identifier is not exposed here. Codex generated implementation, tests and documentation; independent code/visual reviewers identified issues subsequently fixed with regression tests. Human review is still required.

Runtime provider/model during build: **not configured**. Model calls in automated tests are explicitly injected test doubles. The actual adapter supports user-selected open-weight models and fails clearly without configuration. Source provenance and exact quote checks do not prove paraphrase entailment or extraction accuracy.

## Hackathon compliance and limitations

- Local initial commit `c4833b4` contains only `HACKATHON.md`; existing target history is preserved. Target root `6c9d3b9` also contains only `HACKATHON.md`; inherited root `b744502` contains LICENSE/README and is disclosed as an existing event-compliance gap, not rewritten.
- MIT license, README, PR template, CI workflow, real input/output examples and test-only PEP-style harness are included.
- PR-only UI intentionally does not satisfy broader PEP/forum ingestion evaluation. A real selected-model demonstration remains outstanding.
- Original screenshot/PDF and auxiliary pack documents were missing; the UI follows the supplied PRD visual description. Missing architecture/API/test documents have implementation replacements.
- One local API/worker process per SQLite DB; inaccessible endpoints remain visibly partial; huge repos require API/model time. Complete changed-path analysis, authentication, semantic reranking and automatic future-PR warnings are deferred.

This PR replaces the superseded application tree; legacy implementation remains accessible through Git history. No merge to main or history rewrite is requested.
