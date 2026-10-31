import { ArrowUpRight, GitPullRequest, MessageSquareQuote } from 'lucide-react';
import type { Citation } from './types';
export function Evidence({ citations }: { citations: Citation[] }) {
  const unique = [...new Map(citations.map((c) => [`${c.source_id}:${c.excerpt}`, c])).values()];
  return (
    <div className="evidence-list">
      {unique.map((c, i) => (
        <a
          className="evidence-card"
          href={c.html_url}
          key={`${c.source_id}-${i}`}
          target="_blank"
          rel="noreferrer"
        >
          <div className="evidence-heading">
            <span>
              <GitPullRequest size={14} />
              PR #{c.pr_number}
              <span className="evidence-kind">
                {c.kind === 'pr_body' ? 'Pull request' : 'Discussion'}
              </span>
            </span>
            <ArrowUpRight size={15} />
          </div>
          <blockquote>
            <MessageSquareQuote size={14} />
            <span>{c.excerpt}</span>
          </blockquote>
          <div className="evidence-meta">
            {c.author_login ? `@${c.author_login}` : 'GitHub contributor'}
            {c.created_at && (
              <span>
                {new Date(c.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
