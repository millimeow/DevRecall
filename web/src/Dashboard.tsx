import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { api, post } from './api';
import { statusName } from './App';
import { Evidence } from './Evidence';
import type { Decision, Demo, Detail, Health, Message, Repo } from './types';
const questions = [
  'What design tradeoffs shaped this repository?',
  'Which features were rejected, and why?',
  'Why was this approach chosen?',
];
export function Dashboard({
  repo,
  demo,
  health,
  onAnalyze,
  onRefresh,
}: {
  repo?: Repo;
  demo?: Demo;
  health: Health | null;
  onAnalyze: () => void;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState('ask');
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (!repo) return;
    const abort = new AbortController();
    const load = async () => {
      try {
        const data = await api<Detail>(`/repositories/${repo.id}`, { signal: abort.signal });
        setDetail(data);
        setError('');
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [repo?.id]);
  async function sync(mode = 'sync') {
    if (!repo) return;
    setSyncing(true);
    setError('');
    try {
      await post(`/repositories/${repo.id}/sync`, { mode });
      onRefresh();
      const next = await api<Detail>(`/repositories/${repo.id}`);
      setDetail(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  const current = detail?.repository ?? repo;
  const status = current?.status ?? 'not_analyzed';
  const active = ['queued', 'indexing', 'analyzing'].includes(status);
  const summary = detail?.summary;
  const metrics = [
    {
      title: 'Technical Decisions',
      value: summary?.decisions,
      icon: Lightbulb,
      color: 'violet',
      description: 'Backed by PR evidence',
    },
    {
      title: 'Features Rejected / Removed',
      value: summary?.rejected_removed,
      icon: XCircle,
      color: 'rose',
      description: 'Explicitly evidenced outcomes',
    },
    {
      title: 'PRs Analyzed',
      value: summary?.prs_analyzed,
      icon: GitPullRequest,
      color: 'blue',
      description: summary
        ? `${summary.prs_scanned.toLocaleString()} PRs fetched`
        : 'All accessible pull requests',
    },
    {
      title: 'Comments Analyzed',
      value: summary?.comments_analyzed,
      icon: MessageSquare,
      color: 'amber',
      description: summary
        ? `${summary.comments_scanned.toLocaleString()} comments fetched`
        : 'Discussions, reviews & comments',
    },
  ];
  return (
    <main className="dashboard">
      <header className="repo-header">
        <div>
          <div className="repo-title">
            <h1>{current?.full_name ?? demo?.full_name ?? 'Your repositories'}</h1>
            <a
              aria-label="Open repository on GitHub"
              className="repo-external"
              href={current?.html_url ?? demo?.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={18} />
            </a>
          </div>
          <p>
            {current?.description ?? demo?.description ?? 'Recover the context behind your code.'}
          </p>
          <div className="repo-meta">
            <span className={`status status-${status}`}>
              <span className={`status-dot ${status}`} />
              {statusName(status)}
            </span>
            {current?.default_branch && (
              <span>
                <GitBranch size={13} />
                {current.default_branch}
              </span>
            )}
            <span>
              {current?.last_indexed_at
                ? `Last analyzed ${new Date(current.last_indexed_at + 'Z').toLocaleString()}`
                : 'No analysis yet'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          {repo ? (
            <>
              <button
                className="button secondary"
                disabled={syncing || active}
                onClick={() => void sync()}
              >
                {syncing || active ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                {status === 'partial' ? 'Resume analysis' : 'Sync repository'}
              </button>
              <button
                className="icon-button"
                title="Re-analyze all saved decisions"
                aria-label="Re-analyze all decisions"
                disabled={syncing || active}
                onClick={() => void sync('reanalyze')}
              >
                <BrainCircuit size={18} />
              </button>
            </>
          ) : (
            <button className="button primary" onClick={onAnalyze}>
              <Sparkles size={16} />
              Analyze Repository
            </button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="error-box">
          <CircleAlert size={17} />
          {error}
        </div>
      )}
      <section className="metrics" aria-label="Repository metrics">
        {metrics.map((m) => (
          <div className="metric" key={m.title}>
            <div className="metric-top">
              <span>{m.title}</span>
              <span className={`metric-icon ${m.color}`}>
                <m.icon size={17} />
              </span>
            </div>
            <strong>{m.value === undefined ? '—' : m.value.toLocaleString()}</strong>
            <small>{m.description}</small>
          </div>
        ))}
      </section>
      {(active || status === 'partial') && detail?.job && (
        <div
          className={`progress-panel ${status === 'partial' ? 'partial-panel' : ''}`}
          role="status"
        >
          <div className="progress-heading">
            {active ? <LoaderCircle size={18} className="spin" /> : <CircleAlert size={18} />}
            <strong>
              {status === 'queued'
                ? 'Your repository is in the queue'
                : status === 'indexing'
                  ? 'Reading pull request conversations'
                  : status === 'analyzing'
                    ? 'Recovering repository decisions'
                    : 'Analysis is incomplete'}
            </strong>
            <span>
              {detail.job.prs_fetched} /{' '}
              {current?.total_prs_known ?? `${detail.job.prs_discovered}+`} PRs fetched
            </span>
          </div>
          <p>
            {detail.job.error_message ??
              'Progress is saved automatically. You can leave this page and come back.'}
          </p>
          {detail.job.retry_after && (
            <p>Retry scheduled for {new Date(detail.job.retry_after).toLocaleTimeString()}.</p>
          )}
          {active && (
            <div className="progress-track">
              {current?.total_prs_known ? (
                <div
                  style={{
                    width: `${Math.min(100, (100 * detail.job.prs_fetched) / current.total_prs_known)}%`,
                  }}
                />
              ) : (
                <div className="indeterminate" />
              )}
            </div>
          )}
        </div>
      )}
      <div className="content-tabs" role="tablist" aria-label="Repository views">
        {[
          { id: 'ask', title: 'Ask DevRecall', icon: MessageCircle },
          { id: 'decisions', title: 'Decisions', icon: Lightbulb },
          { id: 'rejected', title: 'Rejected / Removed', icon: XCircle },
        ].map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="repo-tabpanel"
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            {t.title}
            {t.id === 'decisions' && summary && (
              <span className="tab-count">{summary.decisions}</span>
            )}
          </button>
        ))}
      </div>
      <section
        id="repo-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="tab-panel"
      >
        {tab === 'ask' ? (
          <Chat
            repo={repo}
            health={health}
            notAnalyzed={!repo}
            active={active}
            onAnalyze={onAnalyze}
            onSettings={() => setSettings(!settings)}
          />
        ) : (
          <Decisions repo={repo} rejected={tab === 'rejected'} refreshKey={summary?.decisions} />
        )}
      </section>
      {settings && (
        <div className="configuration-panel">
          <h3>Connect your model</h3>
          <p>
            Choose an open-weight model, run it locally with Ollama or a self-hosted compatible
            server, then set these values in the project’s <code>.env</code> and restart DevRecall.
          </p>
          <pre>
            AI_PROVIDER=ollama{'\n'}AI_MODEL=&lt;your-installed-model&gt;{'\n'}
            AI_BASE_URL=http://127.0.0.1:11434
          </pre>
          <p>
            For vLLM or llama.cpp, use <code>AI_PROVIDER=openai-compatible</code> and a base URL
            ending in <code>/v1</code>. No model is selected automatically.
          </p>
          <button className="text-button" onClick={() => setSettings(false)}>
            Close instructions
            <ChevronDown size={14} />
          </button>
        </div>
      )}
      <footer className="dashboard-footer">
        <span>
          <ShieldCheck size={13} />
          Grounded in pull requests. Linked to the source.
        </span>
        <span>DevRecall · Repository memory</span>
      </footer>
    </main>
  );
}
function Chat({
  repo,
  health,
  notAnalyzed,
  active,
  onAnalyze,
  onSettings,
}: {
  repo?: Repo;
  health: Health | null;
  notAnalyzed: boolean;
  active: boolean;
  onAnalyze: () => void;
  onSettings: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!repo) return;
    const abort = new AbortController();
    void api<{ items: Message[]; session_id: string | null }>(`/repositories/${repo.id}/chat`, {
      signal: abort.signal,
    })
      .then((r) => {
        setMessages(r.items);
        setSession(r.session_id);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [repo?.id]);
  async function send() {
    if (!repo || !question.trim() || busy) return;
    setBusy(true);
    setError('');
    const q = question.trim();
    try {
      const answer = await post<{
        session_id: string;
        content: string;
        citations: Message['citations'];
      }>(`/repositories/${repo.id}/chat`, {
        question: q,
        ...(session ? { session_id: session } : {}),
      });
      setSession(answer.session_id);
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: q, citations: [] },
        { role: 'assistant', content: answer.content, citations: answer.citations },
      ]);
      setQuestion('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const aiReady = health?.ai.configured;
  return (
    <div className="chat-layout">
      <div className="chat-conversation" aria-live="polite">
        {messages.length ? (
          messages.map((m, i) => (
            <article key={m.id ?? i} className={`chat-message ${m.role}`}>
              <span
                className={`message-avatar ${m.role === 'assistant' ? 'assistant-avatar' : ''}`}
              >
                {m.role === 'assistant' ? <BrainCircuit size={19} /> : <CodeUser />}
              </span>
              <div>
                <strong className="message-author">
                  {m.role === 'assistant' ? 'DevRecall' : 'You'}
                  {m.role === 'assistant' && <span>Repository evidence</span>}
                </strong>
                <p>{m.content}</p>
                {m.citations.length > 0 && <Evidence citations={m.citations} />}
              </div>
            </article>
          ))
        ) : (
          <div className="chat-empty">
            <div className="empty-brand">
              <BrainCircuit size={33} />
              <span>
                <Sparkles size={13} />
              </span>
            </div>
            <h2>
              Your code has a history.
              <br />
              Understand the thinking behind it.
            </h2>
            <p>
              Explore the decisions, tradeoffs, and conversations
              <br className="desktop-break" /> that shaped {repo?.full_name ?? 'this repository'}.
            </p>
            {notAnalyzed ? (
              <button className="button secondary start-button" onClick={onAnalyze}>
                Start with a repository analysis
                <ArrowRight size={16} />
              </button>
            ) : (
              <div className="suggested-questions">
                {questions.map((q, i) => (
                  <button key={q} onClick={() => setQuestion(q)}>
                    <span>
                      {i === 0 ? (
                        <Lightbulb size={15} />
                      ) : i === 1 ? (
                        <XCircle size={15} />
                      ) : (
                        <GitPullRequest size={15} />
                      )}
                      {q}
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            )}
            <div className="empty-evidence">
              <Check size={13} />
              Every answer comes with its sources.
            </div>
          </div>
        )}
        {busy && (
          <div role="status" className="thinking">
            <LoaderCircle className="spin" size={16} />
            Reading the indexed evidence…
          </div>
        )}
      </div>
      <div className="chat-compose">
        {!aiReady && (
          <div className="model-notice">
            <span>
              <CircleAlert size={15} />
              Connect a model to unlock decisions and answers.
            </span>
            <button onClick={onSettings}>
              Set up AI
              <ArrowRight size={13} />
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="error-box">
            <CircleAlert size={16} />
            {error}
          </div>
        )}
        <form
          className="question-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            rows={1}
            aria-label="Ask about this repository"
            placeholder={
              notAnalyzed
                ? 'Analyze this repository to start asking questions…'
                : `Ask anything about ${repo?.full_name}…`
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!repo || busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            aria-label="Send question"
            className="send-button"
            disabled={!repo || !aiReady || !question.trim() || busy}
            type="submit"
          >
            {busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
        <div className="composer-hint">
          <span>
            <GitBranch size={12} />
            {repo ? `Scoped to ${repo.full_name}` : 'Select a public GitHub repository'}
          </span>
          <span>
            {active
              ? 'Answers use evidence indexed so far'
              : 'Answers are only as complete as the indexed evidence'}
          </span>
        </div>
      </div>
    </div>
  );
}
function CodeUser() {
  return <span className="user-initial">Y</span>;
}
function Decisions({
  repo,
  rejected,
  refreshKey,
}: {
  repo?: Repo;
  rejected: boolean;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<Decision[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState<number | null>(null);
  useEffect(() => {
    if (!repo) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void api<{ items: Decision[]; next_offset: number | null }>(
        `/repositories/${repo.id}/decisions?q=${encodeURIComponent(query)}&rejected=${rejected}`,
        { signal: abort.signal },
      )
        .then((r) => {
          setItems(r.items);
          setOffset(r.next_offset);
          setError('');
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [repo?.id, rejected, query, refreshKey]);
  async function more() {
    if (!repo || offset === null) return;
    setLoading(true);
    try {
      const r = await api<{ items: Decision[]; next_offset: number | null }>(
        `/repositories/${repo.id}/decisions?q=${encodeURIComponent(query)}&rejected=${rejected}&offset=${offset}`,
      );
      setItems((prev) => [...prev, ...r.items]);
      setOffset(r.next_offset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="decisions-view">
      <div className="decisions-toolbar">
        <h2>{rejected ? 'Rejected & removed' : 'Repository decisions'}</h2>
        <label className="decision-search">
          <Search size={16} />
          <input
            aria-label="Search decisions"
            placeholder="Search decisions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {loading && !items.length ? (
        <div className="loading-layout">
          <div className="skeleton skeleton-panel" />
        </div>
      ) : !items.length ? (
        <div className="decisions-empty">
          <Lightbulb size={30} />
          <h3>{query ? 'No matching decisions' : 'No decisions yet'}</h3>
          <p>
            {query
              ? 'Try a different term.'
              : 'Evidence-backed decisions will appear here after analysis.'}
          </p>
        </div>
      ) : (
        items.map((d) => (
          <article className="decision-row" key={d.id}>
            <div className="decision-row-meta">
              <span className={`outcome outcome-${d.outcome}`}>{d.outcome}</span>
              <span>{d.category}</span>
              <span>PR #{d.pr_number}</span>
            </div>
            <h3>{d.title}</h3>
            <p>{d.summary}</p>
            {d.reasoning && (
              <p className="decision-reason">
                <strong>Why:</strong> {d.reasoning}
              </p>
            )}
            {d.alternatives.length > 0 && (
              <details>
                <summary>Alternatives considered ({d.alternatives.length})</summary>
                {d.alternatives.map((a, i) => (
                  <p key={i}>
                    <strong>{a.label}</strong> · {a.outcome}
                    <br />
                    {a.reason}
                  </p>
                ))}
              </details>
            )}
            <Evidence citations={d.evidence} />
          </article>
        ))
      )}
      {offset !== null && (
        <button className="button secondary" disabled={loading} onClick={() => void more()}>
          {loading ? 'Loading…' : 'Load more decisions'}
        </button>
      )}
    </div>
  );
}
