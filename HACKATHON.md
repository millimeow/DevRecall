# DevRecall — Hacktoberfest 2026

Problem 06: Open Source Decision Intelligence and Knowledge Recovery.

Recover engineering decisions from public GitHub pull requests and their conversations, with verifiable source citations.

Stack: React, Tailwind CSS, Node.js, Express, TypeScript, SQLite/FTS5, configurable open-weight AI.

## Existing team registration

Carried forward from the target repository's existing public registration:

- Team: mili meow
- Members: Aayush Ray, Anindya Sarkar, Svarnim, Arundhati Singh
- Event: Hacktoberfest 2026 — Hack Day Sonipat, 31 October 2026
- Venue: Newton School of Technology, Rishihood University, Sonipat

## Current implementation

PRD v3 supersedes the older FastAPI/PostgreSQL/MongoDB plans. Input is public GitHub repository URLs only; ingestion is PR conversations only. The user-requested local acceptance profile is **Qwen3.5 4B Q4_K_M via Ollama**, Apache-2.0, tested on an M4/16 GB Mac with 8K context. Extraction uses source-bounded JSON and non-thinking mode; chat uses thinking mode. Actual real-GitHub outputs and a separately labeled synthetic PEP evaluation are in `examples/`. Fresh installs require explicit model configuration. Older application/model executions remain in the preserved Git history and are not claims about this implementation.

AI coding assistant: OpenAI Codex. The application requires explicit model configuration and never substitutes fictional analysis.

This initial commit contains only HACKATHON.md. Subsequent implementation is developed on feature branches for pull-request review. No official event PDF was included among the supplied files; event compliance beyond the supplied requirements remains to be verified.
