import { readFile, writeFile } from 'node:fs/promises';
import { config } from '../src/config.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args[args.indexOf(name) + 1] || fallback;
if (!args.includes('--input')) throw new Error('Use --input examples/public_discussion.json [--output examples/node_sample_output.json]');
const input = option('--input');
const output = args.includes('--output') ? option('--output') : 'examples/node_sample_output.json';
const base = process.env.API_BASE_URL || `http://127.0.0.1:${config.port}`;
async function api(path, body) {
  const response = await fetch(`${base}/api${path}`, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(600000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}
const start = performance.now();
const health = await api('/health');
if (!health.model.available) throw new Error(health.model.error);
const discussion = await api('/discussions', JSON.parse(await readFile(input, 'utf8')));
await api(`/discussions/${discussion.id}/analyze`, {});
const data = await api(`/discussions/${discussion.id}/export`);
data.runtime = { model: health.model.name, model_digest: health.model.digest, model_details: health.model.details, provider: 'Ollama', application_runtime: 'Node.js / Express', node_version: process.version, elapsed_seconds: Math.round((performance.now() - start) / 10) / 100, input_file: input, real_inference: true };
await writeFile(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Saved ${data.decisions.length} real model-generated decisions to ${output}`);
