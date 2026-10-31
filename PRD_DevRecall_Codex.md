# DevRecall — Product Requirements Document (PRD)

**Project:** DevRecall  
**Tagline:** Every decision has a reason. Never lose it.  
**Hackathon:** Hacktoberfest 2026 — Hack Day Sonipat, 31 October 2026  
**Track:** Problem 06 — Open Source Decision Intelligence and Knowledge Recovery  
**Document purpose:** Implementation specification for Codex  
**Status:** MVP build specification (features described here are planned, not claimed as complete)

---

## 0. Instructions to Codex — Read First

You are the lead full-stack engineer implementing **DevRecall** as a working open-source hackathon project, not a clickable mockup. Follow this document as the product specification.

1. **Inspect the current repository before changing anything.** Read `HACKATHON.md` and preserve it. Do not invent team names, team members, or AI models used.
2. **Respect the hackathon commit workflow:** the *first commit* must contain **only `HACKATHON.md`**. If that commit has not happened, tell the user to make it before adding other files. Afterward, all changes must enter `main` through **pull requests**; never commit additional work directly to `main`.
3. Prioritize the organizer's **actual evaluation scenario**: given a public technical discussion associated with a Python PEP **without showing the PEP**, extract the chosen approach, the rejected alternatives, and the actual reasons for rejection with verifiable source citations. Do not use the PEP as input in this mode.
4. Build **working functionality first**. Do not present fabricated extraction outputs, hard-coded answers to known PEPs, or a UI that merely pretends to call AI.
5. Use an **actual open-source or open-weight model** for meaningful decision extraction. Implement a configurable model adapter. Suggested MVP implementation: **Ollama** with a configurable installed open-weight instruction model (e.g. `qwen2.5:3b` if installed). A model suggestion is **not** a claim that it has been run. Record the true model/version used in `HACKATHON.md` and every PR description.
6. Never confidently invent a rationale, vote, consensus, code path, or quote. Unsupported fields must be `null`, empty, or marked `uncertain` and accompanied by an explanation.
7. Implement a minimal end-to-end vertical slice before polishing: paste discussion -> extract decisions -> validate evidence -> store -> view -> search / ask questions.
8. If blocked, implement the next safe piece, document the blocker, and keep tests passing. Do not silently skip mandatory deliverables.

**Definition of done:** A reviewer can start the app from README instructions, paste a previously unseen discussion, run a real locally configured model, inspect evidence-linked accepted/rejected alternatives, ask a question about the discussion, and verify the answer against the underlying source text.

---

## 1. Problem and Product Vision

### 1.1 Problem

Open-source architectural and engineering decisions are spread across issues, PRs, reviews, forums, design threads, and comments. The final choice is sometimes documented, but its **reasoning and rejected options** are often lost. New maintainers unknowingly reintroduce failed approaches or cannot explain an existing design.

### 1.2 Solution

**DevRecall** recovers a structured, searchable record of technical decisions from public discussions, including:

- The technical question being debated.
- The selected or proposed approach (only if evidence supports its status).
- Alternative approaches considered, especially rejected alternatives.
- Why alternatives were rejected, with **direct, click-through source evidence**.
- Relevant repository files or code symbols when reliably available.
- Search and question answering grounded only in retrieved evidence.

### 1.3 One-sentence pitch

> DevRecall turns messy GitHub engineering conversations into a verifiable decision history so developers can see *what was decided, what was rejected, and why*.

### 1.4 Success criteria

- Extract at least one useful, nontrivial decision from representative publicly available technical discussions.
- Preserve evidence for every concrete accepted/rejected rationale.
- Differentiate **accepted**, **rejected**, **proposed**, **contested**, and **uncertain** when the conversation does not settle the matter.
- Produce meaningful search and answers on **unseen** discussions, not fixture-specific outputs.
- Pass automated backend and frontend checks in GitHub Actions.

---

## 2. Source-derived Hackathon Requirements (Mandatory)

From the uploaded official Hacktoberfest 2026 PDF, Problem 06 explicitly expects:

1. Analyze public discussions, issues, pull requests and technical threads.
2. Extract technical decisions and their reasoning.
3. Identify rejected alternatives and explain their rejection.
4. Link decisions to relevant source code.
5. Keep original discussion references for traceability.
6. Surface historical decisions when a new pull request changes associated code.
7. Make every extracted decision verifiable.

**Organizer evaluation:** Participants receive **Python PEP discussions without the corresponding PEP** and are evaluated on recovering rejected ideas and why they were rejected. Design the MVP around this criterion. Linking to code and automatic PR warnings are important but secondary to this test.

**General event rules:** New, empty public repository; first commit contains only `HACKATHON.md`; public repository URL due **8:30 PM, 31 October 2026**; later changes via PRs; MIT or Apache-2.0 license; mandatory README, CI, PR template and `examples/` with real input/output. Use public data only. Do not post automated comments or issues to real open-source projects. Final CI must pass.

**Important track distinction:** Problem 06 is one of Problems 1–7, **not** the special Gemma track. The local-Gemma-only requirements for Problem 08 do not apply. The general rule about open-source/open-weight models doing meaningful work **does** apply.

---

## 3. Scope and Priorities

### P0 — Required Functional MVP (build first)

**P0.1 Import a discussion**
- Allow paste of raw public discussion text in a multiline form.
- Support a title and optional source URL.
- Optionally parse messages in a structured JSON format (speaker, timestamp, body, url) for reliable attribution.
- Assign immutable message IDs to support source evidence references.
- **No need to import the final PEP** for the judging workflow.

**P0.2 Extract decisions and alternatives using a real LLM**
- Send discussion segments to the configured open-weight model.
- Output strict structured JSON, not unconstrained prose.
- Extract `decision_title`, `question`, `chosen_approach`, `status`, `summary`, `alternatives[]`, `rationales[]`, `related_code_refs[]`, `uncertainties[]`.
- Each alternative gets `name`, `status`, `rejection_reason` (if applicable), and `evidence[]`.
- Preserve multiple or evolving viewpoints: an early proposal must not be labeled a final decision just because it appeared first.

**P0.3 Evidence validation**
- For each claim or reason, require at least one evidence reference to an imported message and an **exact short quote** copied from that message.
- Validate that the quote occurs in the referenced message (whitespace normalization allowed); reject or flag unsupported evidence.
- Use `source_url` / message anchor if available; otherwise open the imported message in the UI.
- If evidence is missing, display **Unverified / Insufficient evidence**, not a fabricated explanation.

**P0.4 Store and explore**
- Persist imported discussions, messages, extraction runs, decisions, alternatives, and evidence in SQLite.
- Show a decisions list and detail view with rejection reasons, speaker/message provenance and clickable evidence.
- Provide keyword search across titles, chosen approaches, alternative names and rationale text.

**P0.5 Grounded Ask DevRecall**
- User types a question such as: "Why was option X rejected?"
- Retrieve relevant stored decisions/message excerpts, ask the configured model to answer **only from evidence**, return an answer with cited message IDs and source URLs.
- On missing support, answer "I couldn't verify that from the imported discussion".

**P0.6 Real fixtures and tests**
- Include at least one public discussion input and the **actual output generated** by the app in `examples/`.
- Include a small synthetic unit-test fixture with unambiguous accepted and rejected choices (clearly label it synthetic).
- Unit tests validate exact evidence and honest uncertainty; integration tests validate the processing pipeline.

### P1 — Important if P0 is working

- Import public GitHub issues and pull requests via GitHub REST API (`owner/repo`, issue/PR number), including pagination and rate-limit handling.
- Extract links to source files, paths, API symbols, or commits where explicitly mentioned.
- Compare code file paths changed by a manually supplied PR and surface relevant historical decisions with explanations.
- Add loading/progress/error states, re-run extraction, and export decisions as JSON/Markdown.

### P2 — Stretch goals, not worth sacrificing P0

- GitHub webhook or GitHub App that posts **draft previews in DevRecall only**; don't post to live repos without authorization.
- Automatic matching of renamed/moved files.
- Semantic vector search, cross-repository identity resolution, large-scale ingestion, graph visualization, advanced user auth.

### Explicit non-goals for MVP

- No automatic modification of upstream repositories.
- No ungrounded "AI summary" presented as confirmed project policy.
- No reliance on a cloud-based proprietary LLM for core functionality.
- No scraping private repos or private user data.
- No requirement to prove a complete historical decision if discussion evidence is inconclusive.

---

## 4. Target Users and Use Cases

**Maintainer:** "A new PR changes the database access layer. What previous tradeoffs should reviewers know?"  
**New contributor:** "Why wasn't the alternative proposal accepted?"  
**Evaluator:** "Here is a PEP discussion, but not the PEP itself. Recover rejected options and supporting reasons."

### MVP user journey

1. Open DevRecall.
2. Select **Paste Discussion** (or later **Import from GitHub**).
3. Enter discussion title, optional public URL, and text/messages.
4. Click **Analyze Discussion**.
5. Real model returns proposed decision candidates; application validates citations.
6. User opens a decision and sees chosen approach, rejected alternatives, reasons, and evidence quotes.
7. User asks a question; the answer links back to the evidence.
8. User can export JSON/Markdown and independently check every supported claim.

---

## 5. Technical Architecture

### Recommended hackathon stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Fast, accessible UI with little setup |
| Backend | Python 3.11+ + FastAPI + Pydantic | Robust schema validation and good AI tooling |
| Data | SQLite + SQLAlchemy | Simple local deployment and relational evidence records |
| LLM | Ollama HTTP API, configurable open-weight model | Genuine local AI extraction without API keys |
| GitHub import | GitHub REST API + `httpx` | Public issues/PRs and message URLs |
| Search | SQLite FTS5, fallback to SQL LIKE | No extra search service |
| Testing | pytest, Vitest (or frontend build check) | CI-friendly reliability |
| CI | GitHub Actions | Required for PR and final submitted commit |

Make the architecture modular enough to swap the model without rewriting extraction logic. A **single application server** is sufficient; avoid microservices, queues, Docker dependencies or vector DBs until required.

### Data flow

```text
Discussion text / Public GitHub issue / PR
                |
                v
      Ingestion + normalization
                |
                v
   Messages with stable source IDs
                |
                v
       Local open-weight LLM
                |
                v
  Structured JSON + evidence anchors
                |
                v
     Pydantic schema validation
                |
                v
  Quote/source verification + uncertainty
                |
                v
     SQLite decision knowledge base
                |
           +----+-----+
           |          |
           v          v
    Decision UI    Search / Q&A
                      |
                      v
            Evidence-linked answer
```

### Suggested repository structure

```text
HACKATHON.md
README.md
LICENSE
.env.example
.gitignore
.github/
  pull_request_template.md
  workflows/
    ci.yml
backend/
  pyproject.toml
  app/
    main.py
    config.py
    database.py
    models.py
    schemas.py
    api/
      discussions.py
      decisions.py
      search.py
      ask.py
    services/
      ingest.py
      github_client.py
      llm.py
      extraction.py
      evidence.py
      retrieval.py
  tests/
    test_evidence.py
    test_extraction.py
    test_api.py
frontend/
  package.json
  src/
    App.jsx
    api.js
    components/
      DiscussionImport.jsx
      DecisionList.jsx
      DecisionDetail.jsx
      EvidencePanel.jsx
      AskPanel.jsx
examples/
  sample_discussion.json
  sample_output.json
  HOW_TO_REPRODUCE.md
```

If speed requires fewer files, group services pragmatically but preserve separation between ingestion, AI inference, **evidence checking**, and storage.

---

## 6. Data Model

**Discussion**
- `id` UUID/string PK
- `title` string required
- `source_type` enum: `paste`, `github_issue`, `github_pr`, `forum`
- `source_url` nullable string
- `repo_full_name` nullable string
- `created_at` timestamp

**Message**
- `id` string PK, unique within database
- `discussion_id` FK
- `external_id` nullable string
- `author` nullable string
- `body` text required
- `source_url` nullable string
- `created_at` nullable timestamp
- `sequence_number` integer

**ExtractionRun**
- `id` PK
- `discussion_id` FK
- `model_name` string (actual configured model)
- `model_provider` string
- `status` enum `pending`, `running`, `completed`, `failed`
- `error_message` nullable
- `created_at`, `completed_at` nullable

**Decision**
- `id` PK
- `discussion_id` FK
- `extraction_run_id` FK
- `title` string
- `question` string nullable
- `chosen_approach` string nullable
- `status` enum `accepted`, `rejected`, `proposed`, `contested`, `uncertain`
- `summary` text
- `confidence` enum `high`, `medium`, `low` (**not** a numeric certainty guarantee)
- `code_refs` JSON list of explicit paths/symbols; may be empty
- `uncertainties` JSON list

**Alternative**
- `id` PK
- `decision_id` FK
- `name` string
- `status` enum `accepted`, `rejected`, `proposed`, `contested`, `uncertain`
- `reason` text nullable (why accepted or rejected)

**Evidence**
- `id` PK
- `decision_id` FK
- `alternative_id` FK nullable
- `claim_type` e.g. `decision_status`, `chosen_approach`, `alternative_status`, `rejection_reason`
- `message_id` FK
- `quote` text (actual excerpt, maximum recommended 300 chars)
- `source_url` nullable string
- `verified` boolean

**Important:** A decision may have multiple alternatives and many evidence references. Unknown outcomes stay unknown; do **not** infer acceptance simply because one approach appears later in a discussion.

---

## 7. AI Extraction Specification

### 7.1 Extraction strategy

1. Normalize messages and attach stable IDs, e.g. `msg_0001`.
2. Chunk long discussions on **message boundaries**, with modest overlap. Preserve message IDs and source URLs.
3. Ask LLM for candidate structured decisions and candidate evidence quotes. Run with low temperature if supported.
4. Validate JSON with Pydantic; retry once with an explicit schema-repair instruction on malformed output.
5. Verify **every quoted piece of evidence** against the actual source message.
6. Merge duplicate candidates by the *underlying technical question* across chunks, without deleting contradictory viewpoints.
7. Reconcile status only where discussion evidence permits; otherwise mark `contested` or `uncertain`.
8. Store model name, extraction timestamp, and validation results for transparency.

### 7.2 Required model instruction

Use an instruction equivalent to:

> You are analyzing an engineering discussion, not the final specification. Extract technical decisions, considered approaches, rejected alternatives and the reasons for rejection. Use ONLY the provided discussion. For every asserted outcome and reason, provide the source message ID and a short **exact quote** from that message. Do not infer consensus from silence, the most recent comment, or general knowledge. If the outcome or reasoning is not established, mark it uncertain. Return valid JSON matching the schema. Never invent message IDs, links or source quotes.

### 7.3 Example extraction shape (illustrative schema, **not real output**)

```json
{
  "decisions": [
    {
      "title": "Choose persistence mechanism",
      "question": "How should records be persisted?",
      "chosen_approach": "Relational storage",
      "status": "accepted",
      "summary": "Participants explicitly settled on relational storage.",
      "confidence": "high",
      "alternatives": [
        {
          "name": "Flat files",
          "status": "rejected",
          "reason": "Concurrent updates were a concern.",
          "evidence": [
            {
              "message_id": "msg_0004",
              "quote": "Flat files won't handle concurrent updates safely."
            }
          ]
        }
      ],
      "evidence": [
        {
          "message_id": "msg_0009",
          "quote": "Let's proceed with relational storage."
        }
      ],
      "code_refs": [],
      "uncertainties": []
    }
  ]
}
```

The above only illustrates formatting. Tests and demos must not hard-code those answers into runtime behavior.

### 7.4 Grounded question answering

- Retrieve top matching **stored decisions and actual message evidence** via FTS5/keyword search.
- Supply only retrieved evidence in the answering prompt; enumerate source IDs.
- Force response schema: `answer`, `supporting_message_ids[]`, `uncertainty_note`.
- Verify all cited message IDs exist and were part of the retrieval set.
- If retrieval fails or answer unsupported, return an explicit uncertainty response.
- Show clickable citations in the frontend rather than only raw model text.

### 7.5 Model and runtime failures

- Show understandable errors if Ollama is offline or model not installed; never substitute fake results.
- Provide `.env.example` with `OLLAMA_BASE_URL=http://localhost:11434` and `OLLAMA_MODEL=<model actually installed>`.
- Health endpoint should report model availability separately from server status.
- Log errors without exposing prompts that contain sensitive data; restrict inputs to public text.

---

## 8. API Contract

Base prefix: `/api` (JSON unless stated).

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Server/database status and configured model availability |
| `POST` | `/api/discussions` | Import pasted discussion and normalized messages |
| `POST` | `/api/discussions/{id}/analyze` | Start/run actual extraction and evidence validation |
| `GET` | `/api/discussions/{id}` | Discussion metadata, source messages and runs |
| `GET` | `/api/discussions/{id}/decisions` | Extracted decisions with summary/status |
| `GET` | `/api/decisions/{id}` | Full decision, alternatives, evidence and source links |
| `GET` | `/api/search?q=...` | Search decisions and reasons |
| `POST` | `/api/ask` | Grounded question answering, optionally scoped to a discussion |
| `POST` | `/api/github/import` | P1: import public GitHub issue/PR |
| `POST` | `/api/pr-context` | P1: list decisions relevant to changed file paths |

### `POST /api/discussions` example

```json
{
  "title": "Discussion on a design choice",
  "source_type": "paste",
  "source_url": "https://example.org/public-thread",
  "messages": [
    { "author": "Contributor A", "body": "Let's consider approach X." },
    { "author": "Contributor B", "body": "X will not handle concurrent updates." }
  ]
}
```

Also support `raw_text` as an alternative to `messages`, but reject requests where both are empty. For unstructured paste input, either treat it as a single message with honest limits or parse known separators without inventing author attribution.

### `POST /api/ask` example

```json
{
  "question": "Why was approach X rejected?",
  "discussion_id": "discussion-id"
}
```

Response should include structured citations, e.g. `[{"message_id":"msg_0002","source_url":"...","quote":"..."}]`, plus a transparent `uncertainty_note` if needed.

### API safety and reliability

- Pydantic validation for all inputs/outputs.
- Bound text size, message count, model timeout and GitHub pages to avoid runaway ingestion.
- Sensible HTTP status codes (400 invalid input, 404 unknown ID, 429 upstream rate limit, 503 model unavailable, 500 unexpected error).
- CORS configured to the known local frontend origin; do not enable arbitrary origins in production.
- No arbitrary execution of imported discussion code.

---

## 9. UI/UX Requirements

**Design direction:** Clean developer tool, GitHub-inspired, modern but lightweight. Dark mode default is acceptable; accessibility is more important than animations.

### Main screens

**A. Dashboard**
- Header: DevRecall and tagline.
- Primary CTA: **Analyze a Discussion**.
- Recent imported discussions; count of extracted decisions.
- Honest health indicator showing whether local model is ready.

**B. Import screen**
- Tab: **Paste Discussion** (P0); **GitHub URL** (P1).
- Discussion title, public source URL (optional), large multiline input.
- Support JSON messages for high-quality citation mapping.
- Analyze button, spinner, clear errors for empty input/model offline.

**C. Decision results**
- Decision title, status indicator (`Accepted`, `Proposed`, `Contested`, `Uncertain`).
- Selected approach (only when supported).
- Separate **Rejected alternatives** section with reasons.
- An expandable **Evidence** panel for each assertion showing exact quote, speaker, and source link or original imported message.
- Mark unsupported interpretations clearly.
- Link to original source discussion.

**D. Ask DevRecall**
- Search/query field with examples, e.g. "Which alternatives were rejected and why?"
- Show concise answer with evidence links and an "Insufficient evidence" state.

### UI acceptance requirements

- Works at common laptop widths and mobile width.
- All actionable controls work; no placeholder buttons.
- No fabricated counts, citations, "verified" badges or demo outputs.
- Loading, failed model connection, zero results and empty input states exist.
- Keyboard navigation and readable contrast.

---

## 10. Code Relevance / PR Context (P1)

A discussion may mention `src/auth.py`, a module, function or package. Extract and store only **explicitly supported** references. For a proposed PR, accept `owner/repo` and PR number or a list of changed file paths. Match normalized paths/symbols to decision code references; surface matched decisions with source evidence and a **reason for the match**.

Do not claim semantic relevance if only a loose keyword matches. In the MVP, show **suggested historical context**, not a definitive incompatibility verdict. Do not post automated comments to public projects.

---

## 11. Test Plan and Judge-readiness

### 11.1 Unit tests (must pass offline without downloading a model)

- Import rejects empty content.
- Message IDs remain stable after persistence and retrieval.
- Evidence verifier accepts exact quotes present in the referenced message.
- Evidence verifier rejects made-up quotes and nonexistent message IDs.
- Missing evidence forces the relevant assertion to `uncertain`/unverified or marks it visibly unverified.
- Contradictory comments are not silently collapsed into accepted consensus.
- Search returns decisions containing matching rejected alternatives.
- API returns appropriate errors if the model is not running.

**Mock only the LLM adapter** in unit tests; keep actual inference for an explicit integration/demo test. Never call mocked inference a real demonstration.

### 11.2 Integration tests

- Input -> normalize -> model adapter -> schema -> evidence verifier -> SQLite -> API retrieval.
- A prewritten synthetic fixture gives an explicit final choice and two rejected options; validate that evidence references resolve.
- A second fixture has disagreement **without resolution**; must not output a confidently accepted solution.
- Optional live local-model smoke test when `RUN_LLM_TESTS=1`.

### 11.3 Organizer-style evaluation (crucial)

Create a repeatable evaluation script, e.g. `python backend/scripts/evaluate_discussion.py --input examples/public_discussion.json`:

1. Choose a **public** Python PEP discussion with a corresponding known PEP.
2. Provide **only discussion messages** to DevRecall, not the PEP text, PEP title/decision section as context, or model-specific prefilled answers.
3. Save generated alternatives, reasons, cited message IDs, model used, and runtime metadata to `examples/`.
4. Compare afterward with the PEP's recorded rejected ideas and reasoning (human-readable review is acceptable).
5. Check **evidence correctness** separately from **coverage**. A plausible claim without supporting discussion evidence does not pass.
6. Note omissions and uncertainties honestly in README; don't claim benchmark performance without measuring it.

Suggested manual scoring categories (internal, **not organizer scoring**):
- Rejected alternatives identified.
- Reasons faithfully recovered.
- Citation accuracy (quote actually exists in source message).
- Incorrect confidently asserted outcomes (must minimize).
- Usability/reproducibility.

---

## 12. Implementation Order for Codex

Complete stages sequentially; commit each coherent change on a feature branch and submit via PR per event rules.

### Stage 0 — Repository compliance (first)

- Verify initial commit contains only `HACKATHON.md` and repository is public.
- If first commit has not occurred, **stop file additions** and instruct user to perform that first commit.
- After first commit, create a feature branch before adding files.

### Stage 1 — Working backend skeleton

- FastAPI app, SQLite models, health route, config, CORS, input schemas.
- `POST /api/discussions`, message normalization, persistence, `GET` routes.
- Unit tests and basic README commands.

### Stage 2 — Real AI extraction and evidence checker

- Ollama adapter and configured model availability check.
- Strict JSON extraction prompt, response parsing, retry on malformed JSON.
- Quote/source validator, uncertainty enforcement, extraction persistence.
- Unit tests for failure/uncertainty cases.

### Stage 3 — Frontend end-to-end

- Import form, run extraction, browse decisions, evidence quote panel, error states.
- Validate real backend requests from UI.

### Stage 4 — Search and grounded Q&A

- Keyword/FTS5 retrieval and evidence-only answer flow.
- Render source anchors and abstentions correctly.

### Stage 5 — Compliance and demo

- Mandatory README, `LICENSE`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`, `examples/` with actual input/output.
- CI install + tests + frontend build on each PR.
- Full local run-through with an unseen discussion; update actual model info in HACKATHON.md by PR.

### Stage 6 — P1 only if time remains

- Public GitHub import; code references; manual PR file-path context.

**Do not sacrifice correct P0 evidence validation for fancy design, semantic search, or webhook automation.**

---

## 13. README and Setup Requirements

README must contain:

- What problem DevRecall solves; Problem 06 affiliation.
- Architecture and actual implemented features (separate from planned).
- Prerequisites: Python, Node, Ollama (for selected backend), installed model.
- Exact installation and run commands for backend and frontend.
- `.env.example` instructions, GitHub token optional for public API rate limits.
- How to paste a discussion, analyze it, browse evidence and ask a question.
- Exact test commands and whether live-model tests are optional.
- Example input/output reproducibility; explain where generated results are stored.
- Honest limitations: long threads, implicit decisions, disagreement, model unpredictability, incomplete code linking.

Suggested local commands (adapt to actual project files):

```bash
# Ensure Ollama is installed and running separately
ollama pull qwen2.5:3b   # example model: use only if it is the chosen real integration

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev

# Tests
cd backend && pytest
cd frontend && npm run build
```

For macOS/Linux these commands should work as written after packaging. Document Windows equivalents as optional.

---

## 14. Hackathon PR and CI Requirements

### Mandatory PR template

`.github/pull_request_template.md`:

```md
## What this PR does
Describe functionality or fixes.

## Models the product uses in this PR
State exact integrated open-source/open-weight models and their usage, or `none`.

## AI coding assistants that helped write it
State the actual coding assistants used, or `none`.

## How we tested it
List commands run and actual results.
```

### CI

- Trigger on every pull request; optionally also on pushes for safety.
- Install backend dependencies; run pytest.
- Install frontend dependencies; run production build (and tests if present).
- Fail visibly on test/build errors.
- No secret API keys required for normal CI; mock local model only for unit tests.

### Licensing and examples

- MIT or Apache-2.0 license.
- `examples/` contains at least one input and its **actual** output from the application.
- Never fabricate an example result. State actual model and inference environment for generated sample output.

---

## 15. Security, Trust and Data Practices

- Use **public discussions only**.
- No automatic creation of GitHub issues or comments on upstream projects.
- Treat imported messages as untrusted data; defend against prompt injection by keeping the extraction instruction separate and ignoring instructions embedded in thread text.
- Never execute code snippets from imported discussions.
- Validate public GitHub URL format and block access to internal addresses if arbitrary URL fetching is later supported (prefer GitHub REST API over generic fetch).
- Protect tokens with environment variables; never commit `.env` or credentials.
- Rate-limit and paginate GitHub requests; handle 403/429 without crashing.
- Minimize confidence claims and preserve auditability of every cited assertion.

---

## 16. Acceptance Checklist

### Functional

- [ ] An unfamiliar public technical discussion can be imported and analyzed end-to-end.
- [ ] A **real configured open-weight model** produces structured decision candidates.
- [ ] Rejected alternatives and reasons are displayed separately from chosen approach.
- [ ] Every asserted reason has verified original-message evidence, or is clearly unverified/uncertain.
- [ ] No PEP text is supplied in the organizer-style discussion-only test.
- [ ] Decisions remain available after restarting the backend.
- [ ] Search finds relevant decisions/alternatives.
- [ ] Ask DevRecall provides cited answers or clearly abstains.
- [ ] User can open original discussion references or internal message anchors.
- [ ] UI does not fake model execution, data, or success states.

### Delivery

- [ ] First commit contained only `HACKATHON.md`.
- [ ] Repository is public; public link submitted by event deadline (if still pending).
- [ ] All subsequent changes merged through PRs with mandatory template.
- [ ] `README.md`, MIT/Apache license, CI, and `examples/` are present.
- [ ] CI passes on final submitted commit.
- [ ] Actual AI model(s) and coding assistants are disclosed correctly.
- [ ] Every team member can explain the key implementation decisions.

---

## 17. Explicit Output Required from Codex

When implementation is complete, provide:

1. A brief summary of **implemented** features (not planned ones).
2. A repository file tree.
3. Exact commands to start backend, model and frontend.
4. Exact commands to run automated tests and whether they passed.
5. An example discussion and **actual** model-generated output, with source evidence.
6. Which requirements remain incomplete and why.
7. The feature branch/PR workflow followed, without falsely claiming a PR was created or merged.

**Immediate priority:** Make the PEP-discussion-style decision extraction and evidence traceability work before optional enhancements.
