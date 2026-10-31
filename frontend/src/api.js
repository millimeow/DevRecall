export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  const messages = {
    model_not_configured: 'No AI model is configured. Select and configure a provider before analyzing.',
    adapter_not_implemented: 'The selected provider has no implemented adapter yet. See the setup instructions.',
    github_rate_limited_or_forbidden: 'GitHub denied or rate-limited the request. Add a public-access GitHub token or try again later.',
  };
  if (!response.ok) throw new Error(messages[data.error?.message] || data.error?.message || (typeof data.detail === 'string' ? data.detail : data.detail?.[0]?.msg) || `Request failed (${response.status}).`);
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
