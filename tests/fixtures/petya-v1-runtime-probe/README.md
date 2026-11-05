# Structured output runtime feasibility

The installed MLX-LM 0.32.2 HTTP server does not expose a JSON-schema response-format implementation in its inspected source. Petya submits both schema objects and `format="json"`, so an adapter service must not silently ignore that contract. Outlines documents an MLX integration with structured generation: [upstream MLX documentation](https://github.com/dottxt-ai/outlines/blob/main/docs/features/models/mlxlm.md).

A separate dependency directory under `/tmp/petya-runtime-research/deps` contains Outlines 1.3.3 and its dependencies; the running training environment was not modified. `additional-requirements.txt` pins these additional packages. The underlying MLX/transformers environment remains the one pinned in `../requirements-draft-v19/evaluation-requirements.txt`. The downloaded wheel, actual dialogue-request source, probe and result hashes are recorded.

`check_grammar.py` loads only the actual tokenizer and constructs a grammar index. All twelve checks passed: Russian identifiers, numeric symbols, optional properties, boolean values, missing/extra fields, wrong types, too many choices, duplicate keys, incomplete JSON and generic object mode. The schema was extracted from the real `dialogueRequest` function. This establishes a feasible structured-output component, not model quality or service readiness.

An initial diagnostic incorrectly appended EOS to `Guide.accepts_tokens` and rejected valid strings. Correct validation consumes grammar tokens, checks `is_finished()`, and verifies EOS in `get_tokens()`. Both ASCII and Russian text pass with that correction. The probe uses this explicit check rather than hiding the discrepancy.

Reproduce from the project root, using the isolated additional dependencies and a new output path:

```sh
PYTHONPATH=/tmp/petya-runtime-research/deps /usr/bin/arch -arm64 /tmp/peter-v10/eval-env/bin/python tests/fixtures/petya-v1-runtime-probe/check_grammar.py BASE_PATH tests/fixtures/petya-v1-runtime-probe/dialogue-schema.json NEW_RESULT.json
```

Future integration must apply the existing chat template exactly once with thinking disabled when requested, compose grammar constraints with the requested repetition penalty and sampler, and validate generated output. Calling the high-level wrapper on an already formatted string can apply the chat template again; directly passing both `logits_processors` and its `output_type` also conflicts with the wrapper's own argument. Use an explicitly composed processor list at the MLX generation boundary. Actual constrained generation, EOS handling in streaming, cancellation, schema compatibility beyond the tested subset, inference artifact identity, concurrency and lifecycle remain unverified. Do not run GPU inference concurrently with the current training job. No application/MCP capability has been added in this research fixture.
