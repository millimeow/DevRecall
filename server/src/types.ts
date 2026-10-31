export interface Repository {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  status: string;
  last_error: string | null;
  last_indexed_at: string | null;
  total_prs_known: number | null;
  is_demo: number;
}
export interface GitHubRepository {
  id: number;
  owner: { login: string };
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  archived: boolean;
}
export interface GitHubItem {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  state: 'open' | 'closed';
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  path?: string;
  in_reply_to_id?: number;
}
export interface Source {
  id: string;
  repo_id: number;
  pr_number: number;
  kind: string;
  github_source_id: string;
  author_login: string | null;
  body: string;
  html_url: string;
  path: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface PullRequest {
  repo_id: number;
  number: number;
  github_pr_id: number;
  title: string;
  body: string | null;
  html_url: string;
  author_login: string | null;
  state: string;
  content_hash: string | null;
  last_analyzed_hash: string | null;
  analysis_status: string;
}
export interface Job {
  id: string;
  repo_id: number;
  mode: string;
  status: string;
  phase: string;
  last_pr_page: number;
  discovery_done: number;
  prs_discovered: number;
  prs_fetched: number;
  prs_analyzed: number;
  comments_fetched: number;
  comments_analyzed: number;
  error_message: string | null;
  retry_after: string | null;
}
export interface EvidenceInput {
  source_id: string;
  excerpt: string;
}
export interface Citation extends EvidenceInput {
  html_url: string;
  pr_number: number;
  author_login: string | null;
  kind: string;
  created_at: string | null;
}
