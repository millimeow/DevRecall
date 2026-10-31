-- DevRecall v3, SQLite 3.x + FTS5. This is the logical starter schema for Codex.
-- Codex must implement ordered idempotent migrations, not blindly rerun this SQL.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY,                    -- canonical numeric GitHub repo ID
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  description TEXT,
  default_branch TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  status TEXT NOT NULL DEFAULT 'not_analyzed' CHECK (status IN ('not_analyzed','queued','indexing','analyzing','partial','ready','failed')),
  total_prs_known INTEGER,
  last_indexed_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_repositories_full_name ON repositories(full_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS pull_requests (
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  github_pr_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  html_url TEXT NOT NULL,
  author_login TEXT,
  state TEXT NOT NULL CHECK (state IN ('open','closed')),
  merged_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  changed_paths_json TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT,
  last_ingested_at TEXT,
  last_analyzed_hash TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending','analyzing','done','error')),
  analysis_error TEXT,
  PRIMARY KEY (repo_id,number),
  UNIQUE (repo_id,github_pr_id),
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_prs_updated ON pull_requests(repo_id,updated_at);

CREATE TABLE IF NOT EXISTS pr_sources (
  id TEXT PRIMARY KEY,                         -- kind:github_id, e.g. issue_comment_on_pr:123
  repo_id INTEGER NOT NULL,
  pr_number INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pr_body','issue_comment_on_pr','review','review_comment')),
  github_source_id TEXT NOT NULL,
  author_login TEXT,
  body TEXT NOT NULL,
  html_url TEXT NOT NULL,
  path TEXT,
  in_reply_to_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (repo_id,kind,github_source_id),
  FOREIGN KEY (repo_id,pr_number) REFERENCES pull_requests(repo_id,number) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sources_pr ON pr_sources(repo_id,pr_number);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,                         -- UUID
  repo_id INTEGER NOT NULL,
  pr_number INTEGER NOT NULL,
  stable_key TEXT NOT NULL,                    -- normalized decision semantic key for idempotent upsert
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted','rejected','removed','proposed','uncertain')),
  category TEXT NOT NULL CHECK (category IN ('feature','architecture','api','performance','security','other')),
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  model_name TEXT,
  extraction_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (repo_id,pr_number,stable_key),
  FOREIGN KEY (repo_id,pr_number) REFERENCES pull_requests(repo_id,number) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_decisions_repo_outcome ON decisions(repo_id,outcome,category);

CREATE TABLE IF NOT EXISTS decision_alternatives (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  label TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('rejected','considered','accepted','uncertain')),
  reason TEXT,
  FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_evidence (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence_role TEXT NOT NULL CHECK (evidence_role IN ('decision','reason','rejection','removal','context')),
  excerpt TEXT NOT NULL,
  FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES pr_sources(id) ON DELETE CASCADE,
  UNIQUE (decision_id,source_id,evidence_role)
);
CREATE INDEX IF NOT EXISTS ix_evidence_source ON decision_evidence(source_id);

CREATE TABLE IF NOT EXISTS index_jobs (
  id TEXT PRIMARY KEY,
  repo_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('full','sync','reanalyze')),
  status TEXT NOT NULL CHECK (status IN ('queued','running','partial','completed','failed')),
  phase TEXT NOT NULL DEFAULT 'queued',
  last_pr_page INTEGER NOT NULL DEFAULT 0,
  prs_discovered INTEGER NOT NULL DEFAULT 0,
  prs_fetched INTEGER NOT NULL DEFAULT 0,
  prs_analyzed INTEGER NOT NULL DEFAULT 0,
  comments_fetched INTEGER NOT NULL DEFAULT 0,
  comments_analyzed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  retry_after TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_jobs_repo ON index_jobs(repo_id,status,updated_at);

CREATE TABLE IF NOT EXISTS job_pr_progress (
  job_id TEXT NOT NULL,
  repo_id INTEGER NOT NULL,
  pr_number INTEGER NOT NULL,
  fetch_done INTEGER NOT NULL DEFAULT 0 CHECK (fetch_done IN (0,1)),
  analysis_done INTEGER NOT NULL DEFAULT 0 CHECK (analysis_done IN (0,1)),
  error_message TEXT,
  PRIMARY KEY (job_id,repo_id,pr_number),
  FOREIGN KEY (job_id) REFERENCES index_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (repo_id,pr_number) REFERENCES pull_requests(repo_id,number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  repo_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Two FTS indexes for evidence retrieval; keep them in sync using explicit insert/update/delete
-- helpers in server/src/db/queries.ts (or implement verified triggers).
CREATE VIRTUAL TABLE IF NOT EXISTS source_fts USING fts5(
  source_id UNINDEXED,
  repo_id UNINDEXED,
  pr_number UNINDEXED,
  body,
  tokenize='unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS decision_fts USING fts5(
  decision_id UNINDEXED,
  repo_id UNINDEXED,
  title,
  summary,
  reasoning,
  tokenize='unicode61'
);
-- Important: repo_id is UNINDEXED in FTS; always JOIN on canonical tables
-- to filter repo_id and prevent cross-repository retrieval leaks.
