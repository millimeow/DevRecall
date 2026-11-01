import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRoot } from './paths.js';
import type { Job, Repository } from './types.js';
import { AppError } from './errors.js';
export type DB = Database.Database;
export const demos = JSON.parse(
  readFileSync(join(projectRoot, 'config/demo-repositories.json'), 'utf8'),
) as { full_name: string; url: string; description: string }[];
export function openDatabase(
  path = process.env.DATABASE_PATH || join(projectRoot, 'data/devrecall.db'),
): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  const migrations = [
    readFileSync(join(projectRoot, 'db/schema.sql'), 'utf8').replace(/PRAGMA[^;]+;/g, ''),
    `
    ALTER TABLE index_jobs ADD COLUMN discovery_done INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE job_pr_progress ADD COLUMN endpoint_index INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE job_pr_progress ADD COLUMN source_page INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE pr_sources ADD COLUMN seen_job TEXT;
    CREATE UNIQUE INDEX ux_active_job ON index_jobs(repo_id) WHERE status IN ('queued','running');
    CREATE TRIGGER sources_insert AFTER INSERT ON pr_sources BEGIN INSERT INTO source_fts(source_id,repo_id,pr_number,body) VALUES(new.id,new.repo_id,new.pr_number,new.body); END;
    CREATE TRIGGER sources_delete AFTER DELETE ON pr_sources BEGIN DELETE FROM source_fts WHERE source_id=old.id; END;
    CREATE TRIGGER sources_update AFTER UPDATE OF body ON pr_sources BEGIN DELETE FROM source_fts WHERE source_id=old.id; INSERT INTO source_fts(source_id,repo_id,pr_number,body) VALUES(new.id,new.repo_id,new.pr_number,new.body); END;
    CREATE TRIGGER decisions_insert AFTER INSERT ON decisions BEGIN INSERT INTO decision_fts(decision_id,repo_id,title,summary,reasoning) VALUES(new.id,new.repo_id,new.title,new.summary,new.reasoning); END;
    CREATE TRIGGER decisions_delete AFTER DELETE ON decisions BEGIN DELETE FROM decision_fts WHERE decision_id=old.id; END;
    CREATE TRIGGER decisions_update AFTER UPDATE ON decisions BEGIN DELETE FROM decision_fts WHERE decision_id=old.id; INSERT INTO decision_fts(decision_id,repo_id,title,summary,reasoning) VALUES(new.id,new.repo_id,new.title,new.summary,new.reasoning); END;
  `,
    `
    ALTER TABLE decision_evidence RENAME TO decision_evidence_old;
    CREATE TABLE decision_evidence (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES pr_sources(id) ON DELETE CASCADE,
      evidence_role TEXT NOT NULL CHECK (evidence_role IN ('decision','reason','rejection','removal','context')),
      excerpt TEXT NOT NULL,
      UNIQUE(decision_id,source_id,evidence_role,excerpt)
    );
    INSERT INTO decision_evidence SELECT * FROM decision_evidence_old;
    DROP TABLE decision_evidence_old;
    CREATE INDEX ix_evidence_source ON decision_evidence(source_id);
  `,
  ];
  migrations.forEach((sql, index) => {
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(index + 1))
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(index + 1);
      })();
  });
  return db;
}
export function repository(db: DB, id: number): Repository {
  const row = db.prepare('SELECT * FROM repositories WHERE id=?').get(id) as Repository | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Repository not found.', 404);
  return row;
}
export function jobById(db: DB, id: string): Job {
  const row = db.prepare('SELECT * FROM index_jobs WHERE id=?').get(id) as Job | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Indexing job not found.', 404);
  return row;
}
export function enqueue(db: DB, repoId: number, mode = 'full'): Job {
  repository(db, repoId);
  return db.transaction(() => {
    const active = db
      .prepare("SELECT * FROM index_jobs WHERE repo_id=? AND status IN ('queued','running')")
      .get(repoId) as Job | undefined;
    if (active) return active;
    const partial = db
      .prepare(
        "SELECT * FROM index_jobs WHERE repo_id=? AND status='partial' ORDER BY updated_at DESC,rowid DESC LIMIT 1",
      )
      .get(repoId) as Job | undefined;
    if (partial) {
      db.prepare(
        "UPDATE index_jobs SET status='queued',error_message=NULL,retry_after=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(partial.id);
      if (mode === 'reanalyze') {
        db.prepare(
          "UPDATE index_jobs SET mode='reanalyze',prs_analyzed=0,comments_analyzed=0 WHERE id=?",
        ).run(partial.id);
        db.prepare(
          'UPDATE job_pr_progress SET analysis_done=0,error_message=NULL WHERE job_id=?',
        ).run(partial.id);
      }
    } else
      db.prepare("INSERT INTO index_jobs(id,repo_id,mode,status) VALUES(?,?,?,'queued')").run(
        randomUUID(),
        repoId,
        mode,
      );
    db.prepare("UPDATE repositories SET status='queued',last_error=NULL WHERE id=?").run(repoId);
    return db
      .prepare("SELECT * FROM index_jobs WHERE repo_id=? AND status='queued'")
      .get(repoId) as Job;
  })();
}
export function summary(db: DB, repoId: number) {
  const count = (sql: string) => (db.prepare(sql).get(repoId) as { n: number }).n;
  return {
    decisions: count(
      "SELECT count(*) n FROM decisions d JOIN pull_requests p ON p.repo_id=d.repo_id AND p.number=d.pr_number WHERE d.repo_id=? AND p.analysis_status='done' AND p.content_hash=p.last_analyzed_hash AND EXISTS(SELECT 1 FROM decision_evidence e WHERE e.decision_id=d.id)",
    ),
    rejected_removed: count(
      "SELECT count(*) n FROM decisions d JOIN pull_requests p ON p.repo_id=d.repo_id AND p.number=d.pr_number WHERE d.repo_id=? AND p.analysis_status='done' AND p.content_hash=p.last_analyzed_hash AND category='feature' AND outcome IN ('rejected','removed') AND EXISTS(SELECT 1 FROM decision_evidence e WHERE e.decision_id=d.id)",
    ),
    prs_scanned: count(
      'SELECT count(*) n FROM pull_requests WHERE repo_id=? AND last_ingested_at IS NOT NULL',
    ),
    prs_analyzed: count(
      "SELECT count(*) n FROM pull_requests WHERE repo_id=? AND analysis_status='done' AND last_analyzed_hash=content_hash",
    ),
    comments_scanned: count(
      "SELECT count(*) n FROM pr_sources WHERE repo_id=? AND kind!='pr_body'",
    ),
    comments_analyzed: count(
      "SELECT count(*) n FROM pr_sources s JOIN pull_requests p ON p.repo_id=s.repo_id AND p.number=s.pr_number WHERE s.repo_id=? AND s.kind!='pr_body' AND p.analysis_status='done' AND p.last_analyzed_hash=p.content_hash",
    ),
  };
}
