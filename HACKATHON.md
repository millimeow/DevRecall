# HACKTOBERFEST 2026 — HACK DAY RISHIHOOD

## Team Information

- **Team Name: mili meow 
- **Team Members:**
  - Aayush Ray
  - Anindya Sarkar
  - Svarnim
  - Arundhati Singh

## Selected Problem Statement

**Problem 06 — Open Source Decision Intelligence and Knowledge Recovery**

## Project

**Project Name:** DevRecall  
**Tagline:** Every decision has a reason. Never lose it.

### Problem We Are Solving

Important software design decisions are often buried in GitHub issues, pull requests, reviews, and technical discussions. New contributors struggle to understand why a solution was selected or why other approaches were rejected.

### Proposed Solution

DevRecall aims to recover technical decisions from public open-source discussions and connect each decision to its reasoning, rejected alternatives, relevant code, and original evidence. The tool will help contributors search historical decisions and surface relevant context when code changes are proposed.

### Planned Key Features

1. **Discussion analysis:** Collect public GitHub issues, pull requests, and relevant technical discussion text.
2. **Decision recovery:** Extract accepted decisions, rejected alternatives, and supporting reasoning.
3. **Evidence-backed search:** Answer questions with references to the original discussions.
4. **Code and PR context:** Link decisions to relevant code and highlight relevant past decisions for new pull requests.

## Architecture v2 implementation status

The current implementation follows `CODEX_IMPLEMENTATION_PLAN.md`: FastAPI, PostgreSQL repository/decision index, MongoDB detailed records, and React/Vite/Tailwind. Provider and model selection is pending; production v2 returns explicit unavailable states and does not generate placeholder decisions. The model records below describe historical executions only, not the current v2 configuration.

## AI Models Used and Justification

The historical application used a configurable local open-weight model. Actual executions and validation results are preserved in `examples/`; source-quote verification is separate from model interpretation quality.

| AI Model | How It Is Used | Reason for Selecting It |
| --- | --- | --- |
| Qwen2.5 3B (`qwen2.5:3b`, 3.1B parameters, Q4_K_M) | Local structured decision/alternative extraction and evidence-grounded question answering through the implemented Ollama adapter | Open weights, local inference without API keys, bounded memory use and JSON-schema output |
| OpenAI Codex (coding assistant; exact underlying model version not exposed to the session) | Implementation, tests, documentation and browser verification | Development assistance; not used as the application's extraction model |

**Model execution method:** Ollama HTTP API, runtime version `0.40.13`. Configured model digest: `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b`. The development verification used a temporary runtime and model directory under `/private/tmp/devrecall-ollama`; normal installation instructions are in README.md.

**Historical application stack:** React.js with Next.js 16 App Router frontend; Express.js 5 on Node.js backend; JavaScript throughout application source. SQLite and the Ollama model integration are retained. Historical example outputs remain labeled; new JavaScript-runtime outputs use the `node_` filename prefix.

## Hackathon Details

- **Event:** Hacktoberfest 2026 — Hack Day Sonipat
- **Date:** 31 October 2026
- **Venue:** Newton School of Technology, Rishihood University, Sonipat
- **Track:** Problem 06 (main open-source engineering challenge)

---

*This file is intended to be the only file in the repository's initial commit. All subsequent changes should be submitted through pull requests in accordance with the event guidelines.*
