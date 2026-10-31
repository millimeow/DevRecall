# Reproducible examples

No fictional successful extraction or answer is included here.

## Real input

```json
{ "url": "https://github.com/pallets/flask" }
```

Verification request:

```sh
curl -sS http://127.0.0.1:3001/api/v1/repositories/resolve \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://github.com/pallets/flask"}'
```

An initial live request returned HTTP 403 with `x-ratelimit-remaining: 0`. After GitHub's reset time, the real application successfully resolved Flask to GitHub repository ID **596892**. The actual response is saved in [live-resolve-output.json](live-resolve-output.json). [live-health-output.json](live-health-output.json) records the actual unconfigured AI state. These are real application outputs, not fixture metadata.

No running model was configured. Therefore a successful real-repository decision/answer with audited citations **has not been recorded**. A metadata-resolution success is not a claim of completed Flask indexing or actual model quality.

The application also added `https://github.com/millimeow/DevRecall`, resolved its real GitHub ID **1440959880**, queued a durable job and completed PR enumeration. At capture time this repository had **zero PRs**; [live-index-output.json](live-index-output.json) records the genuine completed empty-corpus job and zero DB metrics. No inference was needed for an empty corpus. This proves the real add/queue/poll/database path, not PR-conversation extraction or AI quality. A subsequent implementation PR changes that upstream snapshot and requires Sync.

After configuring credentials/model, add the same URL at `/api/v1/repositories`, poll its returned job, then ask a specific question using the real returned numeric repo ID:

```json
{ "question": "Which approaches were explicitly rejected and why?" }
```

Save the actual response and inspect each `citations[].html_url` against its exact `excerpt` before submitting a successful hackathon example. Test fixtures in `fixtures/` and HTTP/model doubles in `server/test` or `web/test` are explicitly synthetic and never count as real outputs.
