# DevRecall Project Guide

## What we have and what we need to do

This guide explains how our DevRecall app runs, how each feature works, where its code lives, and what we should do next. It is written for the project team so that everyone can set up the app, explain it, test it, and make changes without losing the connection to the original discussion evidence.

We have a working local JavaScript MVP. The frontend uses React with Next.js; the backend uses Express on Node.js. SQLite stores discussions and decisions, and Ollama runs the configured open-weight model locally. Our next priority is improving decision and rejection recovery on unseen public discussions, then completing the repository and review workflow.

### Current position

| Area | Current position |
| --- | --- |
| Application | Import, analyze, inspect evidence, search, ask questions, export, and match explicit code paths are implemented. |
| Verification | The recorded migration checks passed 15 JavaScript tests and the Next.js production build. This is a local result, not a remote CI result. |
| Model quality | The 3B model can miss alternatives or assign an imprecise interpretation. Unsupported outcomes stay uncertain; answers can abstain. |
| Delivery | The feature branch exists. A public remote, PR merge, remote CI pass, and event submission have not been verified. |

### Our immediate work

1. Run the app and follow the demonstration on page 10.
2. Read the source quotes before trusting an extracted outcome or answer.
3. Evaluate unseen discussions and record errors separately from successful quote matching.
4. Improve model quality without replacing uncertain results with invented explanations.
5. Finish the public repository and PR workflow after the local checks pass.

### How to use this guide

Pages 2 to 4 cover setup, architecture, and the API. Pages 5 to 9 explain extraction, evidence, storage, search, and integrations. Pages 10 to 12 cover demonstrations, troubleshooting, and the remaining work.

Prepared for the DevRecall project team on 31 October 2026. Based on repository commit 0dbeb24. File paths are relative to the repository unless a full path is shown. This document describes the JavaScript implementation; older Python evaluation files are historical records.

<!-- PAGE -->

## Run the app on your machine

Use Node.js 22.13 or newer, npm, and an installed Ollama runtime. The migration was tested on Node.js 22.20.0. Python is not needed to run the application. All commands below run from the project root; use your own checkout path on another machine.

### Install the application packages

```sh
cd /Users/aayushray/Desktop/DevRecall
npm ci
cp .env.example .env
```

Run the copy command only when creating your local configuration. Keep existing values if you already have a .env file. npm ci installs both workspaces from the root package lockfile.

### Start the model and application

```sh
# Terminal one
ollama serve

# Terminal two
ollama pull qwen2.5:3b
npm run dev
```

If Ollama is already running, use that instance. Pulling the model downloads it; starting the runtime alone does not install a model. Open http://127.0.0.1:5173 and check that model health reports ready. Express listens on port 8000 and Ollama normally listens on port 11434.

To start the application servers separately, use npm run dev:backend and npm run dev:frontend in different terminals. For production, run npm run build once, then use npm run start:backend and npm run start:frontend in separate terminals.

### Configuration we need to understand

| Setting | What it controls |
| --- | --- |
| OLLAMA_BASE_URL | The model server used by Express. Default http://localhost:11434. |
| OLLAMA_MODEL | The installed model tag, currently qwen2.5:3b. Changing the name does not download that model. |
| MODEL_TIMEOUT | Time allowed for each inference request in seconds. Default 240, bounded by the backend configuration. |
| PORT | Express API port, normally 8000. |
| API_BASE_URL | Where Next.js forwards API requests, normally http://127.0.0.1:8000. |
| DEVRECALL_DB | Optional SQLite file override. Default backend/devrecall.db. |

Restart Express after changing its settings. Restart Next.js development, or rebuild production, after changing the API target. The temporary verification runtime under /private/tmp/devrecall-ollama is explained in README.md; install Ollama normally for persistent use.

<!-- PAGE -->

## Understand the architecture and interface

JavaScript is the application language. Node.js runs JavaScript on the server. Express provides the backend HTTP routes. React renders the interface, while Next.js provides the frontend application framework, page entry point, production build, and API proxy.

### How a request travels

```text
Browser running the React workspace
    -> Next.js on port 5173
       -> /api requests forwarded to Express on port 8000
          -> SQLite for stored data
          -> Ollama on port 11434 for model inference
       <- JSON results returned through Next.js
    <- React updates the visible interface
```

SQLite is a local database file, so it has no separate server port. The browser uses one frontend origin; Next.js forwards the API requests behind that origin. In production, both the Next.js frontend and Express API must be running.

### What each screen does

| Screen | What we use it for |
| --- | --- |
| Overview | Import a discussion, check real counts, and open recent sources. |
| Decision library | Search stored decisions, approaches, and reasons. |
| Discussion details | Read a chosen approach, alternatives, uncertainty notes, and exact source quotes. |
| Ask DevRecall | Ask across the library; use the discussion question box to limit the scope to that source. |
| Code context | Enter changed file paths and find exact matches to cited code references. |
| Model setup | Check model availability and read the local setup commands. |

### Where frontend behavior lives

frontend/app/layout.jsx defines page metadata and loads global CSS. frontend/app/page.jsx renders the workspace. frontend/src/App.jsx is a React client component: its state tracks the current screen, source, selected decision, form values, loading state, and errors. frontend/src/api.js handles JSON API requests. frontend/src/styles.css controls the visual layout.

Next.js starts the app at the root page. The existing workspace switches screens with React state, rather than separate URLs for each decision. Refreshing returns to Overview; saved data stays in SQLite. Health is refreshed approximately every 30 seconds. Source buttons open the imported message, with an original public link when available.

<!-- PAGE -->

## Understand the backend and API

An API endpoint is a server address for an operation. GET reads data; POST submits data or starts work. Express receives the request, validates its input, calls the appropriate service, and returns JSON. A failed request returns a detail message that the React interface displays.

backend/src/server.js loads configuration, opens SQLite, marks interrupted analyses as failed, and starts Express. backend/src/app.js connects routes to storage, extraction, retrieval, GitHub import, and exports. schemas.js validates structures with Ajv. errors.js provides consistent application errors.

### API reference

Every path below begins with /api. Replace :id with the actual discussion or decision identifier.

| Method and endpoint | Purpose |
| --- | --- |
| GET /health | Report API, database, and configured model health separately. |
| POST /discussions | Save raw text or structured messages. |
| GET /discussions | List saved sources and actual counts. |
| GET /discussions/:id | Read source metadata, messages, and extraction runs. |
| POST /discussions/:id/analyze | Run the configured model and validate the candidates. |
| GET /discussions/:id/decisions | List current decisions for a source. |
| GET /decisions/:id | Read a full decision record. |
| GET /search?q=... | Search titles, alternatives, summaries, and reasons. |
| POST /ask | Return a grounded answer or an explicit abstention. |
| GET /discussions/:id/export | Export JSON by default; use format=markdown for Markdown. |
| POST /github/import | Import a public issue or PR URL. |
| POST /pr-context | Match supplied changed paths to stored code references. |

### What happens during analysis

The analyze route creates a run record before inference. It waits for extraction and validation, then replaces that discussion's current decisions only after success. There is no background job queue or exact percentage progress meter. A loading message means the request is still running.

The API rejects simultaneous analysis of the same discussion with HTTP 409. Validation failures generally return 422, unknown IDs return 404, model failures return 503, and GitHub rate limits return 429. These responses explain why saving a source can succeed while analyzing it fails.

<!-- PAGE -->

## How decision extraction works

The model proposes interpretations of a discussion. The application then checks the shape of the result and its source references. This separation is central: the model identifies approaches and possible outcomes, while ordinary JavaScript code controls validation and storage.

### From import to candidate decisions

1. The import route accepts a title and either raw_text or a messages array. Structured messages preserve optional author, time, and source URL fields. Raw paste becomes one unattributed message.
2. database.js assigns a discussion UUID and stable message IDs, then saves the original text before analysis.
3. extraction.js groups messages into chunks of at most 22,000 characters. It keeps modest overlap at message boundaries. A single message larger than that budget must be split before analysis.
4. A general model pass recovers technical questions and approaches. Focused passes examine up to eight messages with likely objection language. If none match, one whole-chunk objection pass runs instead.
5. llm.js calls Ollama's /api/chat endpoint. The JSON schema is supplied both in the request format and the instructions. The current adapter uses temperature zero and a 16,384-token context.
6. Ajv checks the returned JSON. A malformed structure gets one repair retry for that pass. Repeated invalid output fails the run; the app does not generate a replacement answer itself.

### What the model returns

Each candidate has a title, technical question, summary, approaches, code references, and uncertainty notes. An approach includes its name, proposed status, message ID, exact quote, and a reason_is_stated flag. When the flag is true, the quoted source excerpt becomes the explanation. The model does not get to mark its own quote as verified.

materialize converts these records into the application's decision and evidence format. evidence.js then validates them. Candidates with the same normalized question text merge conservatively. Contradictory outcomes can become contested; paraphrased questions may remain separate records.

### What we should improve next

The focused-message selection uses English keywords, and exact-question merging is limited. These choices keep the MVP small but can miss implicit objections or create duplicate viewpoints. Test changes on unseen discussions and inspect both omissions and incorrect confident labels before changing the extraction contract.

<!-- PAGE -->

## How evidence and uncertainty work

Evidence is an exact excerpt tied to an imported message. verify in backend/src/evidence.js looks up that message, normalizes whitespace, and checks that the quote occurs in the original body. Author and source URL come from the stored message, so a model-generated attribution cannot overwrite them.

### What each status means

| Status | How we should read it |
| --- | --- |
| Accepted | The model identifies an explicit selection and the source checks permit the label. Read the quote before treating it as project policy. |
| Rejected | The model identifies an objection to the named approach and the conservative checks permit the label. A participant's objection does not prove a project-wide vote. |
| Proposed | An approach was suggested without an established final outcome. |
| Contested | The extracted viewpoints or outcomes conflict. |
| Uncertain | Evidence, attribution, or outcome support is insufficient to keep a stronger claim. |

Accepted and rejected labels require the approach name to appear in the supporting quote, together with explicit English selection or objection language. This is a conservative text check, not a proof of intent. Missing support downgrades the outcome, removes an unsupported choice or reason, or adds an uncertainty note. Code references survive only when literally present in verified quotes.

### A practical example

Consider this clearly synthetic source: "We reject Redis because users should not need a separate server." The approach name, objection, and reason are visible in one quote. A model claim that Redis was rejected because it costs too much would not be supported by that excerpt.

If a model quotes a sentence that does not exist, the quote is unverified. If it quotes a real sentence but interprets it incorrectly, source matching can still pass. We must ask both whether the words exist and whether they actually support the interpretation.

### How the interface communicates this

The interface labels summaries and answers as model interpretations. A confirmed choice uses an affirmative presentation only when its required evidence is present; unknown choices use a neutral panel. Quote counts are deduplicated for display. Clicking an internal message ID opens the original imported text, even when that discussion has no extracted decisions.

Confidence is a qualitative model/application label, not a calibrated probability. An abstention or uncertain label is a valid result when the source does not support a stronger answer.

<!-- PAGE -->

## How storage and reruns work

SQLite keeps the app's data in backend/devrecall.db unless DEVRECALL_DB points elsewhere. Node opens the same schema used before the JavaScript migration. It does not require a separate database installation or cloud account.

### The four storage tables

| Table | What it stores |
| --- | --- |
| discussions | Source ID, title, source type, original URL, and import time. |
| messages | Original body, source attribution, sequence number, and stable message ID. |
| runs | Model name/provider, running or completed or failed status, error, and timestamps. |
| decisions | Current extracted decisions linked to the discussion and run. Alternatives, rationales, evidence, code references, and uncertainties are stored inside a JSON payload. |

The schema does not create separate relational Alternative and Evidence tables. Those objects are nested in each decision payload. This is an implementation simplification of the PRD, not a missing source link.

### Why IDs matter

```text
discussion UUID
    -> discussion UUID:msg_0001
    -> discussion UUID:msg_0002
```

The suffix records source order; the UUID keeps IDs unique across discussions. The global citation handler uses the discussion portion to fetch the correct source, then checks that the exact message exists. Reopening a source does not renumber its messages. Importing the same text again creates a new discussion and new IDs.

### Success and failure behavior

database.js uses a transaction to replace current decision rows and mark the run completed together. Failed analysis records an error while preserving previously successful decisions. Run history remains, but old decision bodies are not a full version archive after successful replacement; save an export when you need a snapshot.

On startup, server.js marks leftover running runs as failed and asks for a retry. It does not silently resume an interrupted model call. SQLite uses write-ahead logging. Stop the Express server before making a simple file copy, or use a SQLite-aware backup operation so that live WAL writes are included.

The database and .env are ignored by Git. A clean clone therefore starts with no saved discussions and no local model configuration. Example files are reference artifacts; startup does not automatically seed them into the app.

<!-- PAGE -->

## How search and questions work

Search and Ask DevRecall share stored sources but serve different jobs. Search returns matching decision records without calling the model. Ask retrieves relevant evidence and then requests an answer from the local model.

### Keyword search

searchDecisions in backend/src/retrieval.js splits the query into words, removes common words, counts matches, and ranks the stored decisions. It searches titles, questions, chosen approaches, alternatives, reasons, summaries, and code references. This implementation scans stored data; it is not a vector database or semantic search engine.

Try a specific approach name such as Redis. If a broad phrase gives poor results, use the distinctive term from the source. An empty search lists the library.

### The grounded answer flow

1. The question may be scoped to one discussion or asked across the library.
2. The backend retrieves up to six matching decisions and collects their verified evidence. It deduplicates and caps this set at 30 excerpts.
3. It also retrieves up to four relevant original-message excerpts, each up to 4,000 characters. This helps when extraction missed a useful message.
4. Ollama receives the question and retrieved text, with instructions to use only that material and return an answer plus source IDs and exact quotes.
5. Ajv validates the response. The backend checks that cited IDs belong to the retrieved set and that every cited quote occurs in the retrieved text.
6. The interface shows the answer with clickable citations. Missing support or invalid citations produce "I couldn't verify that from the imported discussion."

### What an abstention tells us

An abstention can mean no relevant source was retrieved, the model returned invalid output, or its citations failed validation. It does not prove that the original discussion contains no answer. Open the original messages, narrow the question, and inspect the validation note.

The recorded Node migration question about ForwardRef took 19.52 seconds and abstained because the model's citations did not validate. That output is preserved in examples/node_sample_answer.json. It is evidence of the abstention mechanism, not a successful answer-quality result.

We still need human review when a quote is genuine: a model can attach overly strong causal wording or an imprecise label to correct source text.

<!-- PAGE -->

## How imports exports and code context work

### Public GitHub import

The GitHub URL tab accepts an issue or pull-request URL in the form https://github.com/owner/repo/issues/123 or /pull/123. github.js calls the public GitHub REST API, imports the description, and fetches issue comments in pages of 100, capped at 400 comments. Every imported comment keeps its author and original link.

This import is unauthenticated. Rate limits produce an actionable error; pasting the public discussion is the fallback. Inline PR reviews, review submissions, attachments, and private repository content are not imported. The app does not post comments, create issues, or modify upstream code.

### Structured messages

Use Structured JSON when attribution matters. A minimal message array looks like this; this example is synthetic.

```json
[
  {
    "author": "Synthetic contributor",
    "body": "We reject polling because it wastes CPU.",
    "source_url": "https://example.org/public-thread"
  }
]
```

Use actual public URLs and original wording for real discussions. The form supplies the discussion title and optional source URL. The API accepts a messages array or raw_text, not both with content. Imported code and instructions remain data; the app does not execute them.

### Exports

JSON includes source metadata, original messages, extraction runs, and current decision records. Markdown presents a readable report with alternatives and citations. Neither export turns an uncertain interpretation into a verified outcome. Keep actual generated outputs unchanged when using them as evaluation evidence.

### Code context

The model can identify a path mentioned in a source quote. Validation retains the reference only when it occurs literally in verified evidence. Code context normalizes supplied path separators and compares exact paths to those stored references.

Enter one repository-relative changed path per line. A match means a historical discussion explicitly mentioned that path; it is a suggestion to review that decision. It does not prove the new change is incompatible. Automatic PR diff fetching, rename tracking, and semantic code matching remain unimplemented.

<!-- PAGE -->

## Test and demonstrate the app

### Local checks before a handoff

```sh
npm test
npm run build
```

The recorded migration checks passed 15 JavaScript tests and the Next.js production build. The test suite uses real local Express requests and SQLite, with the model boundary replaced for offline pipeline tests. Separate adapter failure tests use a controlled HTTP transport. Passing those tests does not prove that a real model recovered the correct reasoning.

Coverage includes input validation, stable IDs, exact quotes, uncertainty, failed reruns, schema repair, conflicting segments, search, exports, path matching, citation rejection, original-message retrieval, persistence, concurrent analysis, and model failures. The GitHub Actions workflow runs npm ci, npm test, and npm run build; it still needs a real remote run.

### Run an actual model evaluation

Start the application and Ollama first. Then use a new output filename when keeping earlier snapshots.

```sh
npm run evaluate -- \
  --input examples/synthetic_discussion.json \
  --output examples/node_synthetic_output.json

npm run evaluate -- \
  --input examples/public_discussion.json \
  --output examples/node_sample_output.json
```

The evaluator calls Express, saves a new discussion and run, and writes the actual output with model digest, Node runtime, and elapsed time. Repeated evaluations add new records. The recorded Node runs took 22.78 seconds for the synthetic input and 25.01 seconds for the public discussion; these are examples, not runtime guarantees.

### A demonstration we can explain

1. Show local model health and import the clearly labeled synthetic fixture.
2. Analyze, inspect a choice or uncertainty, and open its source quote.
3. Search an alternative and ask a focused question. Show an honest abstention if one occurs.
4. Export the discussion and explain how another reviewer can verify it.
5. Repeat with an unseen public discussion. For the organizer-style test, supply discussion messages only, without the final PEP.

The public fixture is a PEP-related implementation discussion, not the complete original PEP design debate. We must not present it as a comprehensive rejected-ideas benchmark. Historical files without the node_ prefix belong to the earlier implementation.

<!-- PAGE -->

## Diagnose common problems

### First check the three services

Open http://127.0.0.1:5173 for the interface. Read http://127.0.0.1:8000/api/health for Express and model status. A healthy Express response can still report that Ollama or its configured model is unavailable. Server readiness and model readiness are separate checks.

| Symptom | What we should do |
| --- | --- |
| Browser cannot connect | Start both application servers with npm run dev, or use the two separate server commands. |
| API request fails | Read the Express terminal, verify PORT and API_BASE_URL agree, and restart or rebuild the frontend after a target change. |
| Model is offline | Start Ollama or its installed desktop runtime. Confirm the configured base URL reaches it. |
| Model is missing | Run ollama list, then pull the exact tag configured in OLLAMA_MODEL. |
| Address already in use | Use the running app, or stop the old process from its terminal before starting another server on the same port. |
| Message is too large | Split the source into smaller structured messages while preserving original wording and attribution. |
| Analysis times out | Check memory/model availability, shorten the source, or evaluate another installed model. Saved input and prior successful results remain available. |
| GitHub rate limit | Wait and retry, or paste the public discussion. Do not assume the issue is private. |
| Uncertain result or abstention | Inspect the source and validation note. Narrow the question or improve the model/evaluation; do not fill in a missing rationale manually. |
| Data seems missing | Check DEVRECALL_DB and the source list. A different database path or a clean clone has different records. |

### Understand the limits that affect troubleshooting

The import limit is 200,000 characters and 500 messages. A structured message can be saved up to 60,000 characters, but analysis requires each message to fit the 22,000-character chunk budget. A saved source can therefore still require splitting before inference.

MODEL_TIMEOUT applies to each inference call, not the entire discussion. Next.js allows up to 15 minutes for the proxied request; the evaluation script allows 10 minutes per request. Large discussions can take several calls. The UI has a loading state rather than a measured progress percentage.

Keep this MVP on loopback for local use. There is no user authentication or public-hosting configuration. A remote frontend would need a reachable backend and model service; deploying static files alone would not provide extraction.

<!-- PAGE -->

## What we should do next

### Improve the quality of recovered decisions

Create a small set of unseen public discussions with explicit choices, genuine disagreements, and rejected alternatives. Ask a person to label the supported outcomes and original reasons. Score rejected-alternative recall, source accuracy, and incorrect confident labels separately. Test a stronger locally installed open-weight model through configuration, and compare actual saved outputs before claiming an improvement.

Prioritize model interpretation over visual additions. The current conservative name and outcome checks can miss valid paraphrases; relaxing them can also admit incorrect claims. A useful change needs evidence that it improves coverage without increasing unsupported confident outcomes.

### Finish the repository and review workflow

1. Configure the intended public repository and verify what has actually been submitted to the event.
2. Keep application changes on a feature branch and open a PR using the supplied template. The current feature branch is feat/devrecall-mvp; no remote or PR merge is claimed in this guide.
3. Include the real model tag/version, actual outputs, local check results, and known limitations in the PR description.
4. Run GitHub Actions on the remote and inspect its result. Merge through the agreed PR workflow after review.
5. Have another teammate follow the README from a clean checkout and perform the discussion-only demonstration.

### Suggested work areas

| Work area | Concrete next contribution |
| --- | --- |
| Frontend and runtime | Keep source navigation, model health, loading, errors, and mobile behavior usable as the backend changes. |
| Extraction and evidence | Improve rejected-approach recovery and add meaningful tests for newly observed failures. |
| Evaluation and examples | Preserve unseen inputs, actual outputs, human labels, model metadata, and separate coverage scores. |
| Delivery and documentation | Complete the remote/PR/CI workflow and keep setup commands and demonstrations reproducible. |

These are suggested responsibilities, not assignments to named team members. Inline PR reviews, semantic code matching, auth, and webhooks can follow once the core evaluation is dependable.

### Where to continue in the repository

README.md contains current setup commands and the file tree. backend/src holds the API and analysis services. backend/test/pipeline.test.js contains the JavaScript checks. examples/JAVASCRIPT_MIGRATION.md records actual Node verification; examples/EVALUATION.md is historical. HACKATHON.md records team/event information and AI disclosure. PRODUCT.md and DESIGN.md describe product constraints and the interface system.

Our handoff is ready when a teammate can import an unseen source, run the actual local model, inspect supported alternatives or honest uncertainty, follow the citations, and explain what the current evidence does and does not establish.
