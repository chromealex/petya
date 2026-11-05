# Reserved generated-dialogue release checks

Six independently authored conversations (31 user turns) cover field replacement, revoked sending, negative sorting with duplicates, numeric endpoints, exact identifiers, and topic return with an earlier correction. Only user turns are fixed. Assistant history comes from actual generated replies through `Dialogue`, `dialogueRequest` and `localAnswer`; repeat protection remains active. Reference criteria are never inserted into requests. The scenarios are reserved before candidate inference and hashed in `protocol.json`.

This is an offline research harness, not a new application/MCP capability or an inference server. No services or user data are attached, no settings are changed, and no external writes are possible through this harness. It accepts only explicit HTTP loopback origins and calls `/api/tags` and `/api/chat`. A full expected model digest is mandatory and must match the advertised model entry. That check does not independently prove server weight provenance: the eventual runtime must also be verified against the base/adapter release manifest.

Run the harness checks using the project's Electron Node runtime:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/fixtures/petya-v1-live/test-runner.cjs
```

After the candidate's retention/selection gate and runtime readiness checks, capture live evidence to a new output path:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/fixtures/petya-v1-live/run.cjs http://127.0.0.1:PORT petya-v1 FULL_MODEL_SHA256 /tmp/petya-v1-live.jsonl
```

The endpoint must implement the submitted output format/schema and sampling options. Silently ignoring unsupported options is not a valid equivalent runtime. The runner preserves actual application requests (normally temperature 0.6, top_p 0.9, repeat_penalty 1.1), raw responses, retries, final answers, source routing and errors. The manifest hashes the scenarios, runner, application CommonJS sources and completed output. Existing output paths are rejected. Inspect every turn and review final facts against `review_criteria`; no heuristic automatic semantic pass is claimed. A captured run, including one containing turn errors, remains awaiting manual review. Template/calculator answers are distinguished from model answers and must not be credited as model competence.

The harness checks passed with mocked inference, including propagation of a generated assistant answer into the next real request, sampling/schema preservation, response capture, frozen scenario integrity and loopback rejection. System Node on this machine is too old for the application; use the Electron runtime above. No actual model has yet been evaluated on this set. Existing `tests/long-dialogue-live.cjs`, broader knowledge and dialogue checks, streaming/cancellation, artifact provenance, model service integration and application packaging remain separate release requirements.
