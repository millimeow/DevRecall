import { readFileSync } from 'node:fs';
import { makeAI, extractionPrompt, extractionSchema } from '../server/src/ai.js';
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/peplike-synthetic-discussion.json', import.meta.url), 'utf8'),
) as { discussion: { id: string; author: string; text: string }[] };
const ai = makeAI(process.env);
if (!ai.configured) {
  console.error(
    'AI_NOT_CONFIGURED: set AI_PROVIDER and AI_MODEL for the offline synthetic PEP evaluation. No results fabricated.',
  );
  process.exitCode = 1;
} else {
  const result = extractionSchema.parse(
    await ai.generate(
      extractionPrompt,
      JSON.stringify(
        fixture.discussion.map((s) => ({ source_id: s.id, author: s.author, text: s.text })),
      ),
    ),
  );
  const sources = new Map(fixture.discussion.map((s) => [s.id, s.text]));
  const invalid = result.decisions
    .flatMap((d) => d.evidence)
    .some((e) => !sources.get(e.source_id)?.includes(e.excerpt));
  const rejected = result.decisions.some(
    (d) =>
      (d.outcome === 'rejected' || d.alternatives.some((a) => a.outcome === 'rejected')) &&
      /tenant/i.test(d.reasoning),
  );
  console.log(
    JSON.stringify(
      {
        synthetic: true,
        model: ai.model,
        valid_evidence: !invalid,
        recovered_rejection_reason: rejected,
        output: result,
      },
      null,
      2,
    ),
  );
  if (invalid || !rejected) process.exitCode = 1;
}
