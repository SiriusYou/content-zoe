# Image Provider Fake Smoke

Generated: 2026-05-30T13:39:03.520Z

| Scenario | Status | Details |
| --- | --- | --- |
| fake-writes-manifest-valid-png | PASS | runStage accepted image_exists/image_format/image_dimensions for 1024x1024.<br>PNG has 1 IDAT chunk(s), valid CRCs, and 4195328 decompressed bytes. |
| fake-records-feedback-and-calls | PASS | Fake provider recorded spec/path/timeout/feedback and exposed lastFeedback before writing. |
| fake-failure-injection | PASS | Fake timeout failure injection records the call and writes no file. |
| fake-deterministic-bytes | PASS | Repeated fake generations for the same spec produced byte-identical valid PNGs. |
| fake-rejects-relative-output-path | PASS | Fake provider rejects relative output paths with parse error and no parent creation. |
| openai-default-gpt-builds-request-and-writes-b64 | PASS | Default GPT image request used POST/auth/JSON, omitted response_format, and wrote decoded bytes. |
| openai-dalle-requests-b64-format | PASS | DALL-E image request used the custom endpoint and included response_format=b64_json. |
| openai-prompt-contains-spec-and-feedback | PASS | OpenAI prompt included all ImageSpec fields and regeneration feedback. |
| openai-timeout-maps-error | PASS | OpenAI timeout covers pre-response and response-body reads with no file. |
| openai-http-error-tail | PASS | OpenAI non-2xx responses mapped to http for readable and unreadable bodies, retaining a bounded tail. |
| openai-safety-error | PASS | OpenAI safety response scans the full safety/policy/content_policy/moderation/unsafe heuristic body and retains a bounded tail. |
| openai-fetch-rejection-maps-error | PASS | OpenAI fetch rejection mapped to http with cause and no file. |
| openai-parse-error-invalid-json | PASS | OpenAI invalid JSON response mapped to parse. |
| openai-parse-error-missing-b64 | PASS | OpenAI response missing data[0].b64_json mapped to parse. |
| openai-parse-error-malformed-b64 | PASS | OpenAI malformed b64 response mapped to parse. |
| openai-rejects-relative-output-path | PASS | OpenAI provider rejects relative output paths before fetch. |
| google-nano-banana-builds-request-and-writes-inline-data | PASS | Google Nano Banana 2 alias built a generationConfig-free request and normalized inline image bytes to PNG. |
| google-safety-error | PASS | Google SAFETY finishReason maps to safety and writes no file. |
| google-parse-error-missing-inline-data | PASS | Google text-only image response maps to parse with a bounded text tail. |
| google-rejects-relative-output-path | PASS | Google provider rejects relative output paths before fetch. |
| image-provider-fallback-logs-and-skips-safety | PASS | Image fallback logs one explicit event on http failure, preserves feedback, and does not fall back on safety. |
| provider-static-boundary-check | PASS | Provider files and package.json satisfied SDK-free static boundary checks. |

## Coverage

- Fake provider: manifest-valid PNG, call/feedback recording, failure injection, deterministic bytes, relative path rejection.
- OpenAI provider: GPT/DALL-E request bodies, prompt coverage, timeout/http/safety/fetch/parse errors, relative path pre-fetch rejection.
- Google provider: Nano Banana 2 alias request, inline image normalization, safety/parse errors, relative path pre-fetch rejection.
- Static boundary: no OpenAI/Google SDK dependency, no provider env reads, fake provider hermeticity.
