# DevRecall REST API

Base: `/api/v1`. JSON bodies only; errors use `{ "error": { "code", "message", "retry_after"? } }`. Invalid input is 400, inaccessible GitHub resources 404, rate limits 429, missing AI 503. IDs are numeric GitHub repository IDs; job/session IDs are UUIDs. This contract describes the implemented server, not an unavailable original pack document.

| Method | Route                         | Input / result                                                                                                         |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                     | `{status:"ok", ai:{configured,provider,model}}`; no credentials                                                        |
| GET    | `/demo-repositories`          | `{items:[{full_name,url,description,id:null or real ID,status}]}`                                                      |
| GET    | `/repositories`               | `{items: Repository[]}`; persisted canonical repos only                                                                |
| POST   | `/repositories/resolve`       | `{url}` → `{repository: actual GitHub metadata}`; no writes                                                            |
| POST   | `/repositories`               | `{url}` → `{repository,job}`; validates, persists, enqueues new repo; cached repo opens existing job                   |
| GET    | `/repositories/:id`           | `{repository,summary,job}`; counts from DB                                                                             |
| POST   | `/repositories/:id/sync`      | `{mode?:"sync" or "reanalyze"}` → 202 `{job}`; refreshes metadata, deduplicates active job, resumes partial checkpoint |
| GET    | `/jobs/:id`                   | `{job}` with phase, discovered/fetched/analyzed counts, error and retry time                                           |
| GET    | `/repositories/:id/decisions` | `?q=&rejected=true&offset=0` → `{items,next_offset}`; 50 per page, evidence and alternatives attached                  |
| POST   | `/repositories/:id/chat`      | `{question,session_id?}` → `{session_id,content,citations,claims,insufficient_evidence,coverage}`                      |
| GET    | `/repositories/:id/chat`      | `{session_id,items}` for latest session in selected repo                                                               |

Repository status: `not_analyzed`, `queued`, `indexing`, `analyzing`, `partial`, `ready`, `failed`.

Summary fields: `decisions`, `rejected_removed`, `prs_scanned`, `comments_scanned`, `prs_analyzed`, `comments_analyzed`. Rejected/removed counts only explicit, evidenced feature outcomes. Current decisions and analysis counts exclude stale hashes. Before GitHub resolution the demo catalog has no fabricated ID or metrics.

Citation fields: `source_id`, `excerpt`, `html_url`, `pr_number`, `author_login`, `kind`, `created_at`. Citation URLs and attribution come from the stored GitHub response, never from model output. Every answer claim has at least one validated quote from retrieved evidence belonging to the selected repo. A session from another repo is rejected.
