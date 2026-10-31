import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase } from '../src/db.js';
import { parseGitHubUrl, GitHubClient } from '../src/github.js';
import { createApp } from '../src/app.js';
import { makeAI } from '../src/ai.js';

const databases: ReturnType<typeof openDatabase>[] = [];
function setup() {
  const db = openDatabase(':memory:');
  databases.push(db);
  const github = new GitHubClient('', async () =>
    Response.json({
      id: 123,
      full_name: 'test/project',
      owner: { login: 'test' },
      name: 'project',
      html_url: 'https://github.com/test/project',
      private: false,
      default_branch: 'main',
      description: 'Real metadata',
      archived: false,
    }),
  );
  return { db, app: createApp({ db, github, ai: makeAI({}) }) };
}
afterEach(() => databases.splice(0).forEach((db) => db.close()));
describe('GitHub URL validation', () => {
  it.each([
    'https://github.com/test/project',
    'https://github.com/test/project/',
    'https://github.com/test/project.git',
  ])('normalizes %s', (url) =>
    expect(parseGitHubUrl(url)).toEqual({ owner: 'test', repo: 'project' }),
  );
  it.each([
    'http://github.com/a/b',
    'https://github.com.evil.com/a/b',
    'https://github.com/a/b/pull/1',
    'https://github.com/a',
    'https://user@github.com/a/b',
    'https://github.com/a/b?x=1',
    'https://github.com:444/a/b',
    'https://github.com/a/%2e%2e',
    'file:///etc/passwd',
  ])('rejects %s', (url) => expect(() => parseGitHubUrl(url)).toThrow());
});
describe('database and repositories', () => {
  it('migrates idempotently with FK and FTS enabled', () => {
    const { db } = setup();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('SELECT count(*) AS n FROM source_fts').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toHaveLength(3);
    expect(() =>
      db.prepare("INSERT INTO chat_sessions(id,repo_id) VALUES('bad',999)").run(),
    ).toThrow();
  });
  it('health exposes configuration without credentials', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.ai.configured).toBe(false);
    expect(res.body.status).toBe('ok');
  });
  it('lists three unanalyzed demos without inventing GitHub IDs or metrics', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/demo-repositories');
    expect(res.body.items.map((x: { full_name: string }) => x.full_name)).toEqual([
      'pallets/flask',
      'django/django',
      'python/cpython',
    ]);
    expect(
      res.body.items.every(
        (x: { id: unknown; status: string }) => x.id === null && x.status === 'not_analyzed',
      ),
    ).toBe(true);
    expect((await request(app).get('/api/v1/repositories')).body.items).toEqual([]);
  });
  it('resolves, saves canonical numeric identity, queues once and reports actual zero counts', async () => {
    const { app } = setup();
    const preview = await request(app)
      .post('/api/v1/repositories/resolve')
      .send({ url: 'https://github.com/old/project' });
    expect(preview.body.repository.full_name).toBe('test/project');
    const res = await request(app)
      .post('/api/v1/repositories')
      .send({ url: 'https://github.com/old/project' });
    expect(res.status).toBe(201);
    expect(res.body.repository.id).toBe(123);
    expect(res.body.job.status).toBe('queued');
    const again = await request(app)
      .post('/api/v1/repositories')
      .send({ url: 'https://github.com/test/project' });
    expect(again.body.job.id).toBe(res.body.job.id);
    const detail = await request(app).get('/api/v1/repositories/123');
    expect(detail.body.summary).toMatchObject({
      decisions: 0,
      rejected_removed: 0,
      prs_analyzed: 0,
      comments_analyzed: 0,
    });
  });
  it('returns structured 400/404/AI configuration errors', async () => {
    const { app } = setup();
    expect(
      (await request(app).post('/api/v1/repositories').send({ url: 'https://evil.com/a/b' }))
        .status,
    ).toBe(400);
    expect((await request(app).get('/api/v1/repositories/999')).status).toBe(404);
    await request(app)
      .post('/api/v1/repositories')
      .send({ url: 'https://github.com/test/project' });
    const chat = await request(app)
      .post('/api/v1/repositories/123/chat')
      .send({ question: 'Why?' });
    expect(chat.status).toBe(503);
    expect(chat.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
  it('rejects private metadata even when a token could read it', async () => {
    const gh = new GitHubClient('', async () => Response.json({ private: true }));
    await expect(gh.resolve('https://github.com/a/b')).rejects.toThrow(/public/i);
  });
});
