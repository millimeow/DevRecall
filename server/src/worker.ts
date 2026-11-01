import { createHash } from 'node:crypto';
import { z } from 'zod';
import { groundedSchema } from './grounded-schema.js';
import { type DB, jobById, repository, summary } from './db.js';
import type { GitHubClient } from './github.js';
import {
  type AI,
  chunkSources,
  extractionPrompt,
  extractionSchema,
  sourceContext,
  type DecisionInput,
} from './ai.js';
import { saveDecisions, validateEvidence } from './evidence.js';
import { AppError, errorMessage } from './errors.js';
import type { GitHubItem, Job, PullRequest, Repository, Source } from './types.js';
interface Progress {
  pr_number: number;
  fetch_done: number;
  analysis_done: number;
  endpoint_index: number;
  source_page: number;
}

/** Single-process durable worker; one request at a time limits GitHub secondary rate pressure. */
export class Worker {
  private stopping = false;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private db: DB,
    private github: GitHubClient,
    private ai: AI,
  ) {}
  recover() {
    this.db
      .prepare(
        "UPDATE index_jobs SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE status='running'",
      )
      .run();
  }
  start() {
    this.recover();
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
    void this.tick();
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      const job = this.db
        .prepare(
          "SELECT * FROM index_jobs WHERE (status='queued' AND (retry_after IS NULL OR retry_after<=?)) OR (status='partial' AND retry_after IS NOT NULL AND retry_after<=?) ORDER BY rowid LIMIT 1",
        )
        .get(new Date().toISOString(), new Date().toISOString()) as Job | undefined;
      if (job) await this.runJob(job.id);
    } finally {
      this.busy = false;
    }
  }
  private checkpoint() {
    if (this.stopping)
      throw new AppError(
        'WORKER_STOPPED',
        'Indexing paused during shutdown. It will resume on restart.',
        503,
      );
  }
  private updateCounts(job: Job) {
    const counts = this.db
      .prepare(
        'SELECT count(*) discovered,coalesce(sum(fetch_done),0) fetched,coalesce(sum(analysis_done),0) analyzed FROM job_pr_progress WHERE job_id=?',
      )
      .get(job.id) as { discovered: number; fetched: number; analyzed: number };
    const s = summary(this.db, job.repo_id);
    this.db
      .prepare(
        'UPDATE index_jobs SET prs_discovered=?,prs_fetched=?,prs_analyzed=?,comments_fetched=?,comments_analyzed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      )
      .run(
        counts.discovered,
        counts.fetched,
        counts.analyzed,
        s.comments_scanned,
        s.comments_analyzed,
        job.id,
      );
  }
  private upsertSource(
    repo: Repository,
    pr: GitHubItem | PullRequest,
    item: GitHubItem,
    kind: string,
    jobId: string,
  ) {
    if (kind !== 'pr_body' && !item.body?.trim()) return;
    const url = new URL(item.html_url);
    // Only exact links returned by GitHub are stored. Never derive comment anchors.
    const allowedPaths = [
      new URL(pr.html_url).pathname,
      `${new URL(repo.html_url).pathname}/pull/${pr.number}`,
    ];
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      !allowedPaths.includes(url.pathname) ||
      url.username ||
      url.password
    )
      throw new AppError(
        'GITHUB_INVALID_SOURCE',
        'GitHub returned a source outside the PR being indexed.',
        502,
      );
    const sourceId = `${repo.id}:${kind}:${item.id}`;
    this.db
      .prepare(
        `INSERT INTO pr_sources(id,repo_id,pr_number,kind,github_source_id,author_login,body,html_url,path,in_reply_to_id,created_at,updated_at,seen_job)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,author_login=excluded.author_login,html_url=excluded.html_url,path=excluded.path,updated_at=excluded.updated_at,seen_job=excluded.seen_job`,
      )
      .run(
        sourceId,
        repo.id,
        pr.number,
        kind,
        String(item.id),
        item.user?.login ?? null,
        item.body ?? '',
        item.html_url,
        item.path ?? null,
        item.in_reply_to_id ? String(item.in_reply_to_id) : null,
        item.created_at ?? item.submitted_at ?? null,
        item.updated_at ?? item.submitted_at ?? null,
        jobId,
      );
  }
  private async discover(job: Job, repo: Repository) {
    if (job.discovery_done) return;
    for (let page = job.last_pr_page + 1; ; page++) {
      this.checkpoint();
      const { data, next } = await this.github.list(
        repo.owner,
        repo.name,
        'pulls?state=all&sort=created&direction=asc',
        page,
      );
      this.db.transaction(() => {
        for (const pr of data) {
          this.db
            .prepare(
              `INSERT INTO pull_requests(repo_id,number,github_pr_id,title,body,html_url,author_login,state,merged_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repo_id,number) DO UPDATE SET title=excluded.title,body=excluded.body,html_url=excluded.html_url,author_login=excluded.author_login,state=excluded.state,merged_at=excluded.merged_at,updated_at=excluded.updated_at`,
            )
            .run(
              repo.id,
              pr.number,
              pr.id,
              pr.title,
              pr.body,
              pr.html_url,
              pr.user?.login ?? null,
              pr.state,
              pr.merged_at,
              pr.created_at,
              pr.updated_at,
            );
          this.upsertSource(repo, pr, pr, 'pr_body', job.id);
          // A partially refreshed conversation must never retain a current analysis badge.
          this.db
            .prepare(
              "UPDATE pull_requests SET analysis_status='pending' WHERE repo_id=? AND number=?",
            )
            .run(repo.id, pr.number);
          this.db
            .prepare(
              'INSERT OR IGNORE INTO job_pr_progress(job_id,repo_id,pr_number) VALUES(?,?,?)',
            )
            .run(job.id, repo.id, pr.number);
        }
        this.db
          .prepare(
            'UPDATE index_jobs SET last_pr_page=?,discovery_done=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          )
          .run(page, next ? 0 : 1, job.id);
        this.updateCounts(job);
      })();
      if (!next) break;
    }
    this.db
      .prepare(
        'UPDATE repositories SET total_prs_known=(SELECT count(*) FROM job_pr_progress WHERE job_id=?) WHERE id=?',
      )
      .run(job.id, repo.id);
  }
  private async fetchPR(job: Job, repo: Repository, progress: Progress) {
    const pr = this.db
      .prepare('SELECT * FROM pull_requests WHERE repo_id=? AND number=?')
      .get(repo.id, progress.pr_number) as PullRequest;
    const endpoints = [
      `issues/${pr.number}/comments`,
      `pulls/${pr.number}/reviews`,
      `pulls/${pr.number}/comments`,
    ];
    const kinds = ['issue_comment_on_pr', 'review', 'review_comment'];
    for (let endpoint = progress.endpoint_index; endpoint < endpoints.length; endpoint++) {
      let page = endpoint === progress.endpoint_index ? progress.source_page : 1;
      for (; ; page++) {
        this.checkpoint();
        const { data, next } = await this.github.list(
          repo.owner,
          repo.name,
          endpoints[endpoint],
          page,
        );
        this.db.transaction(() => {
          for (const source of data) this.upsertSource(repo, pr, source, kinds[endpoint], job.id);
          this.db
            .prepare(
              'UPDATE job_pr_progress SET endpoint_index=?,source_page=? WHERE job_id=? AND repo_id=? AND pr_number=?',
            )
            .run(next ? endpoint : endpoint + 1, next ? page + 1 : 1, job.id, repo.id, pr.number);
          this.updateCounts(job);
        })();
        if (!next) break;
      }
    }
    this.db.transaction(() => {
      // Reconcile deletions only when all three endpoints have completed successfully.
      this.db
        .prepare(
          "DELETE FROM pr_sources WHERE repo_id=? AND pr_number=? AND kind!='pr_body' AND (seen_job IS NULL OR seen_job!=?)",
        )
        .run(repo.id, pr.number, job.id);
      const sources = this.db
        .prepare('SELECT * FROM pr_sources WHERE repo_id=? AND pr_number=? ORDER BY id')
        .all(repo.id, pr.number) as Source[];
      const hash = createHash('sha256')
        .update(
          JSON.stringify(sources.map((s) => [s.id, s.body, s.html_url, s.author_login, s.path])),
        )
        .digest('hex');
      const paths = [...new Set(sources.map((s) => s.path).filter(Boolean))];
      this.db
        .prepare(
          "UPDATE pull_requests SET content_hash=?,changed_paths_json=?,last_ingested_at=CURRENT_TIMESTAMP,analysis_status=CASE WHEN last_analyzed_hash=? THEN 'done' ELSE 'pending' END WHERE repo_id=? AND number=?",
        )
        .run(hash, JSON.stringify(paths), hash, repo.id, pr.number);
      this.db
        .prepare(
          'UPDATE job_pr_progress SET fetch_done=1,error_message=NULL WHERE job_id=? AND repo_id=? AND pr_number=?',
        )
        .run(job.id, repo.id, pr.number);
      this.updateCounts(job);
    })();
  }
  private async analyzePR(job: Job, pr: PullRequest) {
    if (
      job.mode !== 'reanalyze' &&
      pr.last_analyzed_hash === pr.content_hash &&
      pr.analysis_status === 'done'
    ) {
      this.db
        .prepare(
          'UPDATE job_pr_progress SET analysis_done=1 WHERE job_id=? AND repo_id=? AND pr_number=?',
        )
        .run(job.id, job.repo_id, pr.number);
      this.updateCounts(job);
      return;
    }
    const sources = this.db
      .prepare('SELECT * FROM pr_sources WHERE repo_id=? AND pr_number=? ORDER BY created_at,id')
      .all(job.repo_id, pr.number) as Source[];
    const decisions: DecisionInput[] = [];
    this.db
      .prepare(
        "UPDATE pull_requests SET analysis_status='analyzing',analysis_error=NULL WHERE repo_id=? AND number=?",
      )
      .run(job.repo_id, pr.number);
    try {
      for (const chunk of chunkSources(sources)) {
        this.checkpoint();
        const result = extractionSchema.safeParse(
          await this.ai.generate(
            extractionPrompt,
            sourceContext(chunk),
            groundedSchema(z.toJSONSchema(extractionSchema), chunk),
            { task: 'extraction' },
          ),
        );
        if (!result.success)
          throw new AppError(
            'AI_INVALID_OUTPUT',
            'Model extraction did not match the required decision schema.',
            502,
          );
        const allowed = new Map<string, string>();
        for (const s of chunk) allowed.set(s.id, (allowed.get(s.id) ?? '') + s.body);
        for (const d of result.data.decisions)
          validateEvidence(this.db, job.repo_id, d.evidence, allowed, pr.number);
        decisions.push(...result.data.decisions);
      }
      this.db.transaction(() => {
        saveDecisions(this.db, job.repo_id, pr.number, decisions, this.ai.model);
        this.db
          .prepare(
            "UPDATE pull_requests SET analysis_status='done',last_analyzed_hash=content_hash,analysis_error=NULL WHERE repo_id=? AND number=?",
          )
          .run(job.repo_id, pr.number);
        this.db
          .prepare(
            'UPDATE job_pr_progress SET analysis_done=1,error_message=NULL WHERE job_id=? AND repo_id=? AND pr_number=?',
          )
          .run(job.id, job.repo_id, pr.number);
        this.updateCounts(job);
      })();
    } catch (error) {
      this.db
        .prepare(
          "UPDATE pull_requests SET analysis_status='error',analysis_error=? WHERE repo_id=? AND number=?",
        )
        .run(errorMessage(error), job.repo_id, pr.number);
      throw error;
    }
  }
  async runJob(id: string) {
    const job = jobById(this.db, id);
    if (job.status === 'completed') return;
    const repo = repository(this.db, job.repo_id);
    this.db
      .prepare(
        "UPDATE index_jobs SET status='running',phase='ingestion',error_message=NULL,retry_after=NULL,started_at=coalesce(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .run(id);
    this.db
      .prepare("UPDATE repositories SET status='indexing',last_error=NULL WHERE id=?")
      .run(repo.id);
    try {
      await this.discover(job, repo);
      for (;;) {
        const progress = this.db
          .prepare(
            'SELECT * FROM job_pr_progress WHERE job_id=? AND fetch_done=0 ORDER BY pr_number LIMIT 1',
          )
          .get(id) as Progress | undefined;
        if (!progress) break;
        await this.fetchPR(job, repo, progress);
      }
      this.db
        .prepare('UPDATE repositories SET last_sync_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(repo.id);
      const pending = this.db
        .prepare(
          'SELECT p.* FROM job_pr_progress j JOIN pull_requests p ON p.repo_id=j.repo_id AND p.number=j.pr_number WHERE j.job_id=? AND j.analysis_done=0 ORDER BY p.number',
        )
        .all(id) as PullRequest[];
      if (pending.length && !this.ai.configured)
        throw new AppError(
          'AI_NOT_CONFIGURED',
          'PR evidence is saved. Configure AI_PROVIDER and AI_MODEL in .env, restart, and Resume to extract decisions.',
          503,
        );
      this.db.prepare("UPDATE index_jobs SET phase='analysis' WHERE id=?").run(id);
      this.db.prepare("UPDATE repositories SET status='analyzing' WHERE id=?").run(repo.id);
      for (const pr of pending) {
        this.checkpoint();
        await this.analyzePR(job, pr);
      }
      this.db
        .prepare(
          "UPDATE index_jobs SET status='completed',phase='completed',finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,error_message=NULL,retry_after=NULL WHERE id=?",
        )
        .run(id);
      this.db
        .prepare(
          "UPDATE repositories SET status='ready',last_indexed_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?",
        )
        .run(repo.id);
    } catch (error) {
      const appError = error instanceof AppError ? error : null;
      const retry =
        appError?.retryAt ??
        (appError?.code === 'GITHUB_UNAVAILABLE'
          ? new Date(Date.now() + 60000).toISOString()
          : null);
      const phase =
        appError?.code === 'AI_NOT_CONFIGURED' ? 'ai_not_configured' : jobById(this.db, id).phase;
      this.db
        .prepare(
          'UPDATE index_jobs SET status=?,phase=?,error_message=?,retry_after=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
        )
        .run(
          appError?.code === 'WORKER_STOPPED' ? 'queued' : 'partial',
          phase,
          errorMessage(error),
          retry,
          id,
        );
      this.db
        .prepare("UPDATE repositories SET status='partial',last_error=? WHERE id=?")
        .run(errorMessage(error), repo.id);
    }
  }
}
