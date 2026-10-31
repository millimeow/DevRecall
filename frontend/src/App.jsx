'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Code2, FileText, GitBranch, Github, Layers3, Link2, LoaderCircle, MessageSquare, Plus, Quote, Search, Settings2, ShieldCheck, Sparkles, Terminal, X } from 'lucide-react';
import { api, post } from './api';

const Status = ({ value }) => <span className={`status ${value || 'uncertain'}`}><span />{value || 'uncertain'}</span>;
const Spinner = () => <LoaderCircle size={16} className="spin" />;
const shortDate = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const uniqueEvidence = evidence => [...new Map(evidence.map(e => [`${e.message_id}:${e.quote}`, e])).values()];

function Evidence({ evidence = [], onSource }) {
  return evidence.length ? <div className="evidence-list">{uniqueEvidence(evidence).map((e, i) => <div className={`quote ${e.verified ? '' : 'unverified'}`} key={`${e.message_id}-${i}`}>
    <div className="quote-top"><span><Quote size={13} /> {e.author || 'Unattributed message'}</span><span>{e.verified ? <><CheckCheck size={13} /> Exact quote verified</> : 'Unverified quote'}</span></div>
    <blockquote>{e.quote}</blockquote><button className="text-button source-link" onClick={() => onSource(e.message_id)}>{e.message_id.split(':').at(-1)} <ArrowUpRight size={12} /></button>
    {e.source_url && <a className="original-link" href={e.source_url} target="_blank" rel="noreferrer">Original source <ArrowUpRight size={12}/></a>}
  </div>)}</div> : <p className="muted small">No supporting evidence supplied.</p>;
}

export default function App() {
  const [view, setView] = useState('overview');
  const [health, setHealth] = useState(null);
  const [discussions, setDiscussions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [discussion, setDiscussion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState('paste');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [github, setGithub] = useState('');
  const [query, setQuery] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [messageId, setMessageId] = useState(null);
  const [contextPaths, setContextPaths] = useState('');
  const [context, setContext] = useState(null);
  const inputRef = useRef(null);

  async function refresh() {
    const results = await Promise.allSettled([api('/health'), api('/discussions'), api('/search')]);
    if (results[0].status === 'fulfilled') setHealth(results[0].value);
    if (results[1].status === 'fulfilled') setDiscussions(results[1].value);
    if (results[2].status === 'fulfilled') setDecisions(results[2].value);
    if (results.some(r => r.status === 'rejected')) setError('Cannot reach the backend. Start the Express server on port 8000.');
  }
  useEffect(() => { refresh(); const id = setInterval(() => api('/health').then(setHealth).catch(() => setHealth(null)), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [view, discussion?.id]);
  useEffect(() => { if (messageId) document.getElementById('source-message')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messageId]);

  function navigate(next) { setView(next); setError(''); setMessageId(null); }
  async function run(name, action) { setBusy(name); setError(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  function openImport() { navigate('import'); setDiscussion(null); setSelected(null); setTimeout(() => inputRef.current?.focus(), 50); }
  async function openDiscussion(id) {
    await run('open', async () => { const [d, ds] = await Promise.all([api(`/discussions/${id}`), api(`/discussions/${id}/decisions`)]); setDiscussion(d); setSelected(ds[0] || null); setAnswer(null); setView('discussion'); });
  }
  async function analyze(id) {
    await run('analyze', async () => {
      try {
        const result = await post(`/discussions/${id}/analyze`, {});
        setSelected(result.decisions[0] || null); setView('discussion');
      } finally {
        setDiscussion(await api(`/discussions/${id}`)); await refresh();
      }
    });
  }
  async function importDiscussion(event) {
    event.preventDefault();
    await run('import', async () => {
      let data;
      if (mode === 'github') data = await post('/github/import', { url: github });
      else {
        const payload = { title, source_url: source || null };
        if (mode === 'json') { let parsed; try { parsed = JSON.parse(text); } catch { throw new Error('Invalid JSON. Use an array of messages with a body field.'); } payload.messages = Array.isArray(parsed) ? parsed : parsed.messages; if (!Array.isArray(payload.messages)) throw new Error('JSON must contain a messages array.'); }
        else payload.raw_text = text;
        data = await post('/discussions', payload);
      }
      setDiscussion(data); setSelected(null); setAnswer(null); setView('discussion'); await refresh();
      setBusy('analyze');
      try {
        const result = await post(`/discussions/${data.id}/analyze`, {});
        setSelected(result.decisions[0] || null);
      } finally {
        setDiscussion(await api(`/discussions/${data.id}`)); await refresh();
      }
    });
  }
  async function search(event) { event.preventDefault(); await run('search', async () => { setSearchResults(await api(`/search?q=${encodeURIComponent(query)}`)); setView('decisions'); setSelected(null); }); }
  async function openDecision(d) { await run('open', async () => { setDiscussion(await api(`/discussions/${d.discussion_id}`)); setSelected(d); setView('discussion'); setAnswer(null); }); }
  async function resolveSource(id) {
    await run('open', async () => {
      try {
        if (!id.includes(':')) throw new Error('Invalid source identifier.');
        const discussionId = id.split(':')[0];
        const [sourceDiscussion, sourceDecisions] = await Promise.all([api(`/discussions/${encodeURIComponent(discussionId)}`), api(`/discussions/${encodeURIComponent(discussionId)}/decisions`)]);
        if (!sourceDiscussion.messages.some(m => m.id === id)) throw new Error('The original message is missing.');
        setDiscussion(sourceDiscussion); setSelected(sourceDecisions.find(d => JSON.stringify(d).includes(id)) || sourceDecisions[0] || null);
        setAnswer(null); setView('discussion'); setMessageId(id);
      } catch (e) { throw new Error(`Cannot open this citation. Reimport the source discussion or retry. ${e.message}`); }
    });
  }
  async function ask(event) { event.preventDefault(); await run('ask', async () => setAnswer(await post('/ask', { question, discussion_id: discussion?.id || null }))); }
  async function exportFile(format) { await run('export', async () => { const response = await fetch(`/api/discussions/${discussion.id}/export?format=${format}`); if (!response.ok) throw new Error('Export failed. Retry.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `devrecall-${discussion.id}.${format === 'json' ? 'json' : 'md'}`; a.click(); URL.revokeObjectURL(url); }); }
  const totalEvidence = new Set(decisions.flatMap(d => [...d.evidence, ...d.alternatives.flatMap(a => a.evidence), ...d.rationales.flatMap(r => r.evidence)]).filter(e => e.verified).map(e => `${e.message_id}:${e.quote}`)).size;
  const discussionDecisions = decisions.filter(d => d.discussion_id === discussion?.id);
  const ready = health?.model?.available;
  const libraryDecisions = searchResults ?? decisions;
  const hasSupportedChoice = selected?.status === 'accepted' && selected.chosen_approach && selected.evidence.some(e => e.verified && e.claim_type === 'chosen_approach');

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('overview')} aria-label="DevRecall home"><span className="brand-mark"><Layers3 size={22}/></span>DevRecall<span className="version">beta</span></button>
      <div className="workspace-label"><span className="workspace-avatar">D</span><div>Local workspace<small>Decision intelligence</small></div><ChevronDown size={14}/></div>
      <button className="sidebar-new" onClick={openImport}><Plus size={16}/> Analyze discussion <span>↵</span></button>
      <nav aria-label="Main navigation">
        {[['overview', BookOpen, 'Overview'], ['decisions', GitBranch, 'Decision library'], ['ask', MessageSquare, 'Ask DevRecall'], ['context', Code2, 'Code context']].map(([id, Icon, label]) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => { navigate(id); if (id === 'decisions') { setQuery(''); setSearchResults(null); api('/search').then(setDecisions).catch(e => setError(e.message)); } if (id === 'ask') {setDiscussion(null); setAnswer(null);} }}><Icon size={17}/>{label}{id === 'decisions' && <span className="nav-count">{decisions.length}</span>}</button>)}
      </nav>
      <div className="sidebar-section-title">DISCUSSIONS <span>{discussions.length}</span></div>
      <div className="sidebar-discussions">{discussions.length ? discussions.slice(0, 8).map(d => <button key={d.id} onClick={() => openDiscussion(d.id)} className={`discussion-nav ${discussion?.id === d.id && view === 'discussion' ? 'selected' : ''}`}><MessageSquare size={14}/><span>{d.title}</span></button>) : <p>Your imported discussions<br/>will appear here.</p>}</div>
      <div className="sidebar-bottom"><div className={`model-state ${ready ? 'ready' : ''}`}><span className="model-dot"/><span>{ready ? 'Local model connected' : health ? 'Local model unavailable' : 'Connecting to backend'}<small>{health?.model?.name || 'Ollama · local inference'}</small></span><button aria-label="Model settings" onClick={() => navigate('settings')}><Settings2 size={15}/></button></div><div className="privacy-note"><ShieldCheck size={13}/> Your discussions stay on this device</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13}/><strong>{{overview:'Overview',import:'New discussion',discussion:'Discussion',decisions:'Decision library',ask:'Ask DevRecall',context:'Code context',settings:'Model setup'}[view]}</strong></div><div className="topbar-right"><button className="mobile-model-status" onClick={()=>navigate('settings')} aria-label={`${ready?'Model ready':'Model unavailable'}. Open model setup`}><span className={`model-dot ${ready?'mint':''}`}/>{ready?'Model ready':health?'Model offline':'Connecting'}</button><span className="local-badge"><span/> Local-first</span><a href="https://github.com" target="_blank" rel="noreferrer" aria-label="Open GitHub"><Github size={18}/></a></div></header>
      <main>
        {error && <div className="error-banner" role="alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {(view === 'overview' || view === 'import') && <>
          <div className="page-heading"><div><h1>{view === 'import' ? 'Analyze a discussion' : 'A little context. A lot of clarity.'}</h1><p>Every decision has a reason. Never lose it.</p></div><span className="outline-label"><GitBranch size={13}/> Decision intelligence</span></div>
          {view === 'overview' && <div className="overview-stats"><div><span>Discussions imported</span><strong>{String(discussions.length).padStart(2,'0')}</strong></div><div><span>Decisions recovered</span><strong>{String(decisions.length).padStart(2,'0')}</strong></div><div><span>Verified source quotes</span><strong>{String(totalEvidence).padStart(2,'0')}<ShieldCheck size={17}/></strong></div><div className="stats-note"><GitBranch size={26}/><p>Recover the <b>why</b>.<br/>Keep the evidence.</p></div></div>}
          <section className="import-panel"><div className="panel-intro"><div className="section-icon"><MessageSquare size={20}/></div><div><h2>From discussion to decision</h2><p>Bring the conversation. Recover the choices, tradeoffs, and reasons.</p></div><span className="private-tag"><ShieldCheck size={13}/> Processed locally</span></div>
            <div className="import-tabs" role="tablist" aria-label="Import method">{[['paste',FileText,'Paste discussion'],['github',Github,'GitHub URL'],['json',Code2,'Structured JSON']].map(([id,Icon,label])=><button role="tab" aria-selected={mode===id} className={mode===id?'selected':''} key={id} onClick={()=>setMode(id)}><Icon size={15}/>{label}</button>)}</div>
            <form onSubmit={importDiscussion} className="import-form">{mode === 'github' ? <label>Public issue or pull request<input ref={inputRef} type="url" required value={github} onChange={e=>setGithub(e.target.value)} placeholder="https://github.com/owner/repo/issues/123"/><span className="field-help">Imports the description and issue comments. Inline PR reviews are not included.</span></label> : <><div className="form-row"><label>Discussion title<input ref={inputRef} required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What was the team deciding?"/></label><label>Source URL <span className="optional">optional</span><div className="input-icon"><Link2 size={14}/><input type="url" value={source} onChange={e=>setSource(e.target.value)} placeholder="https://discuss.python.org/t/…"/></div></label></div><label className="discussion-input-label">{mode === 'json' ? 'Discussion messages' : 'Discussion text'}<textarea required maxLength={200000} rows={7} value={text} onChange={e=>setText(e.target.value)} className={mode==='json'?'code-input':''} placeholder={mode === 'json' ? '[\n  {"author": "Contributor", "body": "The original message…", "source_url": "https://…"}\n]' : 'Paste a public discussion, issue, or technical thread here.\n\nInclude the alternatives people considered and the reasons behind their choices. We’ll trace every insight back to the original words.'}/></label><div className="input-footnote"><span><FileText size={13}/>{mode==='json'?'Preserves speaker and message attribution':'Only the discussion. No final specification needed.'}</span><span>{text.length.toLocaleString()} / 200,000</span></div></>}
              <div className="form-footer"><p><ShieldCheck size={15}/> Public discussions only. Evidence always included.</p><button className="primary" type="submit" disabled={!!busy}>{busy ? <Spinner/> : <Sparkles size={15}/>} {busy==='analyze'?'Analyzing discussion…':busy==='import'?'Saving discussion…':'Analyze discussion'}{!busy && <ArrowRight size={15}/>}</button></div>
            </form>
          </section>
          {!ready && <div className="setup-nudge"><Terminal size={16}/><p>{health ? 'Connect a local model to start recovering decisions.' : 'Start the backend to connect your local workspace.'} <button className="text-button" onClick={()=>navigate('settings')}>View setup <ArrowRight size={12}/></button></p></div>}
          {view==='overview' && <section className="recent-section"><div className="section-heading"><h2>Recent discussions <span>{discussions.length}</span></h2>{discussions.length>0 && <button className="text-button" onClick={()=>navigate('decisions')}>View decision library <ArrowRight size={14}/></button>}</div>{discussions.length ? <div className="discussion-table"><div className="table-heading"><span>DISCUSSION</span><span>DECISIONS</span><span>IMPORTED</span></div>{discussions.slice(0,6).map(d=><button key={d.id} className="discussion-row" onClick={()=>openDiscussion(d.id)}><span><span className="row-icon"><MessageSquare size={17}/></span><span><strong>{d.title}</strong><small>{d.message_count} message{d.message_count!==1?'s':''} · {d.latest_status || 'Ready to analyze'}</small></span></span><span>{d.decision_count}</span><span>{shortDate(d.created_at)}<ChevronRight size={15}/></span></button>)}</div> : <div className="empty-library"><div className="empty-mark"><GitBranch size={26}/></div><h3>Your decision history starts here</h3><p>Import your first discussion above. The decisions you recover<br className="desktop-break"/> will become a searchable, evidence-linked library.</p><span><span/> No invented consensus. No lost context.</span></div>}</section>}
          <div className="bottom-note"><span><ShieldCheck size={14}/> Built for verifiable understanding</span><span>Open-weight models. Original sources. Your machine.</span></div>
        </>}
        {view==='decisions' && <><div className="page-heading"><div><h1>Decision library</h1><p>The choices you recovered, with the evidence that explains them.</p></div><button className="primary" onClick={openImport}><Plus size={15}/> New discussion</button></div><form className="search-form" onSubmit={search}><Search size={18}/><input aria-label="Search decisions" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search decisions, alternatives, or reasons…"/><button type="submit" className="secondary" disabled={!!busy}>Search</button></form><div className="decision-results">{libraryDecisions.length ? libraryDecisions.map(d=><button className="decision-result" key={d.id} onClick={()=>openDecision(d)}><div><span className="result-source"><MessageSquare size={13}/>{d.discussion_title}</span><h2>{d.title}</h2><p>{d.summary}</p><span className="muted small">{d.alternatives.length} alternatives considered</span></div><Status value={d.status}/><ChevronRight size={18}/></button>) : <div className="empty-library"><Search size={28}/><h3>{query?'No matching decisions':'No decisions yet'}</h3><p>{query?'Try a different keyword or alternative name.':'Analyze a discussion to build your library.'}</p></div>}</div></>}
        {view==='discussion' && discussion && <><div className="page-heading discussion-heading"><div><button className="text-button" onClick={()=>navigate('overview')}>Workspace / Discussions</button><h1>{discussion.title}</h1><p>{discussion.messages.length} messages <span className="dot-separator">·</span> Imported {shortDate(discussion.created_at)}{discussion.source_url && <> <span className="dot-separator">·</span> <a href={discussion.source_url} target="_blank" rel="noreferrer">Original discussion <ArrowUpRight size={12}/></a></>}</p></div><div className="header-actions"><button className="secondary" disabled={!!busy} onClick={()=>exportFile('json')}><ArrowDownToLine size={14}/> JSON</button><button className="secondary" disabled={!!busy} onClick={()=>exportFile('markdown')}>Markdown</button><button className="primary" disabled={!!busy} onClick={()=>analyze(discussion.id)}>{busy==='analyze'?<Spinner/>:<Sparkles size={14}/>} {busy==='analyze'?'Analyzing…':'Analyze again'}</button></div></div>
          {busy==='analyze' && <div className="processing" role="status"><Spinner/><div><strong>Reading the discussion and checking the evidence…</strong><p>Local inference can take a few minutes. Your source messages are saved.</p></div></div>}
          {discussion.runs[0] && <div className="run-info"><span className={`model-dot ${discussion.runs[0].status==='completed'?'mint':''}`}/>{discussion.runs[0].model_name} · {discussion.runs[0].status}{discussion.runs[0].error_message && <span> — {discussion.runs[0].error_message}</span>}</div>}
          {discussionDecisions.length>1 && <div className="decision-tabs">{discussionDecisions.map(d=><button key={d.id} className={selected?.id===d.id?'selected':''} onClick={()=>{setSelected(d);setMessageId(null)}}>{d.title}</button>)}</div>}
          {selected ? <div className="detail-grid"><div className="decision-content"><div className="detail-title"><Status value={selected.status}/><span className="muted small">{selected.confidence} model confidence</span></div><h2 className="decision-title">{selected.title}</h2><p className="question-text">{selected.question}</p><div className={`chosen ${hasSupportedChoice?'':'uncertain-choice'}`}>{hasSupportedChoice?<Check size={18}/>:<CircleHelp size={18}/>}<div><span>{hasSupportedChoice?'Chosen approach':'Outcome not established'}</span><h3>{hasSupportedChoice?selected.chosen_approach:'No verified choice established'}</h3></div></div><div className="summary"><h3>Model interpretation</h3><p>{selected.summary}</p><span className="muted small">Check the source quotes before treating this as project policy.</span></div><h3 className="content-section-heading">Alternatives considered <span>{selected.alternatives.length}</span></h3>{selected.alternatives.map((a,i)=><article className="alternative" key={i}><div className="alternative-heading"><h3>{a.name}</h3><Status value={a.status}/></div><p>{a.reason || 'No verified reason established in the discussion.'}</p><details><summary><Quote size={13}/> {uniqueEvidence(a.evidence).length} supporting quote{uniqueEvidence(a.evidence).length!==1?'s':''}<ChevronDown size={13}/></summary><Evidence evidence={a.evidence} onSource={setMessageId}/></details></article>)}{selected.rationales.length>0 && <><h3 className="content-section-heading">Decision rationale</h3>{selected.rationales.map((r,i)=><article className="alternative" key={i}><p>{r.text}</p>{!r.verified && <span className="status uncertain">Unverified interpretation</span>}<Evidence evidence={r.evidence} onSource={setMessageId}/></article>)}</>}{selected.uncertainties.length>0 && <div className="uncertainty"><CircleHelp size={17}/><div><h3>What remains uncertain</h3><ul>{[...new Set(selected.uncertainties)].map((u,i)=><li key={i}>{u}</li>)}</ul></div></div>}{selected.code_refs.length>0 && <div className="code-refs"><h3>Referenced code</h3>{selected.code_refs.map(p=><code key={p}>{p}</code>)}</div>}</div><aside className="evidence-panel"><div className="section-heading"><h3><Quote size={16}/> Source evidence</h3><ShieldCheck size={15}/></div><p className="muted small">Original words, preserved for you to verify.</p><Evidence evidence={selected.evidence} onSource={setMessageId}/><div className="evidence-explainer"><ShieldCheck size={17}/><p>“Verified” means the quote exists in the source. The model’s interpretation still needs your judgment.</p></div></aside></div> : !busy && <div className="empty-library"><GitBranch size={30}/><h3>{discussion.runs[0]?.status==='completed'?'No decisions recovered':'Your discussion is saved'}</h3><p>{discussion.runs[0]?.status==='completed'?'The model did not identify a decision. Review the messages or try a stronger model.':'Connect Ollama, then analyze to recover decisions and alternatives.'}</p><button className="secondary" onClick={()=>navigate('settings')}>Model setup <ArrowRight size={14}/></button></div>}
          <section className="ask-inline"><div><h2><MessageSquare size={18}/> Ask this discussion</h2><p>Get an answer grounded in the recovered source evidence.</p></div><AskForm question={question} setQuestion={setQuestion} ask={ask} busy={busy} answer={answer} onSource={setMessageId}/></section>
          <details className="source-messages" open={!!messageId}><summary><FileText size={16}/> Original messages <span>{discussion.messages.length}</span><ChevronDown size={15}/></summary>{discussion.messages.map(m=><article key={m.id} id={m.id===messageId?'source-message':undefined} className={m.id===messageId?'highlight-message':''}><div><strong>{m.author || 'Unattributed message'}</strong><code>{m.id.split(':').at(-1)}</code>{m.source_url && <a href={m.source_url} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a>}</div><pre>{m.body}</pre></article>)}</details>
        </>}
        {view==='ask' && <><div className="page-heading"><div><h1>A question deserves a source.</h1><p>Ask across your decision library. Get evidence, or an honest “I don’t know.”</p></div><MessageSquare className="heading-icon" size={30}/></div><section className="ask-page"><span className="ask-symbol"><Quote size={28}/></span><h2>What’s behind the decision?</h2><p>Understand the approaches considered, the tradeoffs made,<br/>and the reasons an alternative didn’t make it.</p><AskForm question={question} setQuestion={setQuestion} ask={ask} busy={busy} answer={answer} onSource={resolveSource}/>{!answer && <div className="suggested-questions">{['Which alternatives were rejected and why?','What remains unresolved?','Why was this approach chosen?'].map(q=><button key={q} onClick={()=>setQuestion(q)}>{q}<ArrowUpRight size={13}/></button>)}</div>}</section></>}
        {view==='context' && <><div className="page-heading"><div><h1>Give your next change some context.</h1><p>Find historical decisions that explicitly reference the files you’re changing.</p></div><Code2 size={30} className="heading-icon"/></div><section className="utility-panel"><h2>Changed file paths</h2><p>One repository-relative path per line. Matches are exact, based on cited references.</p><form onSubmit={e=>{e.preventDefault();run('context',async()=>setContext(await post('/pr-context',{paths:contextPaths.split('\n').map(s=>s.trim()).filter(Boolean)})))}}><label className="sr-only" htmlFor="paths">Changed file paths</label><textarea id="paths" required className="code-input" rows={6} value={contextPaths} onChange={e=>setContextPaths(e.target.value)} placeholder={'src/auth.py\nsrc/database.py'}/><button className="primary" disabled={!!busy}>{busy?<Spinner/>:<Search size={15}/>} Find historical context</button></form>{context && (context.length ? context.map(c=><button className="context-match" key={c.decision.id} onClick={()=>openDecision(c.decision)}><h3>{c.decision.title}</h3><p>{c.reason}</p><code>{c.matched_paths.join(', ')}</code></button>) : <div className="setup-nudge">No decisions explicitly reference these file paths.</div>)}</section></>}
        {view==='settings' && <><div className="page-heading"><div><h1>Your model. Your machine.</h1><p>DevRecall uses a local open-weight model for extraction and grounded answers.</p></div><Terminal size={30} className="heading-icon"/></div><section className="utility-panel"><div className="section-heading"><h2>Ollama connection</h2><span className={`status ${ready?'accepted':'uncertain'}`}>{ready?'Connected':'Unavailable'}</span></div><p>{health?.model?.error || (ready?'Your configured model is ready.':'Start the backend and Ollama to connect.')}</p><div className="setup-steps"><h3>Install and start Ollama</h3><p>Download the runtime from <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download <ArrowUpRight size={12}/></a>, then run:</p><pre>ollama serve</pre><h3>Install an open-weight model</h3><pre>ollama pull {health?.model?.name || 'qwen2.5:3b'}</pre><h3>Configure the backend</h3><p>Set these values in the project’s <code>.env</code>, then restart the backend.</p><pre>OLLAMA_BASE_URL=http://localhost:11434{'\n'}OLLAMA_MODEL={health?.model?.name || 'qwen2.5:3b'}</pre></div><button className="secondary" onClick={()=>run('health',refresh)} disabled={!!busy}>{busy?<Spinner/>:<Settings2 size={14}/>} Check connection</button></section></>}
      </main><footer className="app-footer"><span>DevRecall <span className="footer-slash">/</span> Every decision has a reason.</span><span><span className="footer-dot"/> Evidence before assumptions</span></footer>
    </div>
  </div>;
}

function AskForm({ question, setQuestion, ask, busy, answer, onSource }) {
  return <div className="ask-form-wrapper"><form className="ask-form" onSubmit={ask}><MessageSquare size={18}/><input required maxLength={2000} aria-label="Question for DevRecall" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Why was an alternative rejected?"/><button className="primary" type="submit" disabled={!!busy} aria-label="Ask DevRecall">{busy==='ask'?<Spinner/>:<ArrowRight size={18}/>}</button></form>{answer && <div className="answer" aria-live="polite"><h3><Sparkles size={16}/> {answer.citations.length?'An answer, with evidence':'Insufficient evidence'}</h3><p>{answer.answer}</p>{answer.citations.length>0 && <p className="muted small">Model interpretation. Verify the quoted sources before treating this as a decision.</p>}{answer.uncertainty_note && <p className="muted small">{answer.uncertainty_note}</p>}<Evidence evidence={answer.citations} onSource={onSource}/></div>}</div>;
}
