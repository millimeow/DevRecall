# Demo setup

1. Install with `npm ci`; copy `.env.example` privately to `.env`.
2. Set a read-only `GITHUB_TOKEN` to avoid the shared unauthenticated API limit.
3. Install/start your chosen open-weight model and set `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`.
4. Start with `npm run dev`; open port 5174.
5. Pick a small public repo for the first full scan. The demo sidebar includes Flask, Django and CPython; these are large real projects and begin unanalyzed.
6. Verify metadata, analyze, wait for genuine coverage, inspect a decision and ask a question supported by a specific PR conversation. Open the cited GitHub comment to audit it.
7. Resume a partial job or Sync after changes. Reloading the UI does not discard worker state.

Never insert the screenshots' sample counts, synthetic fixture decisions or hardcoded answers as demo output. The unavailable screenshot references prevent claiming pixel-exact reproduction. A real-model run is still required before claiming extractor quality.
