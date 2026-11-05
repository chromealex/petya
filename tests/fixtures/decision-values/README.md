# Decision values in Petya 0.8.3

The configured local Ollama model was qwen3.5:9b. We compared a structured extraction request with and without six synthetic demonstration turns. Each new scenario had three endings: defer, accept or replace the proposed value. The nine test notes and expected outputs were prepared before inference. Only the target and discussion were sent for each test question. No bookmark data or user conversations were used.

Both variants used the same system instruction, JSON output, thinking disabled, temperature 0, seed 42 and a 180-token output limit. Request order alternated. Responses passed if the status and both values matched, with null required for deferred decisions and equivalent numeric strings accepted.

| Decision | Baseline | With examples |
|---|---:|---:|
| Deferred | 3/3 | 3/3 |
| Accepted | 3/3 | 3/3 |
| Replaced | 0/3 | 3/3 |

This measures extraction for a named condition on three synthetic topics. It does not measure full Jira drafts or free-form conversations. The demonstration turns were scoped to the requests. Model weights, runtime configuration and application packages were unchanged.
