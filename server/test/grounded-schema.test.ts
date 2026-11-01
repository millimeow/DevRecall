import { expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { z } from 'zod';
import { extractionSchema, answerSchema } from '../src/ai.js';
import { groundedSchema } from '../src/grounded-schema.js';
const sources = [
  {
    id: 'repo1:body',
    body: 'Use multiple `--exclude`s  or a regex.\r\nWe rejected regex because of unnecessary complexity.',
  },
  { id: 'repo1:comment', body: 'This is great, thank you very much.' },
];
it('allows exact evidence but rejects normalized spaces, removed markup, ellipses and source swaps', () => {
  const validate = new Ajv2020({ strict: false }).compile(
    groundedSchema(z.toJSONSchema(answerSchema), sources),
  );
  const answer = (source_id: string, excerpt: string) => ({
    insufficient_evidence: false,
    claims: [{ text: 'A cited claim', evidence: [{ source_id, excerpt }] }],
  });
  expect(validate(answer('repo1:body', 'Use multiple `--exclude`s  or a regex.'))).toBe(true);
  expect(validate(answer('repo1:body', 'Use multiple `--exclude`s or a regex.'))).toBe(false);
  expect(validate(answer('repo1:body', 'Use multiple --excludes  or a regex.'))).toBe(false);
  expect(validate(answer('repo1:body', 'Use multiple ... or a regex.'))).toBe(false);
  expect(validate(answer('repo1:comment', 'Use multiple `--exclude`s  or a regex.'))).toBe(false);
  expect(validate(answer('other-repo:id', 'This is great, thank you very much.'))).toBe(false);
});
it('keeps role/outcome constraints and offers only actual spans from oversized sources', () => {
  const source = {
    id: 'long',
    body: ('Word '.repeat(100) + 'Exact final rationale.\r\n').repeat(3),
  };
  const schema = groundedSchema(z.toJSONSchema(extractionSchema), [source]);
  const validate = new Ajv2020({ strict: false }).compile(schema);
  const excerpts: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.properties && typeof obj.properties === 'object') {
      const p = obj.properties as Record<string, { enum?: string[] }>;
      if (p.excerpt?.enum) excerpts.push(...p.excerpt.enum);
    }
    Object.values(obj).forEach((value) =>
      Array.isArray(value) ? value.forEach(visit) : visit(value),
    );
  };
  visit(schema);
  expect(excerpts.length).toBeGreaterThan(1);
  expect(excerpts.every((e) => source.body.includes(e) && e.length <= 300)).toBe(true);
  const decision = {
    title: 'Choice',
    summary: 'Rationale',
    reasoning: 'Reason',
    outcome: 'rejected',
    category: 'feature',
    confidence: 0.9,
    alternatives: [],
    evidence: [{ source_id: 'long', excerpt: excerpts[0], role: 'rejection' }],
  };
  expect(validate({ decisions: [decision] })).toBe(true);
  expect(
    validate({
      decisions: [{ ...decision, evidence: [{ ...decision.evidence[0], role: 'invented-role' }] }],
    }),
  ).toBe(false);
});
