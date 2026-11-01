## Problem and resulting behavior

DevRecall follows PRD v3: React/Vite/Tailwind, Express/TypeScript, SQLite/FTS5, public GitHub URL-only input and durable PR-only indexing. It recovers decisions and answers repository-scoped questions with exact source citations. The superseded implementation remains in Git history.

The local-model follow-up binds generated source-ID/excerpt pairs to original source fragments so the model cannot rewrite citation text. Independent runtime provenance validation remains unchanged. Ollama context/output/thinking controls are configurable, including fast extraction and thinking chat. Explicit Resume clears stale rate delays after successful GitHub verification.

## Evidence and validation

- **54 backend tests**, **7 desktop/mobile browser tests**, lint/strict TypeScript and production build pass locally. One mobile-only case is intentionally skipped on desktop.
- Actual Qwen3.5 4B Q4_K_M via Ollama 0.40.13 on M4/16 GB fully analyzed **3 PRs and 3 comments** in independent public repo `simonw/sqlite-diffable`, recovering 1 validated decision and rejected alternatives.
- Rationale and maintainer-feedback answers had URLs/quotes independently checked against live GitHub. The browser-submitted rejection question also succeeded. Unsupported quantum-engine question returned insufficient evidence; Sync kept counts/IDs/history; cross-repo session reuse returned `INVALID_SESSION`.
- `examples/qwen35-local-live-run.json` records actual output, model digest, configuration and verification. A separate actual-model synthetic PEP fixture run passed and is explicitly labeled, never seeded into the app.
- Tests cover full pagination (101 PRs × 101 comments), all source kinds, disk/rate recovery, rename/resume, source deletion, stable IDs, stale analysis, multiple excerpts and source/session isolation.
- JSON schema safety tests reject edited whitespace/markup, ellipses, wrong-source pairings and foreign IDs. Independent review found no material regression.
- See `docs/VERIFICATION.md` and `docs/LOCAL_MODEL_SETUP.md` for exact results and limits.

## AI disclosure

Coding assistant: OpenAI Codex; exact underlying session model ID is not exposed. Code, tests and docs were AI-assisted with independent agent code/visual review; human review is still required.

Runtime: Apache-2.0 Qwen3.5 4B Q4_K_M, local Ollama/llama.cpp, 8K context, non-thinking extraction and thinking chat. Fresh installs require explicit configuration. The tested profile pins GGUF because the default MLX alias failed structured-output probing on this runtime. GitHub credentials stayed in backend/test memory and were not committed or sent to the browser. Provenance is not proof of general semantic accuracy.

## Hackathon compliance and limitations

MIT, README, CI, PR template, real examples and a test-only PEP harness are included. No direct merge to main or history rewrite. Roots `c4833b4`/`6c9d3b9` contain only HACKATHON.md; inherited `b744502` contains LICENSE/README and remains a disclosed organizer-compliance gap.

The 3-PR live sample is not a broad benchmark. Large repos need time; inaccessible endpoints remain partial. One local worker/DB, no authentication or complete changed-path graph. PR-only UI does not ingest PEP forums, and the synthetic harness is not blind evaluation coverage. Original screenshot/PDF references were missing, so no pixel-exact or complete event-compliance claim is made.
