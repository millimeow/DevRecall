## Problem and resulting behavior

## Models the product uses in this PR
State exact integrated provider/model/version, or `none — selection pending`.
Do not describe synthetic test-provider output as actual inference.

## AI coding assistants
OpenAI Codex (exact underlying model version not exposed).

## Validation
- [ ] PostgreSQL + MongoDB integration suite (`REQUIRE_DB_TESTS=1 python -m pytest backend/tests -q`)
- [ ] Legacy evaluation regression (`npm run test:legacy`)
- [ ] React/Vite production build (`npm run build`)
- [ ] Actual model evaluation, or explain why not run
- [ ] Evidence correctness reviewed separately from extraction coverage

## Limitations and remaining work
