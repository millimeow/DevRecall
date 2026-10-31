import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  GitPullRequest,
  Github,
  Link,
  LoaderCircle,
  LockKeyhole,
  X,
} from 'lucide-react';
import { post } from './api';
import type { Repo } from './types';
interface Preview {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  archived: boolean;
}
export function AddRepository({
  initialUrl,
  onClose,
  onAdded,
}: {
  initialUrl: string;
  onClose: () => void;
  onAdded: (repo: Repo) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
    };
  }, []);
  async function verify() {
    setError('');
    setPreview(null);
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'github.com' ||
        !/^\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\/?$/.test(parsed.pathname) ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password ||
        parsed.port
      )
        throw new Error();
    } catch {
      setError('Enter a repository URL like https://github.com/owner/repo.');
      return;
    }
    setBusy(true);
    try {
      const result = await post<{ repository: Preview }>('/repositories/resolve', { url });
      if (mounted.current) setPreview(result.repository);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function analyze() {
    setBusy(true);
    setError('');
    try {
      const result = await post<{ repository: Repo }>('/repositories', { url });
      if (mounted.current) onAdded(result.repository);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      aria-labelledby="add-title"
      className="repo-dialog"
    >
      <div className="dialog-content">
        <button
          className="icon-button dialog-close"
          aria-label="Close Add Repository"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className="modal-mark">
          <Github size={27} />
          <span>
            <Link size={12} />
          </span>
        </div>
        <h2 id="add-title">Add a repository</h2>
        <p className="dialog-intro">Every codebase has a story. Let’s uncover yours.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (preview ? analyze() : verify());
          }}
        >
          <label htmlFor="repo-url">GitHub repository URL</label>
          <div className={`url-field ${error ? 'invalid' : ''}`}>
            <Github size={19} />
            <input
              autoFocus
              id="repo-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setPreview(null);
                setError('');
              }}
              disabled={busy}
            />
            {preview && <Check size={19} className="success-text" />}
          </div>
          <p className="input-hint">
            <LockKeyhole size={12} /> Public repositories only. Read-only access.
          </p>
          {error && (
            <div role="alert" className="error-box">
              <CircleAlert size={17} />
              <span>{error}</span>
            </div>
          )}
          {preview && (
            <div className="repo-preview">
              <div className="preview-top">
                <span className="verified">
                  <Check size={13} /> Verified repository
                </span>
                {preview.archived && <span className="status">Archived</span>}
              </div>
              <a href={preview.html_url} target="_blank" rel="noreferrer">
                {preview.full_name}
                <ExternalLink size={14} />
              </a>
              <p>{preview.description || 'No description provided by this repository.'}</p>
            </div>
          )}
          <div className="ingestion-note">
            <GitPullRequest size={20} />
            <div>
              <strong>A little context goes a long way</strong>
              <p>
                We’ll fetch all accessible pull requests and their comments, then extract decisions
                with your configured model. Large repositories take time.
              </p>
            </div>
          </div>
          <button
            className="button primary full-width"
            disabled={busy || !url.trim()}
            type="submit"
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} />
                {preview ? 'Adding repository…' : 'Verifying repository…'}
              </>
            ) : preview ? (
              <>
                Analyze Repository
                <ArrowRight size={17} />
              </>
            ) : (
              <>
                Verify Repository
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <p className="modal-footnote">Your source code stays on GitHub.</p>
      </div>
    </dialog>
  );
}
