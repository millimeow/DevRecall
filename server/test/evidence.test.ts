import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../src/db.js';
import { makeAI, chunkSources } from '../src/ai.js';
import { validateEvidence, saveDecisions, searchSources } from '../src/evidence.js';
import { ask } from '../src/chat.js';
import type { Source } from '../src/types.js';
const dbs: ReturnType<typeof openDatabase>[] = [];
export function corpus() {
  const db = openDatabase(':memory:');
  dbs.push(db);
  for (const id of [1, 2]) {
    db.prepare('INSERT INTO repositories(id,owner,name,full_name,html_url) VALUES(?,?,?,?,?)').run(
      id,
      'test',
      `repo${id}`,
      `test/repo${id}`,
      `https://github.com/test/repo${id}`,
    );
    db.prepare(
      "INSERT INTO pull_requests(repo_id,number,github_pr_id,title,html_url,state,content_hash,last_analyzed_hash,analysis_status) VALUES(?,1,?,'Caching tradeoff',?,'closed','hash','hash','done')",
    ).run(id, 100 + id, `https://github.com/test/repo${id}/pull/1`);
    db.prepare(
      "INSERT INTO pr_sources(id,repo_id,pr_number,kind,github_source_id,author_login,body,html_url) VALUES(?,?,1,'issue_comment_on_pr',?,'maintainer',?,?)",
    ).run(
      `comment:${id}`,
      id,
      String(id),
      id === 1
        ? 'We rejected global caching because it leaks tenant data.'
        : 'We accepted global caching for performance.',
      `https://github.com/test/repo${id}/pull/1#issuecomment-${id}`,
    );
  }
  return db;
}
afterEach(() => dbs.splice(0).forEach((db) => db.close()));
it('rejects cross-repository citations and invented excerpts', () => {
  const db = corpus();
  expect(() =>
    validateEvidence(db, 1, [{ source_id: 'comment:2', excerpt: 'We accepted' }]),
  ).toThrow();
  expect(() =>
    validateEvidence(db, 1, [{ source_id: 'comment:1', excerpt: 'A fictional reason' }]),
  ).toThrow();
  const valid = validateEvidence(db, 1, [
    { source_id: 'comment:1', excerpt: 'it leaks tenant data' },
  ]);
  expect(valid[0].html_url).toBe('https://github.com/test/repo1/pull/1#issuecomment-1');
});
it('FTS searches escape operators and enforce repository isolation', () => {
  const db = corpus();
  expect(searchSources(db, 1, 'why global caching?').every((x) => x.repo_id === 1)).toBe(true);
  expect(searchSources(db, 1, '" OR * NOT (')).toEqual([]);
  expect(searchSources(db, 1, 'caching')).toHaveLength(1);
});
it('stores cited rejection rationale and alternatives idempotently, using actual feature metrics', () => {
  const db = corpus();
  const decision = {
    title: 'Reject global caching',
    summary: 'Global caching risks tenant isolation.',
    reasoning: 'It leaks tenant data.',
    outcome: 'rejected' as const,
    category: 'feature' as const,
    confidence: 0.9,
    alternatives: [
      { label: 'Global cache', outcome: 'rejected' as const, reason: 'Tenant leakage' },
    ],
    evidence: [
      { source_id: 'comment:1', excerpt: 'it leaks tenant data', role: 'rejection' as const },
    ],
  };
  saveDecisions(db, 1, 1, [decision], 'test-model');
  saveDecisions(db, 1, 1, [decision], 'test-model');
  expect(db.prepare('SELECT * FROM decisions WHERE repo_id=1').all()).toHaveLength(1);
  expect(db.prepare('SELECT reason FROM decision_alternatives').get()).toEqual({
    reason: 'Tenant leakage',
  });
  expect(() =>
    saveDecisions(
      db,
      1,
      1,
      [
        {
          ...decision,
          evidence: [{ source_id: 'comment:2', excerpt: 'global caching', role: 'rejection' }],
        },
      ],
      'test',
    ),
  ).toThrow();
  expect(db.prepare('SELECT * FROM decisions WHERE repo_id=1').all()).toHaveLength(1);
});
it('requires explicit provider and model and never fabricates a fallback', async () => {
  await expect(makeAI({}).generate('test', 'test')).rejects.toMatchObject({
    code: 'AI_NOT_CONFIGURED',
  });
  expect(makeAI({ AI_MODEL: 'some-model' }).configured).toBe(false);
});
it('chunks all source text including oversized comments without losing source IDs', () => {
  const source = { id: 'long', body: 'a'.repeat(2500) } as Source;
  const chunks = chunkSources([source], 1000);
  expect(
    chunks
      .flat()
      .map((x) => x.body)
      .join(''),
  ).toBe(source.body);
  expect(chunks.flat().every((x) => x.id === 'long')).toBe(true);
  expect(chunks.every((chunk) => chunk.reduce((sum, x) => sum + x.body.length, 0) <= 1000)).toBe(
    true,
  );
});
it('answers with exact DB citations and persists repository-scoped history', async () => {
  const db = corpus();
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async () => ({
      insufficient_evidence: false,
      claims: [
        {
          text: 'Global caching was rejected over tenant isolation.',
          evidence: [{ source_id: 'comment:1', excerpt: 'it leaks tenant data' }],
        },
      ],
    }),
  };
  const answer = await ask(db, ai, 1, 'Why reject global caching?');
  expect(answer.citations[0].html_url).toContain('#issuecomment-1');
  expect(db.prepare('SELECT * FROM chat_messages').all()).toHaveLength(2);
  await expect(ask(db, ai, 2, 'Why?', answer.session_id)).rejects.toMatchObject({
    code: 'INVALID_SESSION',
  });
});
it('fails closed when model cites another repository or adds an unsupported claim', async () => {
  const db = corpus();
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async () => ({
      insufficient_evidence: false,
      claims: [
        { text: 'Unsupported', evidence: [{ source_id: 'comment:2', excerpt: 'for performance' }] },
      ],
    }),
  };
  await expect(ask(db, ai, 1, 'caching')).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' });
  expect(db.prepare('SELECT * FROM chat_messages').all()).toHaveLength(0);
});
it('says insufficient evidence when retrieval has no match, without asking the model to guess', async () => {
  const db = corpus();
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async () => {
      throw new Error('must not call');
    },
  };
  const result = await ask(db, ai, 1, 'quantum entanglement');
  expect(result.insufficient_evidence).toBe(true);
  expect(result.citations).toEqual([]);
});
it('retrieves question-relevant text near the end of a long comment', async () => {
  const db = corpus();
  db.prepare('UPDATE pr_sources SET body=? WHERE id=?').run(
    'Background. '.repeat(3000) + 'QUASAR was rejected because it leaks tenant data.',
    'comment:1',
  );
  let prompt = '';
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async (_system: string, input: string) => {
      prompt = input;
      return { insufficient_evidence: true, claims: [] };
    },
  };
  await ask(db, ai, 1, 'Why was QUASAR rejected?');
  expect(JSON.parse(prompt).evidence[0].text).toContain('QUASAR');
});
it('rejects invented literal quotes in answer prose even when a different evidence quote is valid', async () => {
  const db = corpus();
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async () => ({
      insufficient_evidence: false,
      claims: [
        {
          text: 'The maintainer wrote "Caching corrupts the database".',
          evidence: [{ source_id: 'comment:1', excerpt: 'it leaks tenant data' }],
        },
      ],
    }),
  };
  await expect(ask(db, ai, 1, 'caching')).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' });
});
it('persists multiple distinct excerpts with the same source and evidence role', () => {
  const db = corpus();
  saveDecisions(
    db,
    1,
    1,
    [
      {
        title: 'Caching',
        summary: 'Rejected over leakage',
        reasoning: 'Tenant isolation',
        outcome: 'rejected',
        category: 'feature',
        confidence: 0.9,
        alternatives: [],
        evidence: [
          { source_id: 'comment:1', excerpt: 'We rejected global caching', role: 'rejection' },
          { source_id: 'comment:1', excerpt: 'it leaks tenant data', role: 'rejection' },
        ],
      },
    ],
    'test',
  );
  expect(db.prepare('SELECT * FROM decision_evidence').all()).toHaveLength(2);
});

it('rejects invented single-quoted prose while allowing ordinary apostrophes', async () => {
  const db = corpus();
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async () => ({
      insufficient_evidence: false,
      claims: [
        {
          text: "The maintainer wrote 'Caching corrupts the database'.",
          evidence: [{ source_id: 'comment:1', excerpt: 'it leaks tenant data' }],
        },
      ],
    }),
  };
  await expect(ask(db, ai, 1, 'caching')).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' });
  const valid = {
    ...ai,
    generate: async () => ({
      insufficient_evidence: false,
      claims: [
        {
          text: "The maintainer's concern was that caching isn't tenant-safe.",
          evidence: [{ source_id: 'comment:1', excerpt: 'it leaks tenant data' }],
        },
      ],
    }),
  };
  expect((await ask(db, valid, 1, 'caching')).citations).toHaveLength(1);
});

it('accepts a verified citation URL followed by sentence punctuation', async () => {
  const db = corpus();
  const ai = {
    configured: true,
    model: 'test',
    provider: 'test',
    generate: async () => ({
      insufficient_evidence: false,
      claims: [
        {
          text: 'See https://github.com/test/repo1/pull/1#issuecomment-1.',
          evidence: [{ source_id: 'comment:1', excerpt: 'it leaks tenant data' }],
        },
      ],
    }),
  };
  expect((await ask(db, ai, 1, 'caching')).citations).toHaveLength(1);
});
