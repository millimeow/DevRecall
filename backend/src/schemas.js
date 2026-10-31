import Ajv from 'ajv';
import { ValidationError } from './errors.js';

const status = { type: 'string', enum: ['accepted', 'rejected', 'proposed', 'contested', 'uncertain'] };
const text = (maxLength, minLength = 0) => ({ type: 'string', minLength, maxLength });
const nullableText = maxLength => ({ anyOf: [text(maxLength), { type: 'null' }] });
const array = (items, maxItems = 500) => ({ type: 'array', items, maxItems });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });

export const modelExtractionSchema = object({ decisions: array(object({
  title: text(160, 1), question: text(2000), summary: text(10000),
  approaches: array(object({ name: text(160, 1), status, reason_is_stated: { type: 'boolean' }, message_id: text(200, 1), quote: text(500, 1) }), 20),
  code_refs: array(text(1000), 100), uncertainties: array(text(2000), 100),
}), 30) });

export const modelAnswerSchema = object({
  answer: text(20000, 1), supporting_message_ids: array(text(200, 1), 100),
  evidence: array(object({ message_id: text(200, 1), quote: text(600, 1), claim_type: { type: 'string', enum: ['decision_status', 'chosen_approach', 'alternative_status', 'rejection_reason', 'rationale', 'code_reference'] } }), 100),
  uncertainty_note: nullableText(4000),
});

const messageSchema = object({ body: text(60000, 1), author: nullableText(200), source_url: nullableText(2000), created_at: nullableText(200) }, ['body']);
const discussionSchema = object({ title: text(240, 1), source_type: { ...status, enum: ['paste', 'github_issue', 'github_pr', 'forum'] }, source_url: nullableText(2000), raw_text: nullableText(200000), messages: array(messageSchema, 500) }, ['title']);
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map();
export function validate(schema, value) {
  if (!validators.has(schema)) validators.set(schema, ajv.compile(schema));
  const validator = validators.get(schema);
  if (!validator(value)) {
    const error = validator.errors[0];
    throw new ValidationError(`${error.instancePath || 'Input'} ${error.message}.`);
  }
  return value;
}

export function discussionInput(value) {
  const data = structuredClone(value);
  validate(discussionSchema, data);
  data.title = data.title.trim();
  data.messages ||= [];
  data.source_type ||= 'paste';
  if (!data.title || (!data.raw_text?.trim() && !data.messages.length)) throw new ValidationError('Add a title and public discussion text or messages.');
  if (data.raw_text && data.messages.length) throw new ValidationError('Use raw_text or messages, not both.');
  if (data.messages.some(m => !m.body.trim())) throw new ValidationError('Messages cannot be blank.');
  if (data.messages.reduce((n, m) => n + m.body.length, 0) > 200000) throw new ValidationError('Discussion exceeds 200,000 characters.');
  for (const url of [data.source_url, ...data.messages.map(m => m.source_url)]) {
    if (url && !/^https?:\/\//.test(url)) throw new ValidationError('Source links must use HTTP or HTTPS.');
  }
  return data;
}
export const askInputSchema = object({ question: text(2000, 1), discussion_id: nullableText(100) }, ['question']);
export const githubInputSchema = object({ url: text(2000, 1) });
export const contextInputSchema = object({ paths: { ...array(text(2000, 1), 200), minItems: 1 } });

export const emptyDecision = data => ({ title: '', question: null, chosen_approach: null, status: 'uncertain', summary: '', confidence: 'low', alternatives: [], rationales: [], evidence: [], code_refs: [], uncertainties: [], ...data });
export const evidence = (message_id, quote, claim_type = 'rationale') => ({ message_id, quote, claim_type, verified: false, source_url: null, author: null });
