import { ModelUnavailable, ValidationError } from './errors.js';

export function createOllama(config, fetchImpl = fetch) {
  return {
    async health() {
      try {
        const response = await fetchImpl(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error('Ollama unavailable');
        const { models = [] } = await response.json();
        const installed = models.map(m => m.name);
        const selected = models.find(m => [config.model, `${config.model}:latest`].includes(m.name));
        return { available: Boolean(selected), name: config.model, digest: selected?.digest || null, details: selected?.details || null, provider: 'Ollama', installed, error: selected ? null : `Install the model: ollama pull ${config.model}` };
      } catch {
        return { available: false, name: config.model, provider: 'Ollama', installed: [], error: 'Ollama is offline. Start it with ollama serve.' };
      }
    },
    async generate(system, prompt, schema) {
      let response;
      try {
        response = await fetchImpl(`${config.ollamaUrl}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(config.timeoutMs),
          body: JSON.stringify({ model: config.model, stream: false, format: schema,
            messages: [{ role: 'system', content: `${system}\nRequired output JSON schema:\n${JSON.stringify(schema)}` }, { role: 'user', content: prompt }],
            options: { temperature: 0, num_ctx: 16384, num_predict: 6000 } }),
        });
      } catch { throw new ModelUnavailable('Ollama is offline or timed out. Start ollama serve and retry; your discussion is saved.'); }
      if (response.status === 404) throw new ModelUnavailable(`Model ${config.model} is not installed. Run ollama pull ${config.model}, then retry; your discussion is saved.`);
      if (!response.ok) throw new ModelUnavailable(`Ollama could not run ${config.model}. Check ollama list and available memory.`);
      try {
        const data = await response.json();
        return JSON.parse(data.message.content);
      } catch (error) {
        if (['TimeoutError', 'AbortError'].includes(error.name)) throw new ModelUnavailable('Ollama timed out. Retry with a shorter discussion or a faster model; your discussion is saved.');
        throw new ValidationError('The model returned invalid structured data.');
      }
    },
  };
}
