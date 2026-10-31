import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase, createStore } from '../src/database.js';
import { createOllama } from '../src/llm.js';
import { ModelUnavailable, ValidationError } from '../src/errors.js';
import { evidence, emptyDecision, discussionInput, modelExtractionSchema, validate } from '../src/schemas.js';
import { verify, validateDecision } from '../src/evidence.js';
import { extract, chunks } from '../src/extraction.js';

async function fixture(t) {
  const db = openDatabase(':memory:');
  const llm = { health: async () => ({ available: false, name: 'test-model', provider: 'Ollama' }), generate: async () => { throw new ModelUnavailable('Ollama is offline'); } };
  const app = createApp({ db, llm, config: { model: 'test-model' } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body) => {
    const response = await fetch(`${base}/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, response };
  };
  return { db, llm, app, request };
}

const input = { title: 'SYNTHETIC: storage discussion', messages: [
  { author: 'A', body: 'We choose SQLite in src/store.py. Reject flat files because writes race. Reject Redis because persistence requires extra operations.' },
  { author: 'B', body: 'Agreed, SQLite is the accepted approach.' },
] };
async function imported(request) { const r = await request('/discussions', input); assert.equal(r.status, 201); return r.data; }
function result(discussion) {
  const message_id = discussion.messages[0].id;
  return { decisions: [{ title: 'Storage', question: 'Which storage should we use?', summary: 'SQLite selected.', approaches: [
    { name: 'SQLite', status: 'accepted', reason_is_stated: false, message_id, quote: 'We choose SQLite in src/store.py.' },
    { name: 'Flat files', status: 'rejected', reason_is_stated: true, message_id, quote: 'Reject flat files because writes race.' },
    { name: 'Redis', status: 'rejected', reason_is_stated: true, message_id, quote: 'Reject Redis because persistence requires extra operations.' },
  ], code_refs: ['src/store.py', 'invented.py'], uncertainties: [] }] };
}

test('imports validate content, URLs and immutable message IDs', async t => {
  const { request } = await fixture(t);
  for (const body of [{ title: 'Empty' }, { title: ' ', raw_text: 'text' }, { title: 'x', raw_text: 'text', source_url: 'javascript:alert(1)' }, { title: 'x', messages: [{ body: '  ' }] }, { title: 'x', raw_text: 'a', messages: [{ body: 'b' }] }]) assert.equal((await request('/discussions', body)).status, 422);
  const d = await imported(request);
  assert.deepEqual((await request(`/discussions/${d.id}`)).data.messages, d.messages);
  assert.equal((await request('/discussions/missing')).status, 404);
  assert.equal((await request('/decisions/missing')).status, 404);
});

test('exact quotes verify with normalized whitespace and trusted provenance', () => {
  const items = [evidence('m1', 'flat files because writes race.'), evidence('m1', 'Flat files are perfect.'), evidence('fake', 'writes race.')];
  items[0].source_url = 'https://invented.invalid';
  verify(items, [{ id: 'm1', body: 'Reject flat files\nbecause writes race.', author: 'Actual author', source_url: 'https://example.org/thread' }]);
  assert.deepEqual(items.map(e => e.verified), [true, false, false]);
  assert.equal(items[0].source_url, 'https://example.org/thread');
  assert.equal(items[0].author, 'Actual author');
});

test('missing evidence removes unsupported choice, outcome and rationale', () => {
  const d = emptyDecision({ title: 'Storage', status: 'accepted', chosen_approach: 'SQLite', alternatives: [{ name: 'Redis', status: 'rejected', reason: 'invented', evidence: [] }] });
  validateDecision(d, []);
  assert.equal(d.status, 'uncertain'); assert.equal(d.chosen_approach, null);
  assert.equal(d.alternatives[0].status, 'uncertain'); assert.equal(d.alternatives[0].reason, null);
  assert.ok(d.uncertainties.length);
});

test('a code example or mere proposal cannot establish a confirmed outcome', () => {
  const d = emptyDecision({ title: 'Hints', status: 'accepted', chosen_approach: 'String annotations', evidence: [evidence('m1', "def f(x: 'Foo|int'): pass", 'decision_status'), evidence('m1', "def f(x: 'Foo|int'): pass", 'chosen_approach')], alternatives: [{ name: 'Redis', status: 'rejected', reason: null, evidence: [evidence('m2', 'We could consider Redis.', 'alternative_status')] }] });
  validateDecision(d, [{ id: 'm1', body: "def f(x: 'Foo|int'): pass" }, { id: 'm2', body: 'We could consider Redis.' }]);
  assert.equal(d.status, 'uncertain'); assert.equal(d.chosen_approach, null); assert.equal(d.alternatives[0].status, 'uncertain');
});

test('pipeline stores supported outcomes, searches reasons, exports and matches paths', async t => {
  const { request, llm } = await fixture(t);
  const d = await imported(request); llm.generate = async () => result(d);
  const analyzed = await request(`/discussions/${d.id}/analyze`, {});
  assert.equal(analyzed.status, 200);
  const decision = analyzed.data.decisions[0];
  assert.equal(decision.status, 'accepted'); assert.equal(decision.chosen_approach, 'SQLite');
  assert.deepEqual(decision.code_refs, ['src/store.py']);
  assert.ok(decision.evidence.every(e => e.verified));
  assert.equal((await request('/search?q=Redis')).data.length, 1);
  assert.equal((await request('/decisions/' + decision.id)).status, 200);
  assert.match((await request(`/discussions/${d.id}/export?format=markdown`)).data, /Storage/);
  assert.equal((await request(`/discussions/${d.id}/export?format=bad`)).status, 400);
  assert.equal((await request('/pr-context', { paths: ['./src/store.py'] })).data.length, 1);
  assert.deepEqual((await request('/pr-context', { paths: ['src/other.py'] })).data, []);
  assert.equal((await request('/discussions')).data[0].decision_count, 1);
});

test('model failure persists a failed run and preserves prior successful decisions', async t => {
  const { request, llm } = await fixture(t);
  const d = await imported(request); llm.generate = async () => result(d);
  await request(`/discussions/${d.id}/analyze`, {});
  const before = (await request(`/discussions/${d.id}/decisions`)).data;
  llm.generate = async () => { throw new ModelUnavailable('Ollama is offline'); };
  assert.equal((await request(`/discussions/${d.id}/analyze`, {})).status, 503);
  assert.deepEqual((await request(`/discussions/${d.id}/decisions`)).data, before);
  assert.equal((await request(`/discussions/${d.id}`)).data.runs[0].status, 'failed');
});

test('invalid structured output retries once before a focused rejection pass', async t => {
  const { request, llm } = await fixture(t); const d = await imported(request); let calls = 0;
  llm.generate = async () => { if (++calls === 1) return { bad: true }; return result(d); };
  assert.equal((await request(`/discussions/${d.id}/analyze`, {})).status, 200); assert.equal(calls, 3);
  llm.generate = async () => ({ bad: true });
  assert.equal((await request(`/discussions/${d.id}/analyze`, {})).status, 422);
});

test('cross-chunk disagreement keeps both source viewpoints', async () => {
  const messages = [{ id: 'm1', body: 'We accept SQLite. ' + 'a'.repeat(13000) }, { id: 'm2', body: 'SQLite remains contested. ' + 'b'.repeat(13000) }];
  const make = (id, quote, status) => ({ decisions: [{ title: 'Storage', question: 'Which storage?', summary: 'Synthetic', approaches: [{ name: 'SQLite', status, reason_is_stated: false, message_id: id, quote }], code_refs: [], uncertainties: [] }] });
  const outputs = [make('m1', 'We accept SQLite.', 'accepted'), { decisions: [] }, make('m2', 'SQLite remains contested.', 'contested'), { decisions: [] }];
  const decisions = await extract(messages, { generate: async () => outputs.shift() });
  assert.equal(decisions.length, 1); assert.equal(decisions[0].status, 'contested');
  assert.deepEqual([...new Set(decisions[0].evidence.map(e => e.message_id))].sort(), ['m1', 'm2']);
});

test('Ask abstains on missing support and rejects invented message IDs or quotes', async t => {
  const { request, llm } = await fixture(t);
  assert.deepEqual((await request('/ask', { question: 'Why Redis?' })).data.citations, []);
  const d = await imported(request);
  llm.generate = async () => ({ answer: 'Invented', supporting_message_ids: ['fake'], evidence: [{ message_id: 'fake', quote: 'fabricated', claim_type: 'rationale' }], uncertainty_note: null });
  assert.match((await request('/ask', { question: 'Why Redis?' })).data.answer, /couldn't verify/);
  llm.generate = async () => ({ answer: 'Invented', supporting_message_ids: [d.messages[0].id], evidence: [{ message_id: d.messages[0].id, quote: 'Made up quote', claim_type: 'rationale' }], uncertainty_note: null });
  assert.deepEqual((await request('/ask', { question: 'Why Redis?' })).data.citations, []);
});

test('Ask retrieves original messages even without any extracted decisions', async t => {
  const { request, llm } = await fixture(t); const d = await imported(request); const id = d.messages[0].id;
  llm.generate = async () => ({ answer: 'Redis requires extra operations.', supporting_message_ids: [id], evidence: [{ message_id: id, quote: 'Reject Redis because persistence requires extra operations.', claim_type: 'rationale' }], uncertainty_note: null });
  const answer = (await request('/ask', { question: 'Why Redis?', discussion_id: d.id })).data;
  assert.equal(answer.citations[0].verified, true); assert.deepEqual(answer.supporting_message_ids, [id]);
});

test('overlong model messages fail before inference and API health stays honest', async t => {
  const { request, llm } = await fixture(t); let called = false;
  llm.generate = async () => { called = true; };
  const d = (await request('/discussions', { title: 'Long', raw_text: 'x'.repeat(23000) })).data;
  assert.equal((await request(`/discussions/${d.id}/analyze`, {})).status, 422); assert.equal(called, false);
  assert.equal((await request('/health')).data.model.available, false);
  assert.equal((await request('/github/import', { url: 'http://localhost/private' })).status, 400);
  assert.throws(() => [...chunks([{ id: 'm', body: 'x'.repeat(23000) }])], ValidationError);
});

test('concurrent analysis of the same discussion returns conflict', async t => {
  const { request, llm } = await fixture(t); const d = await imported(request);
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  llm.generate = async () => { began(); await gate; return result(d); };
  const first = request(`/discussions/${d.id}/analyze`, {}); await started;
  const second = await request(`/discussions/${d.id}/analyze`, {}); release();
  assert.equal(second.status, 409); assert.equal((await first).status, 200);
});

test('SQLite schema, payloads and IDs survive closing and reopening in Node', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devrecall-test-'));
  try {
    const path = join(dir, 'data.db'); let db = openDatabase(path); let store = createStore(db);
    const d = store.importDiscussion(discussionInput(input));
    const run = store.startRun(d.id, 'test-model'); const payload = emptyDecision({ title: 'Historical', summary: 'Existing payload' });
    store.finishRun(run, d.id, [payload]); const before = store.decisions(d.id);
    db.close(); db = openDatabase(path); store = createStore(db);
    assert.deepEqual(store.getDiscussion(d.id).messages, d.messages); assert.deepEqual(store.decisions(d.id), before); db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('model schema requires complete claims and refuses self-verified provenance', () => {
  const schema = modelExtractionSchema.properties.decisions.items.properties.approaches.items;
  assert.ok(schema.required.includes('quote')); assert.ok(schema.required.includes('reason_is_stated'));
  assert.ok(!schema.properties.verified); assert.ok(!schema.properties.author);
  assert.throws(() => validate(modelExtractionSchema, { decisions: [{ title: 'Partial' }] }), ValidationError);
});

test('Ollama adapter reports offline, missing model and malformed model content', async () => {
  const config = { model: 'test', ollamaUrl: 'http://local.invalid', timeoutMs: 100 };
  const offline = createOllama(config, async () => { throw new Error('offline'); });
  assert.equal((await offline.health()).available, false);
  await assert.rejects(offline.generate('s', 'p', {}), ModelUnavailable);
  await assert.rejects(createOllama(config, async () => new Response('{}', { status: 404 })).generate('s', 'p', {}), /not installed/);
  await assert.rejects(createOllama(config, async () => Response.json({ message: { content: 'invalid json' } })).generate('s', 'p', {}), ValidationError);
  let sent;
  const working = createOllama(config, async (url, options) => { sent = JSON.parse(options.body); return Response.json({ message: { content: '{"decisions":[]}' } }); });
  assert.deepEqual(await working.generate('system', 'input', modelExtractionSchema), { decisions: [] });
  assert.deepEqual(sent.format, modelExtractionSchema); assert.match(sent.messages[0].content, /Required output JSON schema/);
});
