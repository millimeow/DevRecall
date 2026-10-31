# Discussion-only evaluation

`public_discussion.json` preserves the six public comments from [Python issue 45857](https://bugs.python.org/issue45857), migrated to [cpython issue 90015](https://github.com/python/cpython/issues/90015). Authors, dates and per-message source anchors come from the public tracker. HTML links were reduced to their visible text; no comment body was rewritten. Discussion content remains attributable to its original authors under the source's applicable terms; the repository MIT license does not relicense third-party comments.

This is a discussion about a PEP-related implementation, **not the original proposal's entire design thread**. It is a useful discussion-only extraction case but does not demonstrate comprehensive recovery of all rejected ideas in the final PEP. The model receives only the six discussion messages. It is not supplied the PEP text, its decision section, or expected answers.

Follow the README setup, then from the repository root:

```sh
npm run evaluate -- \
  --input examples/public_discussion.json \
  --output examples/node_sample_output.json
```

Start Express, Next.js and Ollama using the README before evaluating. The Node.js evaluator calls the Express API and includes original discussion, immutable source IDs, extraction runs, evidence flags and actual Node runtime metadata. Repeated runs generate new discussion/run IDs and may yield different results. Never hand-edit generated outputs to improve model results.

`synthetic_discussion.json` is an explicitly synthetic input with a settled choice and two rejected alternatives. It exists to make pipeline behavior easy to inspect; it is not a real public discussion or a benchmark result.

Review evidence correctness separately from coverage. A verified quote can still be interpreted incorrectly. Mark reasons absent from this excerpt as unknown, and do not compare against a final specification by silently adding it to the model prompt.

`attempts/`, `sample_output.json`, `synthetic_output.json` and `sample_answer.json` preserve actual historical runs from the initial Python implementation. The JavaScript migration's outputs use the `node_` prefix and include `application_runtime: Node.js / Express`. Historical results are not runtime fallback data or JavaScript-run benchmark claims. See `JAVASCRIPT_MIGRATION.md` for the new verification record.
