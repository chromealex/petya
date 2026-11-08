# Petya local model runtime — in development

Production modules and dependency pins now live in `../src/model-runtime/`,
so the existing whole-source packaging includes the worker and its JavaScript
owners. This directory retains development tests and documentation. The commands
below still run from the project root. The isolated Python environment, weights
and a qualified catalog are not bundled by this move; no application/MCP route
is enabled. Saved probe evidence retains its historical source paths and hashes.

This directory is not an installed service and does not yet expose an application or MCP capability. `contract.py` provides the shared request normalization boundary for the future inference worker. No existing settings, routes, model defaults or prompts are changed. Model qualification, inference execution, authenticated lifecycle controls in the application and MCP, notifications, streaming/cancellation and packaging remain required before release.

The contract preserves real chat turns, schema content and explicit sampler settings. The actual application's `dialogueRequest` is exercised by `test_contract.py` with the project's Electron Node runtime. Ordinary requests retain temperature 0.6, top_p 0.9, repeat_penalty 1.1, context 16384 and output limit 2048. The proposed service defaults additionally specify top_k 40 and a 64-token repetition window; equivalence of sampling algorithms across backends is not asserted. A zero repetition window disables the processor explicitly, avoiding Python's `tokens[-0:]` behavior. Seed, output and context limits are validated. Context overflow must fail before generation; no hidden history truncation is permitted.

`format="json"` is represented by an empty JSON Schema object (any JSON value), distinct from `schema=None` (unconstrained). The inference implementation must test `schema is not None`, compile and validate schemas, and reject unsupported schemas before producing tokens. The earlier tokenizer probe covers object schemas, not unrestricted JSON-mode inference. No claim of schema enforcement follows from request normalization alone.

Only text messages and think=false are currently accepted. Tool calls, image messages, custom stop strings, keep-alive lifecycle hints and unknown fields are explicitly rejected pending implementation instead of silently ignored. This is a development boundary, not a claim of complete Ollama API compatibility. Nothing listens on a port yet.

Run the CPU-only contract tests from the project root:

```sh
/usr/bin/arch -arm64 /tmp/peter-v10/eval-env/bin/python model-runtime/test_contract.py
```

Nine tests cover the real application request, copied history/schema, JSON-mode distinction, unsupported features, finite/ranged numbers, context overflow, repetition-window handling, duplicate/nonfinite JSON and model identity. These tests do not evaluate model quality or prove a usable independent service.

## Artifact identity boundary

`artifacts.py` verifies a canonical manifest against an externally supplied expected digest, then hashes every declared base and adapter file before loading. It checks byte counts, indexed weight shards, adapter/base revision compatibility and unexpected loader-visible files (including extra tokenizer configuration). Flat safe filenames are required; content-addressed Hugging Face symlinks are supported through actual byte hashing. Progress reports a single monotonic verified-byte count across base and adapter. The manifest contains no installation paths, so its digest identifies the same content after relocation.

Eight CPU tests in `test_artifacts.py` cover identity/progress, changed bytes, changed manifests, unexpected files, missing shards, path traversal, incompatible adapters and incorrect shard indices. A real check of fourteen files totaling 6,035,323,454 bytes passed for the unqualified original v19 adapter and its base. Evidence lives in `../tests/fixtures/petya-v1-runtime-probe/original-development-manifest.json` and `artifact-check.json`.

A manifest and its expected digest are integrity evidence, not a signature or proof of model quality. The `qualification` label alone must never authorize promotion; release selection needs separately verified evaluation evidence. The eventual worker must load only these verified local paths with remote code disabled, prevent file replacement during loading and revalidate identity before announcing readiness. Dependency, license, lifecycle and packaging verification remain separate. No inference service or application/MCP entry point is exposed by this module yet.

## Internal generation engine

`engine.py` combines the verified bundle, request contract, actual MLX generation and Outlines grammar processors. It loads only local files with remote code disabled, materializes model arrays and rechecks file identity before returning the engine. Chat history is templated once with thinking disabled. Requested sampler values and the repetition window are explicitly passed to MLX, with the grammar processor last. Each request gets fresh grammar state. Generic JSON mode is constrained even though its schema dictionary is empty. JSON Schema is checked before generation; external references are rejected. Final output is parsed with duplicate/nonfinite rejection and validated against the requested schema before any successful completion event.

One generation runs at a time. A concurrent request receives a busy error; cancellation and generator closure release the lock and token source. Cancellation is checked between generated tokens and does not promise interruption of an in-flight GPU kernel or prompt prefill. Context overflow fails without truncating history. Stream fragments may be incomplete JSON until completion; a final invalid/truncated result produces an error, never a success event. The eventual transport must display cancellation/failure and must close the generator on disconnect. No HTTP server, background lifecycle or application/MCP controls are wired yet.

Ten tests in `test_engine.py` exercise orchestration with fake tokens and the actual MLX call boundary with mocked GPU libraries: settings/schema propagation, generic JSON arrays, invalid/truncated replies, cancellation before/during generation, busy/close cleanup, fresh grammar state, invalid/external schemas, context overflow and processor ordering. These are not real inference results. `requirements.txt` combines the exact already-used MLX environment and isolated Outlines dependency pins for a future dedicated runtime environment; it has not been installed as a packaged service.

```sh
PYTHONPATH=/tmp/petya-runtime-research/deps /usr/bin/arch -arm64 /tmp/peter-v10/eval-env/bin/python model-runtime/test_engine.py
```

Real constrained generation, Unicode token masks, EOS behavior, independent model quality, streaming transport and lifecycle still require verification after the current GPU training/evaluation job finishes. Development fixtures must not be mistaken for a qualified petya-v1 release.

## Local HTTP transport under development

`transport.py` serves only `127.0.0.1` and requires a caller-supplied random bearer token for its implemented routes. It never logs that token or request bodies. Browser-origin requests are rejected; there is no CORS exposure. `/api/tags` returns the actual verified artifact digest and development/release label. `/api/show` advertises text completion only. `/api/chat` forwards to the shared engine, with JSON for complete responses and newline-delimited JSON for streams. `/api/cancel` sets the active request's cancellation event; callers supply `X-Petya-Request-Id` to cancel before response headers arrive. Duplicate active identifiers are rejected. The same token scope authorizes inference and cancellation; external MCP permissions must still be enforced by the future application bridge.

The server caps active request registration at four and connection handler threads at sixteen. Inference remains serialized by the engine. Request bodies are limited to one MiB; oversized declared bodies are rejected before reading (a client that continues uploading may see a closed connection). Transfer/content encodings are not silently decoded. HTTP/1.0 connection close delimits streams. Failed or truncated output ends with an error record, never a successful done record. Disconnect cleanup closes the generator and unregisters the request, including after errors. Shutdown signals cancellation; interrupting GPU prefill and enforcing process-exit deadlines belong to the pending lifecycle manager.

Eight real-loopback HTTP tests with fake inference passed: access/origin rejection, advertised identity, complete/stream output, validation and stream failure, cancellation/duplicate IDs, disconnect cleanup, connection limits and unknown/oversized requests. No real model has been served by this transport, and the tests leave no server running.

```sh
PYTHONPATH=/tmp/petya-runtime-research/deps /usr/bin/arch -arm64 /tmp/peter-v10/eval-env/bin/python model-runtime/test_transport.py
```

This transport is not installed and is not selectable in the application. Shared application/MCP lifecycle, secure token propagation, notification state, inference verification and release qualification are still unfinished parts of the same runtime task. Existing application routing remains unchanged.

## Private process bootstrap

`bootstrap.py` accepts one bounded JSON configuration line through private stdin, then keeps that pipe open for lifecycle commands. Paths and the expected manifest digest are explicit. The bearer token is passed through the pipe, not command-line arguments, and is excluded from status events. Development manifests require `allow_development=true`; a release label alone remains insufficient evidence for application promotion.

The worker reports starting, byte verification, loading and readiness as JSON lines. It binds HTTP only after loading and identity revalidation finish. Only the stop command is accepted on the control pipe. Parent EOF and termination signals request shutdown and cancel active work. A future parent manager must enforce a process-exit deadline because GPU loading/prefill may not immediately observe cancellation. Library output during loading is redirected away from the status channel. Unexpected exceptions produce a generic message rather than exception details.

Seven CPU-only tests in `test_bootstrap.py` cover configuration/digest rejection, explicit development admission, cancellation before loading, explicit stop, parent EOF, unsupported control commands and sanitized errors. They use fake loading/server objects; real subprocess and GPU shutdown remain to be checked. No service is installed or left running by these tests.

```sh
/usr/bin/arch -arm64 /tmp/peter-v10/eval-env/bin/python model-runtime/test_bootstrap.py
```

Real process checks in `test_process.py` run the bootstrap and HTTP transport in a child interpreter with fake model loading. They verify readiness/identity, diagnostic channel separation, parent EOF, explicit stop and SIGTERM while the parent keeps stdin open. The signal case originally reproduced Python's `_enter_buffered_busy` abort at interpreter shutdown: a daemon thread held the buffered stdin lock. The worker now uses bounded, interruptible raw pipe reads, preserves prefetched control lines and joins the monitor during shutdown. Nine bootstrap checks include pending-line/EOF handling and cancellation without closing the parent pipe. These process tests do not load weights or prove GPU cancellation latency.

```sh
PYTHONPATH=/tmp/petya-runtime-research/deps /usr/bin/arch -arm64 /tmp/peter-v10/eval-env/bin/python model-runtime/test_process.py
```

## Internal parent process owner

`supervisor.cjs` owns a single worker generation and exposes safe state snapshots/events for the future application feature. It supplies a fresh random token through private stdin on each start, checks the ready event against the expected model name/digest and loopback port, rejects conflicting starts, and shares the promise for identical duplicate starts. Verification byte progress is accepted only when bounded by a known total. Tokens and worker diagnostics are never included in snapshots. `connection()` is a trusted main-process bridge API and must never be forwarded through IPC, MCP or notifications.

Startup has a deadline; stop first sends the control command and closes the private pipe, then escalates to SIGTERM and SIGKILL if the child does not exit. State becomes stopped only after the child closes. Startup cancellation, unexpected exit, malformed/oversized events, wrong identity and spawn failure remain explicit failures. The configured Python path must come from a trusted installed runtime, not arbitrary external tool arguments. This internal owner is not registered as an application/MCP feature yet; release qualification, shared controls, notifications and actual routing remain required.

`test-supervisor.cjs` exercises actual lightweight child processes, including one that ignores the control pipe and SIGTERM. It covers identity, fresh credentials, duplicate/conflicting starts, progress snapshots, restart, cancellation, bounded shutdown, invalid status messages, timeout, unexpected exit and a missing executable. It does not load the GPU model.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron model-runtime/test-supervisor.cjs
```

The engine now uses `grammar.py` for an explicit newline terminator after a schema-constrained JSON value. The installed raw Outlines grammar prematurely enters a terminal state for root numeric prefixes, rejecting a subsequent decimal point. Mandatory trailing JSON whitespace fixes this without changing the parsed value. Twenty-four checks on the real tokenizer pass through the same helper; preserved raw failures and corrected evidence are in `../tests/fixtures/petya-v1-runtime-probe/`. This is tokenizer/grammar evidence, not real GPU generation evidence or a claim of complete arbitrary JSON Schema support.

## Internal inference client

`client.cjs` connects the future trusted main-process bridge to the verified worker. It snapshots the selected loopback connection and serializes each request body before queuing, so later caller changes cannot alter waiting history or sampler settings. A bounded queue admits one inference at a time, matching the MLX engine rather than the application's three-slot Ollama limit. Waiting cancellation removes that request without sending it. Active cancellation and timeout abort the response and send the request ID to `/api/cancel`; no bearer token is included in public queue statistics.

The runtime's HTTP 503 is a pre-admission busy response. The client retries only that response with the same request ID and body, under the existing deadline, while a previous canceled GPU call unwinds. Other HTTP errors, malformed JSON and incomplete streams fail explicitly without replay. The actual application's `answer-stream.consume` handles streamed content and clears previews on failure. GPU prefill still cannot be promised to stop immediately. Client shutdown cancels active and queued work; process shutdown belongs to the supervisor.

`test-client.cjs` uses a real loopback HTTP server with fake inference to verify authorization, serialized concurrency, immutable queued requests, actual preview parsing, queued and active cancellation, timeout, transient busy handling, truncated-stream cleanup, model/origin rejection and closed-client behavior. This does not run the GPU worker or register a user-facing feature. Shared application/MCP routing, controls, notification integration, installation and model qualification remain pending parts of the release task.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron model-runtime/test-client.cjs
```

## Shared lifecycle controller under development

`controller.cjs` composes the supervisor and inference client into one owner for future application and MCP calls. It exposes start, stop, chat, disposal and public state snapshots. The installation resolver is an internal trust boundary: it must select installed paths and a separately qualified release, never accept executable/model paths from an external caller. This controller does not grant permissions or qualify a model by itself.

Progress is independent of any settings view. Every update uses the stable `petya-model-runtime` notification ID; the operation version stays constant across busy progress ticks. File verification has a percentage only when actual byte totals exist, loading is indeterminate, and the second artifact verification is identified as rechecking. A detached/throwing UI receiver cannot interrupt worker lifetime; reopening can read the current snapshot. Credentials, executable paths and private connection objects are not exposed in these snapshots.

Tests exercise duplicate starts, progress stages and stable versions, shared chat delegation, cancellation during resolution and loading, error/retry, unexpected worker exit, disposal and a closed notification receiver. They use fake owners/clients; the previously saved GPU probe verifies the lower-level worker separately. Application feature registration, MCP permission checks, actual notification rendering, qualified installation and routing remain unfinished; this module is not a public capability yet.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron model-runtime/test-controller.cjs
```

## Combined control-path verification

`test-stack.cjs` connects the real controller, supervisor, client, child Python bootstrap, generation engine and HTTP transport in one test. Only model loading/token production are replaced by a small delayed fake backend, so this check does not compete for the GPU with training. It verifies three simultaneous callers, actual streamed preview decoding, cancellation after preview begins, a subsequent successful inference request, clean stop, fresh credentials on restart and an unexpected child termination. Verification/loading/rechecking progress travels through the same public snapshots, which exclude the bearer token. Both child processes terminate; the test leaves no service running.

This closes the gap between isolated component tests and the previously saved real-GPU smoke probe. It does not prove application/MCP integration, model quality, installer behavior or rendered notification UI; those release requirements remain open.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron model-runtime/test-stack.cjs /tmp/petya-runtime-env/bin/python
```

The controller also revokes readiness as soon as the supervisor reports an
unexpected shutdown. It closes inference admission, publishes a busy stopping
state and rejects restart until the child has exited; the terminal error then
permits retry. Private worker diagnostics remain absent from public snapshots.
Controller checks cover this interval as well as successful restart after exit.
This remains an internal lifecycle boundary, not an installed app/MCP capability.

## Installed release selection boundary

`installation.cjs` supplies an internal resolver for the lifecycle controller.
The trusted application supplies the installation root, runtime executable and
reviewed release catalog; none may be accepted from IPC/MCP tool arguments.
Catalog entries pin a model/platform/architecture tuple, installation directory,
raw manifest hash, canonical artifact digest and release-evidence file hash.
Duplicate selections and unsafe directory names are rejected. The catalog is
snapshotted before asynchronous work, so later caller mutation cannot select a
different model. A missing release fails before a worker is spawned.

The resolver checks metadata bytes, the release name/label, executable presence,
and real paths within the selected installation. Model weights are subsequently
verified by the worker against the pinned canonical digest. Cancellation is
checked between filesystem operations. The release-evidence file must be
reviewed before its hash enters the trusted catalog: this resolver does not
interpret test scores or turn a `release` label into a quality decision.

No production catalog entry is supplied yet. Existing development adapters are
not admitted. The executable is a trusted installer input; checking its presence
is not verification of its Python dependencies, code signature or packaging.
This boundary does not defend against concurrent writes by another process with
the same filesystem privileges. Qualified catalog population, a verified runtime
installer, application/MCP registration and public notifications remain pending.

`test-installation.cjs` uses temporary files and a fake executable without running
it. It covers missing/ambiguous/platform-specific selection, immutable metadata,
changed or missing evidence, development/wrong-name manifests, bounded metadata,
path traversal and escaping symlinks, cancellation, missing runtime and actual
controller admission/rejection with a fake process owner. No GPU or release
quality claim follows from these filesystem checks.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron model-runtime/test-installation.cjs
```

## Packaged source layout

The production modules are under `src/model-runtime`, covered by both existing
whole-source build paths. Python scripts and the dependency specification are
explicitly unpacked from ASAR. The supervisor maps its fixed bootstrap location
from `app.asar` to `app.asar.unpacked`; development/plain-directory startup keeps
the original location. Development tests remain outside the packaged source.

After relocation, all 47 Python CPU checks, JavaScript supervisor/client/
controller/installation checks and the combined child-process stack passed.
`test-package.cjs` creates a temporary real ASAR using the configured runtime
unpack patterns, checks every production file byte, imports archived JavaScript
and starts the actual unpacked Python bootstrap. A development manifest is
rejected before any model loading. The temporary archive is always removed.

This verifies code layout on macOS, not a signed application build, a bundled
Python environment, Windows inference or a qualified model. Application/MCP
controls and routing still need integration before release.

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron model-runtime/test-package.cjs /tmp/petya-runtime-env/bin/python
```

## Company shutdown and local HTTP reliability

The combined stack test now attaches controller disposal to the application's
actual `CompanyLifecycle` teardown. Closing the scope during a streamed answer
cancels active and queued calls, awaits child exit, removes the lifecycle listener
and rejects attempts to reuse the closed controller. Model token production is
still fake; the child process, HTTP transport and company teardown are real.
This is integration evidence for the shutdown path, not feature registration.

The first expanded run crashed with an uncaught `setTypeOfService EINVAL` in
Electron's bundled Undici; a repeat passed. The observed stack matches upstream
[Undici issue 5544](https://github.com/nodejs/undici/issues/5544). The local runtime
client now uses `http.cjs`, a narrow `node:http` transport for authenticated
loopback POSTs to chat/cancel. It sets Content-Length explicitly, does not follow
redirects, propagates aborts and exposes the standard response stream consumed
by the existing UI parser. It creates no shared keep-alive pool. Other application
network routes are unchanged; no global exception handler or socket patch is used.

The client test deliberately makes `Socket.setTypeOfService` throw and confirms
it is never invoked through this transport while real HTTP cancellation,
streaming, serialization, deadlines and busy retries still work. Additional
checks cover redirect rejection and disconnected response streams. A successful
repeat alone was not treated as a fix for the initial crash.

## Application and MCP lifecycle bridge

`src/features/model-runtime.cjs` now owns the shared application controller and
registers its generic feature IPC. `src/mcp.cjs` exposes status/start/stop through
the same bridge with whole-company permissions and `edit` for mutations. The
preload event and `src/ui/model-runtime.js` restore and update the existing
notification center without a settings-view dependency. The test exercises the
actual controller and renderer event code with a fake process owner; the existing
stack test separately covers real worker processes and company shutdown.

All 38 core MCP tools and the subsequent integration suites pass through the
real authenticated MCP client, including access revocation before runtime calls.
The production release catalog is empty: no experimental adapter is admitted and
no downloads or unqualified model loading occur. Explicit `petya-v1` requests
now use the shared application route, with no Ollama fallback; other models
retain their existing route. Source integration is not a signed
build, a qualified model, or a completed Ollama replacement. The fixed installation
layout will need a verified installer before the catalog can admit any release.


The ASAR smoke test also imports and exercises the archived own-model router,
including its `core.cjs` and `answer-cancel.cjs` dependencies. This detects
missing router dependencies in the packaging fixture without starting model
inference. Full signed application and Windows verification remain separate.


## Default application regression coverage

`npm run test:petya-runtime` runs nine CPU-only application/runtime test programs:
own-model dialogue handling, shared model selection, picker binding, routing,
HTTP route integration, feature lifecycle, client transport, controller and
installation qualification. The default `npm test` includes this group after
its existing application tests. The combined 184-program sequence passed using
Electron's bundled Node runtime after the routing/selection changes. This is
application regression evidence, not model inference quality, signed packaging
or Windows runtime qualification. MCP and real Python-worker/ASAR checks retain
their separate commands.
