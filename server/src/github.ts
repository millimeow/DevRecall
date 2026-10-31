import { z } from 'zod';
import { AppError } from './errors.js';
import type { GitHubRepository, GitHubItem } from './types.js';
export function parseGitHubUrl(input: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AppError(
      'INVALID_REPOSITORY_URL',
      'Enter a public repository URL: https://github.com/owner/repo.',
    );
  }
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    parts.length !== 2 ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(parts[0] ?? '') ||
    !/^[a-zA-Z0-9_.-]+$/.test(parts[1] ?? '') ||
    ['.', '..', '.git'].includes(parts[1] ?? '')
  )
    throw new AppError(
      'INVALID_REPOSITORY_URL',
      'Enter only https://github.com/owner/repo (a trailing slash or .git is supported).',
    );
  const repo = parts[1].replace(/\.git$/, '');
  if (!repo || repo === '.' || repo === '..')
    throw new AppError('INVALID_REPOSITORY_URL', 'Repository name is invalid.');
  return { owner: parts[0], repo };
}
const repoSchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  html_url: z.url(),
  private: z.boolean(),
  description: z.string().nullable(),
  default_branch: z.string(),
  archived: z.boolean(),
});
export type Fetch = typeof fetch;
export class GitHubClient {
  constructor(
    private token = process.env.GITHUB_TOKEN ?? '',
    private fetcher: Fetch = fetch,
  ) {}
  async get<T>(path: string): Promise<{ data: T; next: boolean }> {
    // Paths are constructed from parsed owner/name strings. Redirects are followed only on api.github.com.
    let url = new URL(path, 'https://api.github.com');
    for (let hop = 0; hop < 5; hop++) {
      if (url.origin !== 'https://api.github.com')
        throw new AppError('GITHUB_REDIRECT', 'GitHub returned an unsafe redirect.', 502);
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'DevRecall/3',
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        throw new AppError(
          'GITHUB_UNAVAILABLE',
          'GitHub request failed. Retry when the network is available.',
          502,
        );
      }
      if ([301, 302, 307, 308].includes(response.status)) {
        url = new URL(response.headers.get('location') ?? '', url);
        continue;
      }
      const secondaryLimit =
        response.status === 403 &&
        /(?:secondary )?rate limit|abuse detection/i.test(await response.clone().text());
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' ||
            response.headers.has('retry-after') ||
            secondaryLimit))
      ) {
        const retry = response.headers.get('retry-after');
        const seconds = Number(retry);
        const reset = Number(response.headers.get('x-ratelimit-reset'));
        const at = retry
          ? Number.isFinite(seconds)
            ? Date.now() + seconds * 1000
            : Date.parse(retry)
          : reset
            ? reset * 1000
            : Date.now() + 60000;
        throw new AppError(
          'GITHUB_RATE_LIMIT',
          'GitHub rate limit reached. Retry after the reset time; any indexing progress is saved.',
          429,
          new Date(
            Math.max(Date.now() + 1000, Number.isFinite(at) ? at : Date.now() + 60000),
          ).toISOString(),
        );
      }
      if (!response.ok)
        throw new AppError(
          response.status === 404 ? 'GITHUB_NOT_FOUND' : 'GITHUB_ERROR',
          response.status === 404
            ? 'Public repository or PR source is not accessible.'
            : `GitHub returned HTTP ${response.status}. Progress has been saved.`,
          response.status === 404 ? 404 : 502,
        );
      return {
        data: (await response.json()) as T,
        next: /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') ?? ''),
      };
    }
    throw new AppError('GITHUB_REDIRECT', 'Too many GitHub redirects.', 502);
  }
  async resolve(input: string): Promise<GitHubRepository> {
    const { owner, repo } = parseGitHubUrl(input);
    const { data } = await this.get<GitHubRepository>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );
    if (data.private)
      throw new AppError(
        'PUBLIC_REPOS_ONLY',
        'Only public GitHub repositories are supported.',
        400,
      );
    const parsed = repoSchema.safeParse(data);
    if (!parsed.success)
      throw new AppError('GITHUB_RESPONSE', 'GitHub returned incomplete repository metadata.', 502);
    return parsed.data;
  }
  async list(
    owner: string,
    repo: string,
    endpoint: string,
    page: number,
  ): Promise<{ data: GitHubItem[]; next: boolean }> {
    return this.get<GitHubItem[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
  }
}
