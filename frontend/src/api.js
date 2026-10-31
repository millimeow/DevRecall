export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.detail?.[0]?.msg || `Request failed (${response.status}).`);
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
