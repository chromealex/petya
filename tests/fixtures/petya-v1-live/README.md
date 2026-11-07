# Reserved generated-dialogue release checks

Six independently authored conversations (31 user turns) cover field replacement, revoked sending, negative sorting with duplicates, numeric endpoints, exact identifiers, and topic return with an earlier correction. Only user turns are fixed. Assistant history comes from actual generated replies through `Dialogue`, `dialogueRequest` and `localAnswer`; repeat protection remains active. Reference criteria are never inserted into requests. The scenarios are reserved before candidate inference and hashed in `protocol.json`.

This is an offline research harness, not a new application/MCP capability or an inference server. No services or user data are attached, no settings are changed, and no external writes are possible through this harness. It accepts only explicit HTTP loopback origins and calls `/api/tags` and `/api/chat`. A full expected model digest is mandatory and must match the advertised model entry. That check does not independently prove server weight provenance: the eventual runtime must also be verified against the base/adapter release manifest.

Run the harness checks using the project's Electron Node runtime:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/fixtures/petya-v1-live/test-runner.cjs
```

After the candidate's retention/selection gate and runtime readiness checks, capture live evidence to a new output path:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/fixtures/petya-v1-live/run.cjs http://127.0.0.1:PORT petya-v1 FULL_MODEL_SHA256 /tmp/petya-v1-live.jsonl < /path/to/private-token-file
```

The endpoint must implement the submitted output format/schema and sampling options. Silently ignoring unsupported options is not a valid equivalent runtime. The runner preserves actual application requests (normally temperature 0.6, top_p 0.9, repeat_penalty 1.1), raw responses, retries, final answers, source routing and errors. The manifest hashes the scenarios, runner, application CommonJS sources and completed output. Existing output paths are rejected. Inspect every turn and review final facts against `review_criteria`; no heuristic automatic semantic pass is claimed. A captured run, including one containing turn errors, remains awaiting manual review. Template/calculator answers are distinguished from model answers and must not be credited as model competence.

The harness checks passed with mocked inference, including propagation of a generated assistant answer into the next real request, sampling/schema preservation, response capture, frozen scenario integrity and loopback rejection. System Node on this machine is too old for the application; use the Electron runtime above. No actual model has yet been evaluated on this set. Existing `tests/long-dialogue-live.cjs`, broader knowledge and dialogue checks, streaming/cancellation, artifact provenance, model service integration and application packaging remain separate release requirements.

The authenticated runtime token is mandatory on stdin, terminated by EOF (one optional final newline). A supervising process should pipe it directly; if a temporary token file is used, its access must be restricted to the current user and it must be removed after the run. Never put the token in arguments or committed files. Input is bounded and validated. Both identity and inference calls use the bearer header; redirects are rejected. Transport exceptions and malformed JSON errors are sanitized, and headers/token are excluded from evidence. The token input is separate from the runtime worker's persistent control pipe.

`test-auth.cjs` checks bounded private input, both authenticated routes, route/origin restriction, redirect rejection configuration, sanitized failures and malformed responses with injected HTTP behavior. These checks do not run reserved model conversations.

The live runner uses the shared `src/model-runtime/http.cjs` transport instead
of bundled fetch, avoiding the macOS socket-QoS failure observed during runtime
testing. It supports only explicit IPv4/IPv6 loopback origins, GET `/api/tags`,
and the existing POST chat/cancel transport routes; this runner still exposes
only tags/chat. Headers objects preserve the private bearer token, and HTTP
redirects are returned as errors without following their target.
`test-http.cjs` exercises real local HTTP identity/chat requests, auth headers,
redirect rejection and invalid method/route combinations with socket QoS
forced to throw if invoked. It does not infer on the reserved scenarios.


Turn evidence preserves structured dialogue errors returned by `localAnswer`,
not only thrown exceptions. A connection failure therefore remains an explicit
turn error even when the application converts it to user-facing text. Semantic
clarifications are recorded separately with `question: true`; they are not
transport errors. The harness regression test covers both paths with synthetic
non-reserved prompts. Reserved scenario contents remain unchanged.


## Existing broader long-dialogue suite on the own runtime

The unchanged five scenarios (25 user turns) in `tests/long-dialogue-live.cjs`
can now use the authenticated own service after the candidate quality gate:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/long-dialogue-live.cjs --runtime http://127.0.0.1:PORT petya-v1 FULL_MODEL_SHA256 /tmp/petya-long-dialogue.json < /path/to/private-token-file
```

The token uses the same private bounded stdin reader and loopback transport.
Identity is checked before chat inference; existing output files are rejected.
The report contains raw model requests/responses, application source hashes,
returned errors, source routing and the expected digest. The original regex
checks remain heuristic diagnostics, not semantic proof. Review every answer,
including replies with no expected regex; template/calculator replies do not
count as model competence. The report remains awaiting semantic review.
The legacy no-argument Ollama invocation remains supported but also refuses to
overwrite an existing report. `tests/long-dialogue-runtime.cjs` checks transport
setup and evidence using fixtures only; it runs none of the actual scenarios.
