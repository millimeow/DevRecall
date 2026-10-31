# JavaScript migration verification — 31 October 2026

The application was migrated at the user's request to **React.js with Next.js** for the frontend and **Express.js on Node.js** for the backend. The dark interface and public API paths were retained.

## Runtime

- Node.js: **22.20.0**; minimum supported version **22.13.0** for the built-in SQLite API.
- Next.js: **16.4.3**, App Router, JavaScript React client workspace.
- React / React DOM: **19.3.1**.
- Express.js: **5.3.0**, JavaScript ES modules.
- SQLite: existing database and schema, opened through Node's built-in SQLite API.
- Ollama: existing local `qwen2.5:3b` model; model digest remains in each actual run's metadata.

Python source, Python tests/dependency manifests, Vite configuration and the Vite entry point were removed from the tracked application. npm workspaces and one root lockfile manage both servers. Historical extraction outputs are preserved with their original provenance.

## Data preservation

Before switching servers, a SQLite backup was saved at `/private/tmp/devrecall-before-node-migration.sqlite`. All existing table rows were compared before and after switching to Node, including IDs, source text, run records and serialized decision payloads:

| Original records | Preserved |
| --- | ---: |
| Discussions | 4 |
| Messages | 13 |
| Extraction runs | 3 |
| Decisions | 3 |

The comparison passed without modifying the original records. New Node verification runs then added their own discussions and results.

## Checks

- `npm test`: **15 JavaScript tests passed**. Tests cover actual Express HTTP requests and SQLite with the model boundary replaced for offline checks, plus adapter transport failure handling.
- `npm run build`: **Next.js production build passed**.
- Next.js `/`: HTTP 200 and Next.js client assets present.
- Next.js `/api/health`: HTTP 200, Express runtime reported, database healthy, configured Ollama model available.
- Next.js `/api/discussions`: existing discussions loaded through the API rewrite.
- Browser: React hydration, model health, decision-library keyword search, and stored decision details checked. No browser console errors were observed during the initial connected-page check.
- The proxy timeout was increased from Next's default 30 seconds to 15 minutes to accommodate local-model inference. The per-model-call timeout remains configured separately.

## Actual Node/Express inference

These files contain unedited, real adapter results, not mocked tests:

- `node_synthetic_output.json`: labeled synthetic storage input, **22.78 seconds**. The model selected SQLite and recovered additional candidates. Some alternatives remain uncertain; inspect the actual output and evidence flags.
- `node_sample_output.json`: public Python discussion only, **25.01 seconds**. No final PEP was supplied. Rejected-alternative coverage remains limited and several outcomes remain uncertain or contested.
- `node_sample_answer.json`: real question-answering request through the Next.js proxy to Express, **19.52 seconds**. The model's citations did not validate, so the application honestly abstained. This is not a successful answer-quality claim.

The migration preserves the source validation and abstention behavior. It does not claim to improve the small model's interpretation quality. Earlier files without the `node_` prefix and `attempts/` belong to the previous implementation and are not presented as Node runtime results.

## Reproduce

From the repository root, with Ollama running and the model installed:

```sh
npm ci
npm run dev
```

In another terminal:

```sh
npm test
npm run build
npm run evaluate -- --input examples/synthetic_discussion.json --output examples/node_synthetic_output.json
npm run evaluate -- --input examples/public_discussion.json --output examples/node_sample_output.json
```

For production, run `npm run build`, then start `npm run start:backend` and `npm run start:frontend` in separate terminals. Root README contains the complete environment configuration and file tree. GitHub Actions now runs npm install-from-lockfile, JavaScript tests and the Next.js build. No remote CI pass or PR is claimed without a configured remote.
