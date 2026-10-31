import { AppError } from './errors.js';
import { discussionInput } from './schemas.js';

export async function importGithub(url, store, fetchImpl = fetch) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)\/?$/.exec(url);
  if (!match) throw new AppError(400, 'Use a public GitHub issue or pull-request URL.');
  const [, owner, repo, kind, number] = match;
  const base = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
  async function get(target) {
    let response;
    try { response = await fetchImpl(target, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DevRecall' } }); }
    catch { throw new AppError(502, 'Cannot connect to GitHub. Paste the discussion instead.'); }
    if ([403, 429].includes(response.status)) throw new AppError(429, 'GitHub rate limit reached. Try later or paste the public discussion.');
    if (response.status === 404) throw new AppError(404, 'Public issue not found.');
    if (!response.ok) throw new AppError(502, 'GitHub could not return this discussion.');
    return response.json();
  }
  const issue = await get(base);
  if (issue.comments > 400) throw new AppError(413, 'More than 400 comments. Import a smaller public excerpt as structured JSON.');
  const messages = [{ author: issue.user.login, body: issue.body || '(No description)', source_url: issue.html_url, created_at: issue.created_at }];
  for (let page = 1; page <= 4; page++) {
    const comments = await get(`${base}/comments?per_page=100&page=${page}`);
    messages.push(...comments.map(c => ({ author: c.user.login, body: c.body || '(Empty comment)', source_url: c.html_url, created_at: c.created_at })));
    if (comments.length < 100) break;
  }
  let data;
  try { data = discussionInput({ title: issue.title, source_type: kind === 'pull' ? 'github_pr' : 'github_issue', source_url: url, messages }); }
  catch { throw new AppError(413, 'Discussion is too large. Import a smaller public excerpt.'); }
  return store.importDiscussion(data);
}
