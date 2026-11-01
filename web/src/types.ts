export interface Repo {
  id: number;
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
export interface Demo {
  id: number | null;
  full_name: string;
  url: string;
  description: string;
  status: string;
}
export interface Health {
  status: string;
  ai: { configured: boolean; provider: string | null; model: string | null };
}
export interface Job {
  id: string;
  status: string;
  phase: string;
  prs_discovered: number;
  prs_fetched: number;
  prs_analyzed: number;
  comments_fetched: number;
  error_message: string | null;
  retry_after: string | null;
}
export interface Detail {
  repository: Repo;
  summary: {
    decisions: number;
    rejected_removed: number;
    prs_scanned: number;
    comments_scanned: number;
    prs_analyzed: number;
    comments_analyzed: number;
  };
  job: Job | null;
}
export interface Citation {
  source_id: string;
  html_url: string;
  excerpt: string;
  pr_number: number;
  author_login: string | null;
  kind: string;
  created_at: string | null;
}
export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
}
export interface Decision {
  id: string;
  title: string;
  summary: string;
  reasoning: string;
  outcome: string;
  category: string;
  confidence: number;
  pr_number: number;
  evidence: Citation[];
  alternatives: { label: string; outcome: string; reason: string }[];
}
