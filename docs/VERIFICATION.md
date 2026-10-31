# Verification — 1 November 2026 (Asia/Kolkata)

## Executed checks

| Check                     | Actual result                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                  | Clean install succeeded, 0 dependency vulnerabilities                                                                            |
| `npm run lint`            | ESLint + strict TypeScript passed for server and web                                                                             |
| `npm test`                | **46 passed**, 4 files                                                                                                           |
| `npm run build`           | Express compiled; Vite built 1,583 modules                                                                                       |
| `npm run test:e2e`        | **7 passed**, desktop/mobile; 1 intentionally inapplicable desktop copy of the mobile-only keyboard test skipped                 |
| Browser captures          | Desktop, mobile, add dialog, mobile drawer; no page errors or horizontal overflow                                                |
| Independent code review   | Material findings fixed with failing-then-passing regression tests; final fixes reviewed as resolved                             |
| Independent visual review | Final verdict **ship** at the scope of mobile focus handling and text contrast fixes; original screenshot references unavailable |

Formatting initially identified three files after the clean-install run; they were formatted and the standalone format check rerun. Remote GitHub Actions results must be checked on the actual PR and are not implied by these local checks.

## What was tested

- Real SQLite migrations, FTS5 maintenance, FK behavior, disk reopen and queue recovery.
- 101 PRs with 101 discussion comments each, plus reviews/inline comments, all page traversal, exact source URLs and actual counts from fixture-persisted DB rows.
- Rate limits, retry timestamps, disk restart, duplicate sync, deleted comments, stale-decision suppression, stable IDs, rename/resume and explicit forced reanalysis.
- Explicit AI configuration, provider payloads, invalid JSON, provider failure/recovery and complete oversized-source extraction chunks.
- Repository/PR/context evidence isolation, exact excerpts, multiple same-role excerpts, single/double/backtick literal validation, URL punctuation, cross-repository sessions and insufficient evidence.
- Browser add/verification/queued flow, cited chat rendering, switching repository context, mobile drawer focus/Tab/Escape/restore and responsive overflow.

All model outputs in automated tests are explicit test doubles; they verify the plumbing, not the quality of an installed language model.

## Live checks and limitations

The application resolved real Flask metadata through GitHub REST after the shared unauthenticated quota reset: ID **596892**, owner/name **pallets/flask**, branch **main**. Actual output is in `examples/live-resolve-output.json`. The first attempt hit GitHub's real HTTP 403 rate limit and the API returned a structured reset time.

A real application add/queue/index/poll scan of `millimeow/DevRecall` (ID **1440959880**) completed with zero PRs at capture time. The actual persisted result is in `examples/live-index-output.json`. This empty-corpus success does not claim real PR extraction or a real AI answer; after a new PR is created the next Sync is needed.

After PR #1 was created, a real authenticated read-only worker scan in isolated temporary SQLite fetched **1 PR** and its complete available conversation endpoints (no comments existed), saved the exact PR URL/author/body, then correctly stopped **Partial / AI not configured**. See `examples/live-pr-ingestion-output.json`. It used the existing Git credential in memory only; no token was persisted and no model configuration was changed. The running app's unauthenticated Sync separately hit the shared GitHub rate limit and saved its scheduled retry.

No model is selected or running for this application, and no GitHub token is configured in the new application. Therefore no successful actual-model decision extraction, answer, or PEP evaluation is claimed. The health response in `examples/live-health-output.json` records this explicitly. A real source-linked successful answer remains a release/demo limitation until a model is chosen and run.

Screenshots, official event PDF and the pack's referenced architecture/API/test/demo documents were missing. New implementation documentation was written; pixel-exact screenshot fidelity and full official evaluation coverage cannot be claimed. PR-only ingestion intentionally excludes the broader PEP/forum inputs from the product UI. A synthetic test-only harness exists.

The indexer stops visibly partial on a persistent inaccessible endpoint; it does not skip that failure and label the rest complete. Created-order GitHub pages are not a transactional upstream snapshot; Sync reconciles later edits/deletions. Single API/worker process per DB, public repositories only, no authentication or multi-tenant hosting, keyword retrieval and inline-comment paths only.

## Git and event history

New local initial commit **c4833b4** contains only `HACKATHON.md`. Implementation is on **feat/devrecall-v3**, targeted at **millimeow/DevRecall**. Existing target history includes a compliant HACKATHON-only root **6c9d3b9**, and a second inherited root **b744502** containing LICENSE/README. That inherited root does not follow the supplied first-commit rule; it is disclosed and preserved. The CI history audit verifies a compliant baseline and warns on inherited noncompliant roots. It does not rewrite them or pretend the event requirement has been retroactively repaired.

The feature branch was pushed and [PR #1](https://github.com/millimeow/DevRecall/pull/1) opened against `main`; no merge to main was performed. GitHub's feature-branch [CI run](https://github.com/millimeow/DevRecall/actions/runs/41252057344) passed. PR-specific CI is checked separately on the PR.
