import React, { useEffect, useState } from 'react';
import { BookOpen, GitBranch, Github, RefreshCw, Search, MessageSquare, ArrowUpRight } from 'lucide-react';
import { api, post } from './api';

const date = value => value ? new Date(value).toLocaleString() : 'Not synchronized yet';
const safeUrl = value => /^https?:\/\//i.test(value || '') ? value : null;

function Evidence({ items = [], onSource }) {
  return items.length ? items.map((item, i) => <div className={`quote ${item.verified ? '' : 'unverified'}`} key={i}>
    <div className="quote-top"><span>{item.author || 'Unattributed message'}</span><span>{item.verified ? 'Exact quote verified' : 'Unverified quote'}</span></div>
    <blockquote>{item.quote}</blockquote>
    <button className="text-button" onClick={() => onSource(item.message_id)}>Read source message</button>
    {safeUrl(item.source_url) && <a className="original-link" href={item.source_url} target="_blank" rel="noreferrer">Original source <ArrowUpRight size={12}/></a>}
  </div>) : <p className="muted small">No supporting evidence supplied.</p>;
}

function Decision({ value, onSource }) {
  return <article className="v2-decision">
    <div className="detail-title"><h2>{value.title}</h2><span className={`status ${value.status}`}>{value.status}</span></div>
    {value.question && <p className="question-text">{value.question}</p>}
    <div className={`chosen ${value.status === 'accepted' && value.chosen_approach ? '' : 'uncertain-choice'}`}>
      <div><span>{value.status === 'accepted' && value.chosen_approach ? 'Chosen approach' : 'Outcome not established'}</span><h3>{value.chosen_approach || 'No verified choice established'}</h3></div>
    </div>
    {value.summary && <p className="summary">{value.summary}</p>}
    <h3 className="content-section-heading">Alternatives and reasons</h3>
    {value.alternatives?.length ? value.alternatives.map((a,i) => <section className="alternative" key={i}>
      <div className="alternative-heading"><h3>{a.name}</h3><span className={`status ${a.status}`}>{a.status}</span></div>
      <p>{a.reason || 'Reason not established by the evidence.'}</p><Evidence items={a.evidence} onSource={onSource}/>
    </section>) : <p className="muted">No alternatives recovered.</p>}
    <h3 className="content-section-heading">Decision evidence</h3><Evidence items={value.evidence} onSource={onSource}/>
    {!!value.uncertainties?.length && <div className="uncertainty"><div><h3>Uncertainties</h3><ul>{value.uncertainties.map((u,i)=><li key={i}>{u}</li>)}</ul></div></div>}
    {!!value.code_refs?.length && <div className="code-refs"><h3>Source-linked code</h3>{value.code_refs.map(p=><code key={p}>{p}</code>)}</div>}
    <p className="field-help">Quote verification confirms source presence, not consensus or correctness of the interpretation.</p>
  </article>;
}

export default function App() {
  const [tab,setTab] = useState('repository');
  const [health,setHealth] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [url,setUrl] = useState('');
  const [repo,setRepo] = useState(null);
  const [cached,setCached] = useState(false);
  const [job,setJob] = useState(null);
  const [decisions,setDecisions] = useState([]);
  const [selected,setSelected] = useState(null);
  const [query,setQuery] = useState('');
  const [question,setQuestion] = useState('');
  const [answer,setAnswer] = useState(null);
  const [paths,setPaths] = useState('');
  const [matches,setMatches] = useState(null);
  const [title,setTitle] = useState('');
  const [text,setText] = useState('');
  const [json,setJson] = useState(false);
  const [evaluation,setEvaluation] = useState(null);
  const [source,setSource] = useState(null);
  const [page,setPage] = useState(0);
  const [more,setMore] = useState(false);

  async function run(action) { setBusy(true); setError(''); try { await action(); } catch(e) { setError(e.message); } finally { setBusy(false); } }
  useEffect(() => { api('/health').then(setHealth).catch(e=>setError(e.message)); },[]);
  async function load(id, offset=0) {
    const [metadata,items] = await Promise.all([api(`/repositories/${id}`),api(`/repositories/${id}/decisions?offset=${offset}&limit=30`)]);
    setRepo(metadata); setJob(metadata.latest_job || null); setDecisions(items); setSelected(null); setPage(offset); setMore(items.length===30);
  }
  useEffect(() => {
    if (!job || !['queued','running'].includes(job.status)) return;
    let stopped = false;
    const id = setInterval(async () => {
      try {
        const next = await api(`/jobs/${job.job_id}`);
        if(stopped) return;
        setJob(next);
        if(!['queued','running'].includes(next.status)) await load(next.repo_id);
      } catch(e) { if(!stopped) { setError(e.message); setJob(null); } }
    },2000);
    return () => { stopped=true; clearInterval(id); };
  },[job?.job_id,job?.status]);
  async function open(event) {
    event.preventDefault();
    await run(async()=>{
      const result = await post('/repositories',{url});
      setCached(result.cached); setJob(result.job || null); setAnswer(null); setSource(null);
      await load(result.repo_id);
      if(result.analysis_state) setError('Model not configured. The repository is registered; configure a selected model adapter before syncing.');
    });
  }
  async function viewSource(id) {
    await run(async()=>{
      const transient = tab==='evaluation' && evaluation?.messages.find(m=>m.id===id);
      setSource(transient || await api(`/repositories/${repo.repo_id}/messages/${encodeURIComponent(id)}`));
    });
  }
  async function evaluate(event) {
    event.preventDefault();
    await run(async()=>{
      const payload = {title};
      if(json) { const parsed=JSON.parse(text); payload.messages=Array.isArray(parsed)?parsed:parsed.messages; }
      else payload.raw_text=text;
      setEvaluation(await post('/evaluations/analyze',payload)); setSource(null);
    });
  }
  const active = job && ['queued','running'].includes(job.status);
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/">DevRecall</a><p className="workspace-label">Every decision has a reason.</p>
      <nav aria-label="Workspace"><button className={`nav-item ${tab==='repository'?'active':''}`} onClick={()=>{setTab('repository');setSource(null);}}><GitBranch size={17}/> Repository</button>
      <button className={`nav-item ${tab==='evaluation'?'active':''}`} onClick={()=>{setTab('evaluation');setSource(null);}}><BookOpen size={17}/> Discussion evaluation</button></nav>
    </aside>
    <div className="main-shell"><header className="topbar"><span>Decision intelligence</span><span className="v2-health">{health?.model.available ? health.model.model : 'Model not configured'}</span></header>
    <main>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {health?.status==='degraded' && <p className="setup-nudge">Database setup needed. PostgreSQL: {health.postgresql}; MongoDB: {health.mongodb}. Check the README setup steps.</p>}
      {tab==='repository' ? <>
        <div className="page-heading"><div><h1>Repository decisions</h1><p>Open saved decisions, or index a public GitHub repository.</p></div></div>
        <form className="v2-repository-form" onSubmit={open}><label htmlFor="repo-url">Public GitHub repository URL</label><div className="v2-input-row"><input id="repo-url" type="url" required placeholder="https://github.com/owner/repository" value={url} onChange={e=>setUrl(e.target.value)}/><button className="primary" disabled={busy}><Github size={16}/> Open repository</button></div></form>
        {repo ? <>
          <section className="v2-repo-header"><div><h2>{repo.full_name}</h2><p>{cached?'Loaded from saved results. ':''}{repo.decision_count} indexed decisions · {repo.ingestion_status}</p><p>Last successful sync: {date(repo.last_synced_at)}</p></div>
          <button className="secondary" disabled={busy || active} onClick={()=>run(async()=>setJob(await post(`/repositories/${repo.repo_id}/sync`,{})))}><RefreshCw size={16}/> Sync Repository</button></section>
          {job && <div className="processing" role="status"><div><strong>Scan {job.status}</strong><p>{job.sources_scanned} sources scanned · {job.decisions_written} decisions saved</p>{job.error_summary && <p>{job.error_summary}</p>}{job.status==='queued' && <p>Waiting for the ingestion worker.</p>}</div></div>}
          <form className="search-form" onSubmit={e=>{e.preventDefault();run(async()=>{setDecisions(await api(`/repositories/${repo.repo_id}/search?q=${encodeURIComponent(query)}`));setSelected(null);setMore(false);});}}><Search size={17}/><input aria-label="Search saved decisions" placeholder="Search decisions and rejected alternatives" value={query} onChange={e=>setQuery(e.target.value)}/><button className="secondary" disabled={busy}>Search</button></form>
          {decisions.length ? <div className="v2-browser"><div className="v2-list">{decisions.map(d=><button className="decision-result" key={d._id} onClick={()=>{setSelected(d);setSource(null);}} aria-pressed={selected?._id===d._id}><div><h2>{d.title}</h2><span className={`status ${d.status}`}>{d.status}</span></div></button>)}<div className="v2-pagination"><button className="secondary" disabled={busy||page===0} onClick={()=>run(()=>load(repo.repo_id,Math.max(0,page-30)))}>Previous</button><button className="secondary" disabled={busy||!more} onClick={()=>run(()=>load(repo.repo_id,page+30))}>Next</button></div></div><div>{selected ? <Decision value={selected} onSource={viewSource}/> : <p className="empty-library">Select a decision to inspect its reasoning and sources.</p>}</div></div> : <div className="empty-library"><h2>No saved decisions to show</h2><p>{health?.model.available?'Run Sync Repository to analyze public discussions.':'Select and configure an AI provider to enable analysis. No decisions have been invented.'}</p></div>}
          <section className="ask-inline"><h2><MessageSquare size={18}/> Ask DevRecall</h2><p>Answers use verified evidence from this repository.</p><form className="ask-form" onSubmit={e=>{e.preventDefault();run(async()=>setAnswer(await post(`/repositories/${repo.repo_id}/ask`,{question})));}}><input aria-label="Question about this repository" required value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Why was an alternative rejected?"/><button className="primary" disabled={busy}>Ask</button></form>{answer && <div className="answer"><p>{answer.answer}</p><Evidence items={answer.citations} onSource={viewSource}/></div>}</section>
          <details className="source-messages"><summary>Find context for changed code</summary><form onSubmit={e=>{e.preventDefault();run(async()=>setMatches(await post('/pr-context',{repo_id:repo.repo_id,paths:paths.split('\n').map(p=>p.trim()).filter(Boolean)})));}}><label htmlFor="changed-paths">Changed file paths, one per line</label><textarea id="changed-paths" value={paths} onChange={e=>setPaths(e.target.value)} required rows={4}/><button className="secondary" disabled={busy}>Find historical context</button></form>{matches && <p>{matches.length} exact source-backed path matches.</p>}{matches?.map(m=><p key={m.decision._id}>{m.decision.title}: {m.matched_paths.join(', ')}</p>)}</details>
        </> : <div className="empty-library"><h2>Your repository’s reasoning, preserved</h2><p>Existing repositories load saved results. Refresh happens only when you choose Sync Repository.</p></div>}
      </> : <>
        <div className="page-heading"><div><h1>Discussion evaluation</h1><p>Recover rejected alternatives from a supplied discussion, without its final PEP.</p></div></div>
        <form className="v2-evaluation" onSubmit={evaluate}><label htmlFor="discussion-title">Discussion title</label><input id="discussion-title" required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)}/>
          <label className="v2-checkbox"><input type="checkbox" checked={json} onChange={e=>setJson(e.target.checked)}/> Import structured JSON messages</label>
          <label htmlFor="discussion-text">{json?'Messages with body, optional author and source_url':'Public discussion text'}</label><textarea id="discussion-text" required maxLength={200000} rows={12} value={text} onChange={e=>setText(e.target.value)}/>
          <p className="field-help">Results are transient. No repository is invented and no final PEP is fetched. Keep this page open to retain the result.</p><button className="primary" disabled={busy}>{busy?'Analyzing…':'Analyze discussion'}</button>
        </form>
        {evaluation && <section className="v2-evaluation-results"><h2>Evaluation result</h2>{evaluation.decisions.length ? evaluation.decisions.map((d,i)=><Decision key={i} value={d} onSource={viewSource}/>) : <p>No decisions recovered from the supplied discussion.</p>}</section>}
      </>}
      {source && <section className="source-messages" aria-live="polite"><h2>Original source message</h2><p>{source.author || 'Unattributed message'}</p><pre className="v2-source-body">{source.body}</pre>{safeUrl(source.source_url) && <a href={source.source_url} target="_blank" rel="noreferrer">Open original source</a>}</section>}
    </main><footer className="app-footer">Public sources. Inspectable evidence. Manual synchronization.</footer></div>
  </div>;
}
