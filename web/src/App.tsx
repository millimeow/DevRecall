import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  CircleAlert,
  Code2,
  FolderGit2,
  Github,
  Menu,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from './api';
import { AddRepository } from './AddRepository';
import { Dashboard } from './Dashboard';
import type { Demo, Health, Repo } from './types';
const statusNames: Record<string, string> = {
  not_analyzed: 'Not analyzed',
  queued: 'Queued',
  indexing: 'Indexing',
  analyzing: 'Analyzing',
  partial: 'Partial',
  ready: 'Ready',
  failed: 'Failed',
};
export const statusName = (status: string) => statusNames[status] ?? status;
export function App() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [demos, setDemos] = useState<Demo[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(
    () => localStorage.getItem('devrecall:repo') || 'pallets/flask',
  );
  const [modal, setModal] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 650px)').matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const previousDrawer = useRef(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 650px)');
    const change = () => {
      setMobile(media.matches);
      if (!media.matches) setDrawer(false);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (mobile && drawer)
      sidebarRef.current?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    else if (previousDrawer.current) menuRef.current?.focus();
    previousDrawer.current = drawer;
  }, [drawer, mobile]);
  const reload = useCallback(async () => {
    try {
      const [r, d, h] = await Promise.all([
        api<{ items: Repo[] }>('/repositories'),
        api<{ items: Demo[] }>('/demo-repositories'),
        api<Health>('/health'),
      ]);
      setRepos(r.items);
      setDemos(d.items);
      setHealth(h);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Unable to reach DevRecall. Start the API and try again.');
    }
  }, []);
  useEffect(() => {
    void reload();
    const interval = setInterval(() => {
      void reload();
    }, 3000);
    return () => clearInterval(interval);
  }, [reload]);
  function select(slug: string) {
    setSelected(slug);
    localStorage.setItem('devrecall:repo', slug);
    setDrawer(false);
  }
  const repo = repos.find((r) => r.full_name === selected);
  const demo = demos.find((d) => d.full_name === selected);
  const entries = [
    ...demos.map((d) => ({
      full_name: d.full_name,
      status: repos.find((r) => r.full_name === d.full_name)?.status ?? d.status,
    })),
    ...repos
      .filter((r) => !demos.some((d) => d.full_name === r.full_name))
      .map((r) => ({ full_name: r.full_name, status: r.status })),
  ];
  return (
    <div className="app-shell">
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Close repository drawer"
          tabIndex={-1}
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        inert={mobile && !drawer}
        aria-hidden={mobile && !drawer ? true : undefined}
        className={`sidebar ${drawer ? 'is-open' : ''}`}
        aria-label="Repository navigation"
        onKeyDown={(event) => {
          if (!mobile || !drawer) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            setDrawer(false);
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled)',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <a href="/" className="brand">
          <span className="brand-mark">
            <BrainCircuit size={24} />
          </span>
          DevRecall<span className="version-tag">v3</span>
        </a>
        <button
          className="icon-button mobile-close"
          aria-label="Close repositories"
          onClick={() => setDrawer(false)}
        >
          <X size={19} />
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">
            <Code2 size={17} />
          </span>
          <div>
            My workspace<small>Repository knowledge</small>
          </div>
        </div>
        <div className="sidebar-section-label">
          Repositories<span>{entries.length || '—'}</span>
        </div>
        <button
          className="add-repo-button"
          onClick={() => {
            setModal('');
            setDrawer(false);
          }}
        >
          <Plus size={17} />
          Add Repository
        </button>
        <nav className="repo-list" aria-label="Repositories">
          {entries.map((entry) => (
            <button
              key={entry.full_name}
              className={`repo-nav-item ${entry.full_name === selected ? 'active' : ''}`}
              onClick={() => select(entry.full_name)}
            >
              <Github size={17} />
              <span className="repo-nav-copy">
                <strong>{entry.full_name}</strong>
                <small>
                  <span className={`status-dot ${entry.status}`} />
                  {statusName(entry.status)}
                </small>
              </span>
              {entry.full_name === selected && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <BookOpen size={19} />
            <strong>The why behind your code.</strong>
            <p>
              Decisions fade.
              <br />
              Your repository’s memory shouldn’t.
            </p>
          </div>
          <div className="sidebar-footer">
            <span className={`status-dot ${health ? 'ready' : 'partial'}`} />
            {health ? 'Local workspace' : 'Connecting to server…'}
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={mobile && drawer}>
        <div className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-button"
              ref={menuRef}
              aria-label="Open repositories"
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <FolderGit2 size={17} />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{selected.split('/').pop()}</strong>
          </div>
          <a
            className="topbar-link"
            href={repo?.html_url ?? demo?.url ?? 'https://github.com'}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
            <ArrowUpRight size={15} />
          </a>
        </div>
        {error ? (
          <div className="server-error" role="alert">
            <CircleAlert size={25} />
            <h2>Can’t reach your workspace</h2>
            <p>{error}</p>
            <button className="button secondary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        ) : !demos.length && !repos.length ? (
          <div className="loading-layout" aria-label="Loading workspace">
            <div className="skeleton skeleton-heading" />
            <div className="skeleton skeleton-panel" />
          </div>
        ) : (
          <Dashboard
            key={repo?.id ?? selected}
            repo={repo}
            demo={demo}
            health={health}
            onAnalyze={() => setModal(repo?.html_url ?? demo?.url ?? '')}
            onRefresh={() => void reload()}
          />
        )}
      </div>
      {modal !== null && (
        <AddRepository
          initialUrl={modal}
          onClose={() => setModal(null)}
          onAdded={(added) => {
            select(added.full_name);
            setModal(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
