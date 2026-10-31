import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, enqueue, jobById, summary } from '../src/db.js';
import { Worker } from '../src/worker.js';
import { GitHubClient } from '../src/github.js';
import { makeAI, type AI } from '../src/ai.js';
import { listDecisions } from '../src/evidence.js';
import type { GitHubItem } from '../src/types.js';
const dbs: ReturnType<typeof openDatabase>[] = [];
afterEach(() =>
  dbs.splice(0).forEach((db) => {
    if (db.open) db.close();
  }),
);
const item = (n: number): GitHubItem => ({
  id: n,
  number: n,
  title: `PR ${n}`,
  body: 'A real test fixture body',
  html_url: `https://github.com/test/repo/pull/${n}`,
  user: { login: 'author' },
  state: 'closed',
  merged_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
});
function setup(path = ':memory:') {
  const db = openDatabase(path);
  dbs.push(db);
  db.prepare(
    "INSERT OR IGNORE INTO repositories(id,owner,name,full_name,html_url) VALUES(1,'test','repo','test/repo','https://github.com/test/repo')",
  ).run();
  return db;
}
function fakeGitHub(count = 1, comments = 1, onRequest?: (url: URL) => Response | undefined) {
  const calls: string[] = [];
  const github = new GitHubClient('', async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const intercepted = onRequest?.(url);
    if (intercepted) return intercepted;
    const page = Number(url.searchParams.get('page'));
    let data: GitHubItem[] = [];
    if (url.pathname.endsWith('/pulls'))
      data = Array.from({ length: count }, (_, i) => item(i + 1));
    else if (url.pathname.endsWith('/files')) return Response.json([]);
    else if (url.pathname.includes('/issues/')) {
      const number = Number(url.pathname.split('/').at(-2));
      data = Array.from({ length: comments }, (_, i) => ({
        ...item(number),
        id: number * 1000 + i,
        body: 'We rejected caching because it leaks tenant data.',
        html_url: `https://github.com/test/repo/pull/${number}#issuecomment-${number * 1000 + i}`,
      }));
    } else if (url.pathname.endsWith('/reviews')) {
      const n = Number(url.pathname.split('/').at(-2));
      data = [
        {
          ...item(n),
          id: n + 100000,
          html_url: `https://github.com/test/repo/pull/${n}#pullrequestreview-${n}`,
        },
      ];
    } else if (url.pathname.endsWith('/comments')) {
      const n = Number(url.pathname.split('/').at(-2));
      data = [
        {
          ...item(n),
          id: n + 200000,
          html_url: `https://github.com/test/repo/pull/${n}#discussion_r${n}`,
          path: 'cache.py',
        },
      ];
    }
    return Response.json(data.slice((page - 1) * 100, page * 100), {
      headers:
        page * 100 < data.length ? { Link: '<https://api.github.com/next>; rel="next"' } : {},
    });
  });
  return { github, calls };
}
const ai: AI = {
  configured: true,
  model: 'test',
  provider: 'test',
  generate: async () => ({ decisions: [] }),
};
describe('durable ingestion', () => {
  it('enumerates 101 PRs in all states and every comment type with pagination', async () => {
    const db = setup();
    const { github, calls } = fakeGitHub(101, 101);
    const job = enqueue(db, 1);
    await new Worker(db, github, ai).runJob(job.id);
    expect(jobById(db, job.id)).toMatchObject({
      status: 'completed',
      prs_fetched: 101,
      prs_analyzed: 101,
      comments_fetched: 10403,
    });
    expect(summary(db, 1)).toMatchObject({
      prs_scanned: 101,
      prs_analyzed: 101,
      comments_scanned: 10403,
    });
    expect(calls.some((x) => x.includes('state=all') && x.includes('page=2'))).toBe(true);
    expect(calls.some((x) => x.includes('/issues/1/comments') && x.includes('page=2'))).toBe(true);
    expect(db.prepare('SELECT DISTINCT kind FROM pr_sources').all()).toHaveLength(4);
  });
  it('retries rate-limited pages from disk after restart without duplication', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devrecall-'));
    const path = join(dir, 'test.db');
    const db = setup(path);
    const { github } = fakeGitHub(1, 101, (url) =>
      url.pathname.includes('/issues/') && url.searchParams.get('page') === '2'
        ? Response.json({ message: 'rate limit' }, { status: 429, headers: { 'Retry-After': '1' } })
        : undefined,
    );
    const job = enqueue(db, 1);
    await new Worker(db, github, ai).runJob(job.id);
    expect(jobById(db, job.id)).toMatchObject({ status: 'partial' });
    expect(jobById(db, job.id).retry_after).not.toBeNull();
    expect(
      db.prepare("SELECT count(*) n FROM pr_sources WHERE kind='issue_comment_on_pr'").get(),
    ).toEqual({ n: 100 });
    db.close();
    const reopened = setup(path);
    const resumed = enqueue(reopened, 1);
    expect(resumed.id).toBe(job.id);
    await new Worker(reopened, fakeGitHub(1, 101).github, ai).runJob(resumed.id);
    expect(jobById(reopened, job.id).status).toBe('completed');
    expect(summary(reopened, 1).comments_scanned).toBe(103);
    reopened.close();
    rmSync(dir, { recursive: true });
  });
  it('sync is idempotent, preserves chats, and refreshes changed/deleted source text', async () => {
    const db = setup();
    const worker = new Worker(db, fakeGitHub().github, ai);
    await worker.runJob(enqueue(db, 1).id);
    db.prepare("INSERT INTO chat_sessions(id,repo_id) VALUES('keep',1)").run();
    await worker.runJob(enqueue(db, 1, 'sync').id);
    expect(summary(db, 1).prs_scanned).toBe(1);
    expect(summary(db, 1).comments_scanned).toBe(3);
    expect(db.prepare('SELECT * FROM chat_sessions').all()).toHaveLength(1);
    await new Worker(db, fakeGitHub(1, 0).github, ai).runJob(enqueue(db, 1, 'sync').id);
    expect(summary(db, 1).comments_scanned).toBe(2);
    expect(db.prepare('SELECT count(*) n FROM source_fts').get()).toEqual({ n: 3 });
  });
  it('an empty repo completes honestly and missing AI gives partial with raw evidence retained', async () => {
    const empty = setup();
    const noPRJob = enqueue(empty, 1);
    await new Worker(empty, fakeGitHub(0).github, makeAI({})).runJob(noPRJob.id);
    expect(jobById(empty, noPRJob.id).status).toBe('completed');
    const db = setup();
    const job = enqueue(db, 1);
    await new Worker(db, fakeGitHub().github, makeAI({})).runJob(job.id);
    expect(jobById(db, job.id)).toMatchObject({ status: 'partial', phase: 'ai_not_configured' });
    expect(summary(db, 1).comments_scanned).toBe(3);
    expect(summary(db, 1).prs_analyzed).toBe(0);
  });
  it('recovers running jobs left by a terminated process', () => {
    const db = setup();
    const job = enqueue(db, 1);
    db.prepare("UPDATE index_jobs SET status='running' WHERE id=?").run(job.id);
    new Worker(db, fakeGitHub().github, ai).recover();
    expect(jobById(db, job.id).status).toBe('queued');
  });
  it('never serves stale decisions after interrupted sync mutates a source, and preserves IDs after recovery', async () => {
    const db = setup();
    const decidingAI: AI = {
      ...ai,
      generate: async () => ({
        decisions: [
          {
            title: 'Reject caching',
            summary: 'Caching risks isolation',
            reasoning: 'It leaks tenant data',
            outcome: 'rejected',
            category: 'feature',
            confidence: 0.9,
            alternatives: [],
            evidence: [
              {
                source_id: '1:issue_comment_on_pr:1000',
                excerpt: 'it leaks tenant data',
                role: 'rejection',
              },
            ],
          },
        ],
      }),
    };
    await new Worker(db, fakeGitHub().github, decidingAI).runJob(enqueue(db, 1).id);
    const before = db.prepare('SELECT id FROM decisions').get() as { id: string };
    expect(listDecisions(db, 1)).toHaveLength(1);
    const changed = fakeGitHub(1, 1, (url) =>
      url.pathname.endsWith('/pulls')
        ? Response.json([{ ...item(1), body: 'New proposal and changed context.' }])
        : url.pathname.includes('/issues/')
          ? Response.json({ message: 'inaccessible' }, { status: 403 })
          : undefined,
    );
    await new Worker(db, changed.github, decidingAI).runJob(enqueue(db, 1, 'sync').id);
    expect(summary(db, 1).prs_analyzed).toBe(0);
    expect(listDecisions(db, 1)).toEqual([]);
    await new Worker(db, fakeGitHub().github, decidingAI).runJob(enqueue(db, 1, 'sync').id);
    expect((db.prepare('SELECT id FROM decisions').get() as { id: string }).id).toBe(before.id);
  });
  it('resumes a partial job after the canonical repository name changes', async () => {
    const db = setup();
    const failed = fakeGitHub(1, 1, (url) =>
      url.pathname.includes('/issues/')
        ? Response.json({ message: 'blocked' }, { status: 403 })
        : undefined,
    );
    const job = enqueue(db, 1);
    await new Worker(db, failed.github, ai).runJob(job.id);
    expect(jobById(db, job.id).discovery_done).toBe(1);
    db.prepare(
      "UPDATE repositories SET name='renamed',full_name='test/renamed',html_url='https://github.com/test/renamed' WHERE id=1",
    ).run();
    const renamed = new GitHubClient('', async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/issues/'))
        return Response.json([
          {
            ...item(1),
            id: 1000,
            body: 'A new canonical comment',
            html_url: 'https://github.com/test/renamed/pull/1#issuecomment-1000',
          },
        ]);
      return Response.json([]);
    });
    await new Worker(db, renamed, ai).runJob(enqueue(db, 1).id);
    expect(jobById(db, job.id).status).toBe('completed');
    expect(
      db.prepare("SELECT html_url FROM pr_sources WHERE kind='issue_comment_on_pr'").get(),
    ).toEqual({ html_url: 'https://github.com/test/renamed/pull/1#issuecomment-1000' });
  });
  it('an explicit reanalysis resets completed analysis checkpoints on a partial job', () => {
    const db = setup();
    const job = enqueue(db, 1);
    db.prepare(
      "UPDATE index_jobs SET status='partial',prs_analyzed=2,phase='analysis' WHERE id=?",
    ).run(job.id);
    const resumed = enqueue(db, 1, 'reanalyze');
    expect(resumed.mode).toBe('reanalyze');
    expect(resumed.prs_analyzed).toBe(0);
  });
});
