export const normalize = text => text.replace(/\s+/gu, ' ').trim();

export function verify(items, messages) {
  const byId = new Map(messages.map(m => [m.id, m]));
  for (const item of items) {
    const message = byId.get(item.message_id);
    item.verified = Boolean(message && normalize(item.quote) && normalize(message.body).includes(normalize(item.quote)));
    item.source_url = message?.source_url || null;
    item.author = message?.author || null;
  }
  return items;
}

function explicitOutcome(name, status, items) {
  const language = status === 'accepted' ? /\b(accept\w*|choos\w*|chose\w*|agreed|proceed|settled|use)\b/i : /\b(reject\w*|dislik\w*|oppose\w*|unacceptable|infeasible|against|cannot)\b|not worth|too complex|bad way|can't|won't/i;
  return items.some(e => normalize(e.quote).toLowerCase().includes(normalize(name).toLowerCase()) && language.test(e.quote));
}

export function validateDecision(decision, messages) {
  verify(decision.evidence, messages);
  const verified = decision.evidence.filter(e => e.verified);
  if (!verified.some(e => e.claim_type === 'decision_status')) {
    if (decision.status !== 'uncertain') decision.uncertainties.push('Decision outcome lacks verified status evidence.');
    decision.status = 'uncertain';
  }
  if (decision.chosen_approach && !verified.some(e => e.claim_type === 'chosen_approach')) {
    decision.chosen_approach = null;
    decision.uncertainties.push('Chosen approach was removed: no verified supporting quote.');
  }
  if (decision.status === 'accepted' && (!decision.chosen_approach || !explicitOutcome(decision.chosen_approach, 'accepted', verified.filter(e => e.claim_type === 'decision_status')))) {
    decision.status = 'uncertain'; decision.chosen_approach = null;
    decision.uncertainties.push('The quoted text does not explicitly name and select the claimed approach; outcome downgraded to uncertain.');
  }
  for (const alternative of decision.alternatives) {
    verify(alternative.evidence, messages);
    const valid = alternative.evidence.filter(e => e.verified);
    if (!valid.some(e => e.claim_type === 'alternative_status')) {
      alternative.status = 'uncertain';
      decision.uncertainties.push(`${alternative.name}: outcome lacks verified status evidence.`);
    }
    if (['accepted', 'rejected'].includes(alternative.status) && !explicitOutcome(alternative.name, alternative.status, valid.filter(e => e.claim_type === 'alternative_status'))) {
      alternative.status = 'uncertain';
      decision.uncertainties.push(`${alternative.name}: quote does not explicitly name this approach with a clear outcome; review the source.`);
    }
    const kind = alternative.status === 'rejected' ? 'rejection_reason' : 'rationale';
    if (alternative.reason && !valid.some(e => e.claim_type === kind)) {
      alternative.reason = null;
      decision.uncertainties.push(`${alternative.name}: reason removed because its evidence could not be verified.`);
    }
    if (alternative.reason && !valid.some(e => e.claim_type === kind && normalize(e.quote).toLowerCase().includes(normalize(alternative.reason).toLowerCase()))) {
      alternative.reason = null;
      decision.uncertainties.push(`${alternative.name}: reason removed because it was not an explanatory excerpt of its cited quote.`);
    }
  }
  for (const rationale of decision.rationales) { verify(rationale.evidence, messages); rationale.verified = rationale.evidence.some(e => e.verified); }
  const all = [...verified, ...decision.alternatives.flatMap(a => a.evidence.filter(e => e.verified)), ...decision.rationales.flatMap(r => r.evidence.filter(e => e.verified))];
  decision.code_refs = decision.code_refs.filter(ref => all.some(e => e.quote.includes(ref)));
  if (decision.evidence.some(e => !e.verified) || decision.uncertainties.length) decision.confidence = 'low';
  if (!verified.length) decision.summary = 'Insufficient verified evidence. Review the original messages.';
  return decision;
}
