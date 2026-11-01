# Local model on a 16 GB Apple Silicon Mac

Use **`qwen3.5:4b-q4_K_M` through Ollama**. This pins the 4-bit GGUF variant, rather than the backend-dependent `qwen3.5:4b` alias. The 4B size leaves room for macOS, DevRecall and the context cache; larger model weights fitting on disk does not establish that their runtime memory fits comfortably.

```sh
brew install ollama
brew services start ollama
ollama pull qwen3.5:4b-q4_K_M
```

The service starts at login and listens on localhost. The model runs on the Mac; GitHub REST remains the only external data source in this workflow. No cloud inference provider is configured.

In the private, gitignored project `.env`:

```dotenv
AI_PROVIDER=ollama
AI_MODEL=qwen3.5:4b-q4_K_M
AI_BASE_URL=http://127.0.0.1:11434
AI_TIMEOUT_MS=240000
AI_CONTEXT_CHARS=10000
AI_NUM_CTX=8192
AI_NUM_PREDICT=3072
AI_THINK=true
AI_EXTRACTION_THINK=false
```

Restart DevRecall after editing `.env`. `AI_CONTEXT_CHARS` bounds source text, while `AI_NUM_CTX` controls Ollama's actual token context. Output is capped separately. Extraction jobs are sequential; avoid running additional model-heavy applications during large scans.

The adapter sends the extraction/answer JSON schema to Ollama with citation choices bound to actual source fragments, validates the result, and then independently verifies source ownership and exact quotes. Thinking mode is enabled for chat because a controlled test found that the faster non-thinking mode falsely abstained on a supported question. Bulk extraction uses non-thinking mode: an all-thinking extraction run exhausted its generation budget before returning JSON, while source-bound non-thinking extraction completed. These are explicit per-task settings, not a cloud fallback. A schema-valid response can still misinterpret evidence; the citations are there for inspection. Invalid evidence is rejected, with durable progress retained for Resume.

## Why the explicit quantization matters

On this machine, Ollama 0.40.13 resolved the plain `4b` tag to an MLX/nvfp4 variant. Its structured-output probe returned HTTP 501, `structured output is unavailable`. The explicit `4b-q4_K_M` tag selected llama.cpp/GGUF and passed the same JSON-schema probe. This is a runtime/backend compatibility observation, not a general claim that MLX models are unsuitable.

The successful small probe reported 100% GPU placement, 8,192 context tokens and approximately 3.3 GB of model allocation. Its cold request took 3.659 seconds; 12 generated tokens measured about 32 tokens/second. These are a tiny local diagnostic, not a long-context benchmark or accuracy score. The model allocation is not total system RAM use.

## Verify and use

```sh
ollama ps
curl -s http://127.0.0.1:3001/api/v1/health
```

The health result should show `configured: true`, provider `ollama`, and the explicit model tag. In the app, add `https://github.com/simonw/sqlite-diffable`, verify its real metadata and Analyze. This small independent repository supports a full-history test without sampling. The Flask/Django/CPython demos remain available but take much longer.

Useful questions for this repository:

- Why was the `--exclude` option proposed for dumping tables?
- Who said “This is great, thank you very much” about the exclude change?
- What rationale was recorded for adopting a quantum-entanglement database engine? (This should report insufficient evidence.)

For practical indexing set a GitHub read-only token privately, or launch the backend with an existing Git credential held in memory. The live setup used the existing Git credential only in the backend process; no GitHub credential was written into `.env`, examples, browser state or source. A future plain `npm run dev` without such a token uses GitHub's smaller unauthenticated budget.

## Sources

- [Official model tags](https://ollama.com/library/qwen3.5/tags)
- [Qwen's model card and Apache-2.0 license](https://huggingface.co/Qwen/Qwen3.5-4B)
- [Ollama structured output](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama thinking controls](https://docs.ollama.com/capabilities/thinking)
- [Ollama context memory guidance](https://docs.ollama.com/context-length)
