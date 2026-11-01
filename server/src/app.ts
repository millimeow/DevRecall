import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { demos, enqueue, jobById, repository, summary, type DB } from './db.js';
import type { GitHubClient } from './github.js';
import type { AI } from './ai.js';
import { AppError } from './errors.js';
import { listDecisions } from './evidence.js';
import { ask } from './chat.js';
import { projectRoot } from './paths.js';
export function createApp({ db, github, ai }: { db: DB; github: GitHubClient; ai: AI }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      origin &&
      ![
        process.env.APP_ORIGIN,
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        `http://localhost:${process.env.PORT || 3001}`,
        `http://127.0.0.1:${process.env.PORT || 3001}`,
      ].includes(origin)
    )
      return res.status(403).json({
        error: {
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Use the DevRecall application to make this request.',
        },
      });
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  const urlBody = z.object({ url: z.string().trim().min(1).max(500) }).strict();
  const id = (input: string) => z.coerce.number().int().positive().parse(input);
  const catalog = () =>
    demos.map((d) => ({
      ...d,
      id: null,
      status: 'not_analyzed',
      ...(db
        .prepare('SELECT id,status FROM repositories WHERE full_name=? COLLATE NOCASE')
        .get(d.full_name) as object | undefined),
    }));
  app.get('/api/v1/health', (_req, res) =>
    res.json({
      status: 'ok',
      ai: { configured: ai.configured, provider: ai.provider || null, model: ai.model || null },
    }),
  );
  app.get('/api/v1/demo-repositories', (_req, res) => res.json({ items: catalog() }));
  app.get('/api/v1/repositories', (_req, res) =>
    res.json({ items: db.prepare('SELECT * FROM repositories ORDER BY created_at,id').all() }),
  );
  app.post('/api/v1/repositories/resolve', async (req, res) => {
    const { url } = urlBody.parse(req.body);
    const repo = await github.resolve(url);
    res.json({ repository: repo });
  });
  app.post('/api/v1/repositories', async (req, res) => {
    const { url } = urlBody.parse(req.body);
    const repo = await github.resolve(url);
    const existing = db.prepare('SELECT id FROM repositories WHERE id=?').get(repo.id);
    db.prepare(
      `INSERT INTO repositories(id,owner,name,full_name,html_url,description,default_branch,is_demo) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,name=excluded.name,full_name=excluded.full_name,html_url=excluded.html_url,description=excluded.description,default_branch=excluded.default_branch,updated_at=CURRENT_TIMESTAMP`,
    ).run(
      repo.id,
      repo.owner.login,
      repo.name,
      repo.full_name,
      repo.html_url,
      repo.description,
      repo.default_branch,
      demos.some((d) => d.full_name.toLowerCase() === repo.full_name.toLowerCase()) ? 1 : 0,
    );
    const saved = repository(db, repo.id);
    const job = existing
      ? (db
          .prepare('SELECT * FROM index_jobs WHERE repo_id=? ORDER BY rowid DESC LIMIT 1')
          .get(repo.id) ?? enqueue(db, repo.id))
      : enqueue(db, repo.id);
    res.status(existing ? 200 : 201).json({ repository: repository(db, saved.id), job });
  });
  app.get('/api/v1/repositories/:id', (req, res) => {
    const repoId = id(req.params.id);
    res.json({
      repository: repository(db, repoId),
      summary: summary(db, repoId),
      job:
        db
          .prepare('SELECT * FROM index_jobs WHERE repo_id=? ORDER BY rowid DESC LIMIT 1')
          .get(repoId) ?? null,
    });
  });
  app.post('/api/v1/repositories/:id/sync', async (req, res) => {
    const repoId = id(req.params.id);
    const saved = repository(db, repoId);
    const fresh = await github.resolve(saved.html_url);
    if (fresh.id !== repoId)
      throw new AppError(
        'REPOSITORY_ID_CHANGED',
        'This URL now points to a different repository. Add it as a new repository.',
        409,
      );
    db.prepare(
      'UPDATE repositories SET owner=?,name=?,full_name=?,html_url=?,description=?,default_branch=? WHERE id=?',
    ).run(
      fresh.owner.login,
      fresh.name,
      fresh.full_name,
      fresh.html_url,
      fresh.description,
      fresh.default_branch,
      repoId,
    );
    const body = z
      .object({ mode: z.enum(['sync', 'reanalyze']).default('sync') })
      .parse(req.body ?? {});
    res.status(202).json({ job: enqueue(db, repoId, body.mode) });
  });
  app.get('/api/v1/jobs/:id', (req, res) => res.json({ job: jobById(db, req.params.id) }));
  app.get('/api/v1/repositories/:id/decisions', (req, res) => {
    const repoId = id(req.params.id);
    repository(db, repoId);
    const query = z
      .string()
      .max(300)
      .parse(req.query.q ?? '');
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .parse(req.query.offset ?? 0);
    const items = listDecisions(db, repoId, query, req.query.rejected === 'true', offset);
    res.json({ items, next_offset: items.length === 50 ? offset + 50 : null });
  });
  app.post('/api/v1/repositories/:id/chat', async (req, res) => {
    const body = z
      .object({ question: z.string().trim().min(1).max(3000), session_id: z.uuid().optional() })
      .strict()
      .parse(req.body);
    res.json(await ask(db, ai, id(req.params.id), body.question, body.session_id));
  });
  app.get('/api/v1/repositories/:id/chat', (req, res) => {
    const repoId = id(req.params.id);
    repository(db, repoId);
    const session = db
      .prepare(
        'SELECT id FROM chat_sessions WHERE repo_id=? ORDER BY updated_at DESC,rowid DESC LIMIT 1',
      )
      .get(repoId) as { id: string } | undefined;
    const messages = session
      ? (db
          .prepare('SELECT * FROM chat_messages WHERE session_id=? ORDER BY rowid')
          .all(session.id) as { citations_json: string }[])
      : [];
    res.json({
      session_id: session?.id ?? null,
      items: messages.map((m) => ({ ...m, citations: JSON.parse(m.citations_json) })),
    });
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }),
  );
  const web = join(projectRoot, 'web/dist');
  if (existsSync(web)) {
    app.use(express.static(web));
    app.get('/{*path}', (_req, res) => res.sendFile(join(web, 'index.html')));
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      if (error instanceof AppError)
        return res.status(error.status).json({
          error: { code: error.code, message: error.message, retry_after: error.retryAt },
        });
      if (error instanceof SyntaxError)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
      // Never send upstream bodies, credentials or internal stack traces to a browser.
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed. Retry or inspect the server logs.',
        },
      });
    },
  );
  return app;
}
