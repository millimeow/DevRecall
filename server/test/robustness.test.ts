import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, enqueue, jobById, summary } from '../src/db.js';
import { GitHubClient } from '../src/github.js';
import { Worker } from '../src/worker.js';
import { makeAI, type AI } from '../src/ai.js';
import { extractionSchema } from '../src/ai.js';
import { readFileSync } from 'node:fs';
const dbs: ReturnType<typeof openDatabase>[] = [];
afterEach(() =>
  dbs.splice(0).forEach((db) => {
    if (db.open) db.close();
  }),
);
function db() {
  const d = openDatabase(':memory:');
  dbs.push(d);
  return d;
}
describe('provider boundary', () => {
  it('can keep extraction fast while enabling thinking for grounded chat', async () => {
    const requests: Record<string, unknown>[] = [];
    const ai = makeAI(
      {
        AI_PROVIDER: 'ollama',
        AI_MODEL: 'qwen3.5:4b-q4_K_M',
        AI_THINK: 'true',
        AI_EXTRACTION_THINK: 'false',
      },
      async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ message: { content: '{}' } });
      },
    );
    await ai.generate('system', 'sources', undefined, { task: 'extraction' });
    await ai.generate('system', 'question', undefined, { task: 'answer' });
    expect(requests.map((r) => r.think)).toEqual([false, true]);
  });
  it('passes the response schema and explicit local memory/thinking limits to Ollama', async () => {
    let payload: Record<string, unknown> = {};
    const schema = {
      type: 'object',
      properties: { decisions: { type: 'array' } },
      required: ['decisions'],
    };
    const ai = makeAI(
      {
        AI_PROVIDER: 'ollama',
        AI_MODEL: 'qwen3.5:4b',
        AI_NUM_CTX: '8192',
        AI_NUM_PREDICT: '3072',
        AI_THINK: 'false',
      },
      async (_url, init) => {
        payload = JSON.parse(String(init?.body));
        return Response.json({ message: { content: '{"decisions":[]}' } });
      },
    );
    await ai.generate('system', 'sources', schema);
    expect(payload.format).toEqual(schema);
    expect(payload.think).toBe(false);
    expect(payload.options).toMatchObject({ num_ctx: 8192, num_predict: 3072 });
  });
  it.each(['0', '-1', 'not-a-number'])(
    'rejects unsafe local context size %s before contacting the model',
    async (value) => {
      let contacted = false;
      const ai = makeAI(
        { AI_PROVIDER: 'ollama', AI_MODEL: 'qwen3.5:4b', AI_NUM_CTX: value },
        async () => {
          contacted = true;
          return Response.json({ message: { content: '{}' } });
        },
      );
      await expect(ai.generate('system', 'sources')).rejects.toMatchObject({
        code: 'AI_CONFIGURATION',
      });
      expect(contacted).toBe(false);
    },
  );
  it('sends the explicitly chosen local model and rejects non-JSON output', async () => {
    let payload: Record<string, unknown> = {};
    const model = makeAI(
      { AI_PROVIDER: 'ollama', AI_MODEL: 'chosen-by-user' },
      async (url, init) => {
        expect(String(url)).toBe('http://127.0.0.1:11434/api/chat');
        payload = JSON.parse(String(init?.body));
        return Response.json({ message: { content: '{"decisions":[]}' } });
      },
    );
    expect(await model.generate('system', 'sources')).toEqual({ decisions: [] });
    expect(payload.model).toBe('chosen-by-user');
    const invalid = makeAI({ AI_PROVIDER: 'ollama', AI_MODEL: 'chosen-by-user' }, async () =>
      Response.json({ message: { content: 'invented plain text' } }),
    );
    await expect(invalid.generate('system', 'sources')).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
  });
  it('supports self-hosted OpenAI-compatible endpoints and redacts upstream errors', async () => {
    const model = makeAI(
      {
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'chosen-model',
        AI_BASE_URL: 'http://localhost:8000/v1',
        AI_API_KEY: 'test-secret',
      },
      async (url, init) => {
        expect(String(url)).toBe('http://localhost:8000/v1/chat/completions');
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-secret');
        return Response.json({
          choices: [{ message: { content: '{"claims":[],"insufficient_evidence":true}' } }],
        });
      },
    );
    expect(await model.generate('system', 'sources')).toMatchObject({
      insufficient_evidence: true,
    });
    const failing = makeAI(
      { AI_PROVIDER: 'ollama', AI_MODEL: 'test' },
      async () => new Response('SECRET UPSTREAM BODY', { status: 500 }),
    );
    await expect(failing.generate('s', 'p')).rejects.toThrow('HTTP 500');
    await expect(failing.generate('s', 'p')).rejects.not.toThrow('SECRET');
  });
});
describe('GitHub failures', () => {
  it('honors primary reset headers, secondary retry headers, and rejects redirect exfiltration', async () => {
    for (const headers of [
      {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 300),
      },
      { 'Retry-After': '60' },
    ]) {
      const gh = new GitHubClient('test-secret', async () =>
        Response.json({ message: 'rate limit' }, { status: 403, headers }),
      );
      await expect(gh.resolve('https://github.com/test/repo')).rejects.toMatchObject({
        code: 'GITHUB_RATE_LIMIT',
        status: 429,
        retryAt: expect.any(String),
      });
    }
    let calls = 0;
    const gh = new GitHubClient('secret', async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.example/token' },
      });
    });
    await expect(gh.resolve('https://github.com/test/repo')).rejects.toMatchObject({
      code: 'GITHUB_REDIRECT',
    });
    expect(calls).toBe(1);
  });
  it('treats secondary rate-limit 403s without Retry-After as retryable', async () => {
    const gh = new GitHubClient('', async () =>
      Response.json({ message: 'You have exceeded a secondary rate limit.' }, { status: 403 }),
    );
    await expect(gh.resolve('https://github.com/test/repo')).rejects.toMatchObject({
      code: 'GITHUB_RATE_LIMIT',
      retryAt: expect.any(String),
    });
  });
});
it('reopens on-disk migrations without losing indexed state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devrecall-migration-'));
  const path = join(dir, 'data.db');
  const first = openDatabase(path);
  first
    .prepare(
      "INSERT INTO repositories(id,owner,name,full_name,html_url) VALUES(1,'test','repo','test/repo','https://github.com/test/repo')",
    )
    .run();
  first.close();
  const second = openDatabase(path);
  expect(second.prepare('SELECT * FROM repositories').all()).toHaveLength(1);
  expect(second.prepare('SELECT * FROM schema_migrations').all()).toHaveLength(3);
  second.close();
  rmSync(dir, { recursive: true });
});
it('synthetic PEP fixture records rejected idea with verbatim reason and excludes final PEP', () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('../../fixtures/peplike-synthetic-discussion.json', import.meta.url),
      'utf8',
    ),
  ) as { synthetic: boolean; discussion: { id: string; text: string }[] };
  expect(fixture.synthetic).toBe(true);
  expect(fixture).not.toHaveProperty('final_pep');
  const rejected = fixture.discussion.find((s) => s.id === 'review')!;
  const parsed = extractionSchema.parse({
    decisions: [
      {
        title: 'Reject process-wide cache',
        summary: 'Use interpreter-local cache.',
        reasoning: 'Prevent tenant data leakage.',
        outcome: 'rejected',
        category: 'architecture',
        confidence: 0.9,
        alternatives: [
          {
            label: 'Process-wide mutable cache',
            outcome: 'rejected',
            reason: 'It leaks tenant data.',
          },
        ],
        evidence: [{ source_id: 'review', excerpt: rejected.text, role: 'rejection' }],
      },
    ],
  });
  expect(parsed.decisions[0].reasoning).toContain('tenant');
});
it('persists analysis failures as partial and can resume after model recovery', async () => {
  const d = db();
  d.prepare(
    "INSERT INTO repositories(id,owner,name,full_name,html_url) VALUES(1,'test','repo','test/repo','https://github.com/test/repo')",
  ).run();
  const gh = new GitHubClient('', async (input) =>
    Response.json(
      new URL(String(input)).pathname.endsWith('/pulls')
        ? [
            {
              id: 1,
              number: 1,
              title: 'Test',
              body: 'Proposal with a reason',
              html_url: 'https://github.com/test/repo/pull/1',
              user: { login: 'a' },
              state: 'open',
              merged_at: null,
              created_at: '2026-01-01',
              updated_at: '2026-01-01',
            },
          ]
        : [],
    ),
  );
  const broken: AI = {
    configured: true,
    model: 'chosen',
    provider: 'test',
    generate: async () => {
      throw new Error('Model offline');
    },
  };
  const job = enqueue(d, 1);
  await new Worker(d, gh, broken).runJob(job.id);
  expect(jobById(d, job.id).status).toBe('partial');
  expect(summary(d, 1).prs_analyzed).toBe(0);
  const recovered: AI = { ...broken, generate: async () => ({ decisions: [] }) };
  await new Worker(d, gh, recovered).runJob(enqueue(d, 1).id);
  expect(jobById(d, job.id).status).toBe('completed');
});
