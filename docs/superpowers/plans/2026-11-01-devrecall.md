# DevRecall Implementation Plan

Goal: implement the supplied PRD v3 with genuine public PR ingestion and repository-scoped citations.
Architecture: npm workspaces, Express service, durable SQLite jobs, React dashboard. No hosting changes; Cloudflare Sites cannot host this requested persistent Express/SQLite worker unchanged.
Spec: ../../../../PRD.md and CODEX_TASKS.md. User explicitly requested implementation without stopping at planning.

## Global constraints

Public GitHub URLs only; PR-linked sources only; no fictional data; no implicit model selection; exact stored source citations; HACKATHON-only first commit; feature-branch delivery.

## Review focus

Interrupted page fetches must replay idempotently; renamed repos resolve by numeric ID; malicious model output must fail closed; provider failure must retain prior valid analysis; chats and citations must never cross repos.

## Ordered tasks

- [x] Stage 0: workspace, health test, lint/build scripts, license, CI and template.
- [x] Stage 1: db.ts migrates supplied schema; github.ts validates/resolves URLs; app.ts exposes catalog and repository APIs; test API validation and FK/FTS.
- [x] Stage 2: worker.ts paginates every source endpoint with persisted per-PR/page progress, backoff and resume; test 101 PRs, 101 comments, all source kinds, retry, restart, empty repo and sync.
- [x] Stage 3: ai.ts implements explicitly configured providers, bounded source chunks, structured outputs and exact quote validation; evidence.ts persists/retrieves cited decisions; test invalid refs and fixture rejection rationale.
- [x] Stage 4: chat.ts retrieves only selected repo with FTS and validates every answer claim; test unsupported questions, wrong repo, history and provider failures.
- [x] Stage 5: React sidebar, repository modal, truthful metrics, progress, decisions and cited chat. Match supplied navy/light/violet description because screenshot files are missing. Verify desktop/mobile browser workflows.
- [x] Stage 6: run npm test, npm run lint, npm run build and e2e; record actual live GitHub smoke output, limitations and PR handoff.

Each behavior is specified in failing tests before implementation, then verified. Work occurs in the requested empty workspace on feat/devrecall-v3. No unrelated checkout is changed. No remote or GitHub CLI is configured here; prepare a complete PR body and report remote CI/PR as pending rather than claim it exists.

Release limitations: actual-model extraction/chat and original screenshot comparison remain unverified. See docs/VERIFICATION.md. Remote delivery is tracked in docs/PR_BODY.md.
