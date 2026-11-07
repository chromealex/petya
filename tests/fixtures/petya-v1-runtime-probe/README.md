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

The in-development runtime artifact verifier additionally checked the actual frozen base plus original v19 adapter: fourteen files and 6,035,323,454 bytes matched the pinned manifest. `original-development-manifest.json` explicitly labels the bundle as development; `artifact-check.json` records the verifier hash and result. This is an integrity probe, not selection of that adapter for release.

## Root-number completion correction

An expanded raw probe found that the installed grammar accepts the integer prefix `-48` but forbids the next decimal-point token in `-48.25`. This occurs with the empty schema, a number-only schema and an explicit union. `raw-number-diagnostic.json` preserves the failing token trace. The production helper `model-runtime/grammar.py` groups the schema regex and requires a trailing newline, valid JSON whitespace that postpones final-state acceptance until the number is complete. It changes no parsed field or number.

The probe now calls that exact helper by default. All 24 tokenizer checks pass, including scalar decimals, objects, arrays, strings, booleans, null, strict application schemas and rejection of malformed values. `terminated-grammar-result.json` and its provenance preserve the result and source hashes. `--raw` intentionally reproduces the three upstream failures and returns nonzero. Earlier twelve-case evidence remains historical and did not include root decimals. Real GPU generation and broader schema compatibility still need verification.

A separate ARM Python 3.12 virtual environment at `/tmp/petya-runtime-env` has now installed `model-runtime/requirements.txt`. `pip check` reports no broken requirements; the actual freeze and dependency check are preserved. This is a temporary test environment, not a packaged or user-selected installation. It does not alter the training environment. Model loading through this environment and real GPU inference are still pending.

## Real worker and GPU probe

`run-service.cjs` starts the actual supervisor, private-stdin bootstrap, verified local base/replay adapter, MLX engine and authenticated HTTP transport in the isolated environment. The development manifest is pinned by canonical digest and `/api/tags` must advertise the same digest. Four sequential requests passed: the current application's real `dialogueRequest` schema/settings (answer «четыре»), a fractional scalar, generic JSON array and streamed Russian object. Successful streams must contain exactly one done record and valid combined JSON. The worker then exited normally and the final state was stopped. Raw request/response evidence, state transitions and source hashes are preserved in `service-probe-result.json` with separate provenance.

The scalar uses a constant schema to test transport/grammar rather than model competence. The other cases are simple development prompts, not reserved acceptance dialogues. This result proves a working development inference path, not reliable conversation, cross-platform support, packaged installation or release qualification. Application/MCP controls, notifications and routing remain unfinished. Existing application settings and model selection were not changed.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/fixtures/petya-v1-runtime-probe/run-service.cjs /tmp/petya-runtime-env/bin/python BASE_PATH NEW_RESULT.json
```
