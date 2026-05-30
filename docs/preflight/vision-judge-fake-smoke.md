# Vision Judge Fake Smoke

Generated: 2026-05-30T14:32:04.841Z

| Scenario | Status | Details |
| --- | --- | --- |
| fake-scripted-pass | PASS | Fake judge returned the explicit passing verdict and recorded the call. |
| fake-fail-then-pass | PASS | Queued fake verdicts drove fail then pass and preserved regenerateFeedback. |
| fake-failure-injection | PASS | Fake judge injected timeout/http/parse/safety failures and recorded each call. |
| fake-rejects-relative-path | PASS | Fake judge rejects relative image paths with parse after recording the call. |
| fake-deterministic-no-mutation | PASS | Fake judge returns deep clones; caller mutation did not alter the queued verdict. |
| openai-builds-vision-request | PASS | OpenAI judge built chat-completions JSON-mode request with auth, prompt criteria, and PNG data URL. |
| openai-parses-fenced-json | PASS | OpenAI judge parsed a single fenced json block through parseJudgeVerdict. |
| openai-timeout | PASS | OpenAI judge maps pre-response and body-read timeout to timeout. |
| openai-http-error-tail | PASS | Readable non-2xx maps http with bounded tail; unreadable non-2xx stays http even with content_policy in thrown text. |
| openai-safety-error | PASS | Readable full body safety/refusal markers, including suffixed policy variants, map safety even when outside the retained tail. |
| openai-content-filter-safety | PASS | 2xx finish_reason=content_filter maps to safety. |
| openai-message-refusal-safety | PASS | 2xx non-empty message.refusal maps to safety. |
| openai-fetch-rejection | PASS | OpenAI fetch rejection maps to http with cause. |
| openai-image-read-error | PASS | Missing absolute image file maps to parse with fs cause and no fetch. |
| openai-parse-invalid-json-response | PASS | Malformed chat-completions JSON maps to parse. |
| openai-parse-missing-message | PASS | Response missing choices[0].message.content maps to parse. |
| openai-parse-invalid-verdict | PASS | Invalid JudgeVerdict maps to parse and preserves JUDGE_VERDICT_INVALID cause. |
| openai-parse-criteria-id-mismatch | PASS | Criterion id mismatch smoke covered missing, extra, and wrong id variants as parse. |
| openai-rejects-relative-path | PASS | OpenAI judge rejects relative image paths before fetch. |
| google-builds-vision-request | PASS | Google judge mapped Gemini 3.1 Pro alias to gemini-3-pro-preview and built a JSON request with PNG inline data. |
| google-model-unavailable-fallback | PASS | Google judge falls back from unavailable Gemini 3 alias to stable gemini-2.5-pro. |
| google-parses-string-wrapped-verdict | PASS | Google judge parses JSON-string-wrapped verdict text before strict validation. |
| google-parses-deep-string-wrapped-verdict | PASS | Google judge unwraps repeated JSON-string verdict layers before strict validation. |
| google-parses-single-array-wrapped-verdict | PASS | Google judge unwraps one-item verdict arrays before strict validation. |
| google-parses-criteria-array-verdict | PASS | Google judge synthesizes JudgeVerdict from exact-id criterion arrays plus summary rows. |
| google-parses-ordered-criteria-array-verdict | PASS | Google judge synthesizes JudgeVerdict from ordered criterion arrays when row count exactly matches the spec. |
| google-safety-error | PASS | Google SAFETY finishReason maps to safety. |
| google-parse-invalid-verdict | PASS | Google invalid JudgeVerdict maps to parse. |
| google-rejects-relative-path | PASS | Google judge rejects relative image paths before fetch. |
| vision-judge-fallback-logs-and-skips-safety | PASS | Vision fallback logs one explicit event on http failure and does not fall back on safety. |
| vision-judge-static-boundary-check | PASS | Static boundary checks passed against implementation base HEAD^. |

## Coverage

- Fake judge: explicit scripted queue, fail-then-pass sequencing, failure injection, relative-path rejection, deep-clone determinism.
- OpenAI judge: chat-completions request shape, PNG data URL, fenced JSON parsing, timeout/http/parse/safety mappings, image-read pre-fetch failure, criterion-id exactness.
- Google judge: Gemini alias request shape, stable-model fallback on unavailable model ids, string/array-wrapped JSON verdicts, id-matched and ordered criterion-array verdict normalization, safety/parse mappings, relative-path rejection.
- Static boundary: no OpenAI SDK dependency, no provider env reads, fake judge hermeticity, package script-only change, declared implementation file scope.
