import { createHash, randomUUID } from 'node:crypto';
import type { DB } from './db.js';
import { AppError } from './errors.js';
import type { Citation, EvidenceInput, Source } from './types.js';
import { decisionSchema, type DecisionInput } from './ai.js';

export function validateEvidence(
  db: DB,
  repoId: number,
  inputs: EvidenceInput[],
  allowed?: Map<string, string>,
  prNumber?: number,
): Citation[] {
  if (!inputs.length)
    throw new AppError('INVALID_EVIDENCE', 'A factual claim needs at least one source.', 502);
  return inputs.map((input) => {
    const source = db
      .prepare('SELECT * FROM pr_sources WHERE id=? AND repo_id=?')
      .get(input.source_id, repoId) as Source | undefined;
    if (
      !source ||
      !input.excerpt.trim() ||
      !source.body.includes(input.excerpt) ||
      (prNumber !== undefined && source.pr_number !== prNumber) ||
      (allowed && !allowed.get(input.source_id)?.includes(input.excerpt))
    )
      throw new AppError(
        'INVALID_EVIDENCE',
        'The model cited missing, unrelated or non-verbatim evidence. No answer or decisions were saved.',
        502,
      );
    const url = new URL(source.html_url);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.username ||
      url.password ||
      !new RegExp(`/pull/${source.pr_number}$`).test(url.pathname)
    )
      throw new AppError('INVALID_EVIDENCE', 'Stored evidence has an invalid GitHub link.', 502);
    return {
      source_id: source.id,
      excerpt: input.excerpt,
      html_url: source.html_url,
      pr_number: source.pr_number,
      author_login: source.author_login,
      kind: source.kind,
      created_at: source.created_at,
    };
  });
}
export function saveDecisions(
  db: DB,
  repoId: number,
  pr: number,
  decisions: DecisionInput[],
  model: string,
) {
  // Validate every result before replacing any existing valid analysis.
  const parsed = decisions.map((x) => decisionSchema.parse(x));
  for (const decision of parsed) validateEvidence(db, repoId, decision.evidence, undefined, pr);
  db.transaction(() => {
    const old = db
      .prepare('SELECT id,stable_key FROM decisions WHERE repo_id=? AND pr_number=?')
      .all(repoId, pr) as { id: string; stable_key: string }[];
    const ids = new Map(old.map((x) => [x.stable_key, x.id]));
    db.prepare('DELETE FROM decisions WHERE repo_id=? AND pr_number=?').run(repoId, pr);
    const seen = new Set<string>();
    for (const d of parsed) {
      const key = createHash('sha256')
        .update(`${d.title.toLowerCase().trim()}|${d.outcome}|${d.category}`)
        .digest('hex');
      if (seen.has(key)) continue;
      seen.add(key);
      const id = ids.get(key) ?? randomUUID();
      db.prepare(
        'INSERT INTO decisions(id,repo_id,pr_number,stable_key,title,summary,reasoning,outcome,category,confidence,model_name,extraction_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        repoId,
        pr,
        key,
        d.title,
        d.summary,
        d.reasoning,
        d.outcome,
        d.category,
        d.confidence,
        model,
        'v1',
      );
      for (const alt of d.alternatives)
        db.prepare(
          'INSERT INTO decision_alternatives(id,decision_id,label,outcome,reason) VALUES(?,?,?,?,?)',
        ).run(randomUUID(), id, alt.label, alt.outcome, alt.reason);
      for (const e of d.evidence)
        db.prepare(
          'INSERT OR IGNORE INTO decision_evidence(id,decision_id,source_id,evidence_role,excerpt) VALUES(?,?,?,?,?)',
        ).run(randomUUID(), id, e.source_id, e.role, e.excerpt);
    }
  })();
}
export function searchSources(db: DB, repoId: number, question: string, limit = 20): Source[] {
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [])]
    .filter(
      (s) =>
        !new Set([
          'why',
          'what',
          'when',
          'where',
          'which',
          'the',
          'was',
          'were',
          'does',
          'did',
          'how',
          'this',
          'that',
          'for',
          'and',
          'from',
          'with',
          'about',
        ]).has(s),
    )
    .slice(0, 30);
  if (!terms.length) return [];
  const query = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
  const direct = db
    .prepare(
      'SELECT s.* FROM source_fts f JOIN pr_sources s ON s.id=f.source_id WHERE source_fts MATCH ? AND s.repo_id=? ORDER BY bm25(source_fts) LIMIT ?',
    )
    .all(query, repoId, limit) as Source[];
  const decisionSources = db
    .prepare(
      "SELECT s.* FROM decision_fts f JOIN decisions d ON d.id=f.decision_id JOIN pull_requests p ON p.repo_id=d.repo_id AND p.number=d.pr_number JOIN decision_evidence e ON e.decision_id=d.id JOIN pr_sources s ON s.id=e.source_id WHERE decision_fts MATCH ? AND d.repo_id=? AND s.repo_id=? AND p.analysis_status='done' AND p.content_hash=p.last_analyzed_hash ORDER BY bm25(decision_fts) LIMIT ?",
    )
    .all(query, repoId, repoId, limit) as Source[];
  return [...new Map([...direct, ...decisionSources].map((s) => [s.id, s])).values()]
    .slice(0, limit)
    .map((s) => ({ ...s, body: relevantWindow(s.body, terms) }));
}
function relevantWindow(body: string, terms: string[], budget = 2200): string {
  if (body.length <= budget) return body;
  const lower = body.toLowerCase();
  let bestStart = 0;
  let bestScore = -1;
  // Center context on matches, rather than dropping a hit at the tail of a long comment.
  for (const term of terms) {
    let at = lower.indexOf(term);
    for (let n = 0; at >= 0 && n < 50; n++, at = lower.indexOf(term, at + term.length)) {
      const start = Math.max(0, Math.min(body.length - budget, at - 600));
      const window = lower.slice(start, start + budget);
      const score = terms.reduce((sum, t) => sum + (window.includes(t) ? 1 : 0), 0);
      if (score > bestScore) {
        bestStart = start;
        bestScore = score;
      }
    }
  }
  return body.slice(bestStart, bestStart + budget);
}
export function listDecisions(
  db: DB,
  repoId: number,
  query = '',
  rejectedOnly = false,
  offset = 0,
) {
  const rows = db
    .prepare(
      `SELECT d.* FROM decisions d JOIN pull_requests p ON p.repo_id=d.repo_id AND p.number=d.pr_number WHERE d.repo_id=? AND p.analysis_status='done' AND p.content_hash=p.last_analyzed_hash AND (?='' OR d.title LIKE ? ESCAPE '\\' OR d.summary LIKE ? ESCAPE '\\') ${rejectedOnly ? "AND d.outcome IN ('rejected','removed')" : ''} ORDER BY d.updated_at DESC,d.rowid DESC LIMIT 50 OFFSET ?`,
    )
    .all(
      repoId,
      query,
      `%${query.replace(/[\\%_]/g, '\\$&')}%`,
      `%${query.replace(/[\\%_]/g, '\\$&')}%`,
      offset,
    ) as ({ id: string } & Record<string, unknown>)[];
  return rows.map((d) => ({
    ...d,
    evidence: db
      .prepare(
        'SELECT e.excerpt,e.evidence_role,s.id source_id,s.html_url,s.pr_number,s.author_login,s.kind,s.created_at FROM decision_evidence e JOIN pr_sources s ON s.id=e.source_id WHERE e.decision_id=? AND s.repo_id=?',
      )
      .all(d.id, repoId),
    alternatives: db
      .prepare('SELECT label,outcome,reason FROM decision_alternatives WHERE decision_id=?')
      .all(d.id),
  }));
}
