import express from 'express';
import cors from 'cors';
import { createStore } from './database.js';
import { extract } from './extraction.js';
import { askQuestion, searchDecisions } from './retrieval.js';
import { importGithub } from './github.js';
import { AppError, ValidationError } from './errors.js';
import { askInputSchema, contextInputSchema, discussionInput, githubInputSchema, validate } from './schemas.js';

export function createApp({ db, llm, config, githubFetch }) {
  const app = express();
  const store = createStore(db);
  const active = new Set();
  app.disable('x-powered-by');
  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
  app.use(express.json({ limit: '3mb' }));

  app.get('/api/health', async (req, res) => { db.prepare('SELECT 1').get(); res.json({ status: 'ok', database: 'ok', model: await llm.health(), runtime: 'Node.js / Express' }); });
  app.post('/api/discussions', (req, res) => res.status(201).json(store.importDiscussion(discussionInput(req.body))));
  app.get('/api/discussions', (req, res) => res.json(store.listDiscussions()));
  app.get('/api/discussions/:id', (req, res) => res.json(store.getDiscussion(req.params.id)));
  app.get('/api/discussions/:id/decisions', (req, res) => { store.getDiscussion(req.params.id); res.json(store.decisions(req.params.id)); });
  app.get('/api/decisions/:id', (req, res) => {
    const decision = store.decisions().find(d => d.id === req.params.id);
    if (!decision) throw new AppError(404, 'Decision not found');
    res.json(decision);
  });
  app.post('/api/discussions/:id/analyze', async (req, res) => {
    const discussion = store.getDiscussion(req.params.id);
    if (active.has(discussion.id)) throw new AppError(409, 'This discussion is already being analyzed.');
    active.add(discussion.id);
    let runId;
    try {
      runId = store.startRun(discussion.id, config.model);
      const decisions = await extract(discussion.messages, llm);
      store.finishRun(runId, discussion.id, decisions);
      res.json({ run_id: runId, model: config.model, decisions: store.decisions(discussion.id) });
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Analysis failed unexpectedly. Your discussion and previous results are saved.';
      if (runId) store.failRun(runId, message);
      if (error instanceof AppError) throw error;
      throw new AppError(500, message);
    } finally { active.delete(discussion.id); }
  });
  app.get('/api/search', (req, res) => {
    const q = req.query.q || '';
    if (typeof q !== 'string' || q.length > 2000 || (req.query.discussion_id && typeof req.query.discussion_id !== 'string')) throw new ValidationError('Use a query under 2,000 characters.');
    res.json(searchDecisions(store, q, req.query.discussion_id));
  });
  app.post('/api/ask', async (req, res) => res.json(await askQuestion(store, llm, validate(askInputSchema, req.body))));
  app.post('/api/github/import', async (req, res) => res.status(201).json(await importGithub(validate(githubInputSchema, req.body).url, store, githubFetch)));
  app.post('/api/pr-context', (req, res) => {
    const { paths } = validate(contextInputSchema, req.body);
    const normalized = new Set(paths.map(p => p.replaceAll('\\', '/').replace(/^\.\//, '')));
    res.json(store.decisions().filter(d => d.code_refs.some(ref => normalized.has(ref))).map(d => ({ decision: d, matched_paths: d.code_refs.filter(ref => normalized.has(ref)).sort(), reason: 'Exact match to an explicitly cited source-code path.' })));
  });
  app.get('/api/discussions/:id/export', (req, res) => {
    const discussion = store.getDiscussion(req.params.id), decisions = store.decisions(req.params.id);
    const format = req.query.format || 'json';
    if (format === 'json') return res.json({ discussion, decisions });
    if (format !== 'markdown') throw new AppError(400, 'Choose json or markdown');
    const lines = [`# ${discussion.title}`, '', 'Model summaries are interpretations. Exact-quote verification does not establish entailment.'];
    for (const d of decisions) {
      lines.push(`\n## ${d.title} (${d.status})`, d.summary, `Chosen approach: ${d.chosen_approach || 'Not established'}`);
      for (const a of d.alternatives) lines.push(`\n### ${a.name} (${a.status})`, a.reason || 'Reason not verified');
      for (const e of [...d.evidence, ...d.alternatives.flatMap(a => a.evidence)]) lines.push(`\n> ${e.quote}`, `Source: ${e.message_id} — ${e.source_url || 'imported message'} — ${e.verified ? 'quote verified' : 'unverified'}`);
    }
    res.type('text/markdown').send(lines.join('\n'));
  });
  app.use((req, res) => res.status(404).json({ detail: 'Endpoint not found' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ detail: 'Request is too large. Import a smaller discussion.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ detail: 'Request body must be valid JSON.' });
    res.status(error.status || 500).json({ detail: error instanceof AppError ? error.message : 'An unexpected server error occurred. Retry your request.' });
  });
  app.locals.store = store;
  return app;
}
