# Development

How to run, test and build Petya, how the code is laid out, and notes on individual subsystems. The project overview is in the [README](../README.md); rules for agents are in [AGENTS.md](../AGENTS.md).

## Running

Requires Node.js 22.12+.

```sh
npm ci
npm start
```

Built-in OAuth clients are read from `src/integration-clients.json`, which is not in git (see `src/integration-clients.example.json`); without it the app starts and users configure their own clients. Services are configured in the app under «Подключения» (Connections). Answers need a local Ollama model (default `qwen3:4b`, `qwen3.5:9b` recommended); voice needs whisper.cpp (see the speech recognition section in [docs/HISTORY.md](HISTORY.md#speech-recognition)).

## Tests

```sh
npm test                               # unit and scenario tests, no network (also run in CI)
node tests/long-dialogue-live.cjs      # live long dialogues on local Ollama
PETYA_TEST_MODEL=qwen3.5:9b node tests/long-dialogue-live.cjs
npm run test:dialogues:live            # other live checks: see scripts in package.json
```

GitHub Actions runs `npm test` on every push, plus the real app under a virtual display: the UI smoke test and 12 parallel chats with a fake Ollama. Locally on Linux:

```sh
xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/smoke-ci
xvfb-run -a env PETYA_SMOKE_TEST=1 PETYA_E2E_PARALLEL=1 ./node_modules/electron/dist/electron --no-sandbox tests/smoke-ci
```

On macOS: `PETYA_SMOKE_TEST=1 npm start` (add `PETYA_E2E_PARALLEL=1` for the parallel chats check).

## Building

Only via `python3 scripts/build.py` (`--mac`, `--win`, or both platforms without a flag). The output is the single current build per platform, `Petya.app` and `Petya-Setup.exe` in the project root; build and signing rules are in [AGENTS.md](../AGENTS.md).

## Versions and releases

Every change raises the version with `node scripts/bump-version.cjs patch|minor` and adds a `## x.y.z — …` section at the top of [HISTORY.md](HISTORY.md); `tests/version.cjs` checks both. Pushing the tag `v<version>` (or running the Release workflow) builds `Petya-Setup.exe` in GitHub Actions and publishes the release with that section as its notes.

## Layout

| Path | Contents |
|---|---|
| `src/main.cjs` | Electron main process: windows, IPC, routing of user requests |
| `src/converse.cjs` | the request pipeline of one chat turn |
| `src/*-setup.cjs` | groups of main-process services and their IPC handlers (agents, attachments, chats and projects, computer control, connections, dictation, Git, Jira, learning, mail, Ollama, skills, Slack, Telegram, voice, Asana); each takes a `ctx` with live getters for the state it shares with `main.cjs` |
| `src/dialogue*.cjs`, `src/answer-*.cjs` | dialogue, model request, answer parsing and guards |
| `src/*-routing.cjs`, `src/work-*.cjs` | intent detection and work scenarios (Jira, team) |
| `src/slack*.cjs`, `src/gmail*.cjs`, `src/telegram.cjs`, … | integrations |
| `src/ui/` | renderer UI (no Node.js access) |
| `oauth/` | OAuth gateway and app registration ([REGISTRATION.md](../oauth/REGISTRATION.md)) |
| `native/` | native macOS helpers (Swift) |
| `docs/` | module notes and evaluation reports |
| `tests/` | tests; `*-live.cjs` and `*-smoke.cjs` need Ollama or Electron |

## Data and security

Tokens are stored with Electron safeStorage (Keychain / DPAPI). Dialogue history is kept in the app data folder (`app.getPath('userData')`). The model and speech recognition accept only local addresses. OAuth secrets (`src/integration-clients.json`, `oauth/local/`, `.signing/`) are never committed.

## For agents

Project rules are in [AGENTS.md](../AGENTS.md): builds, integration icons, Slack context, answer quality, language, and working alongside other agents.

### MCP access to chats

`check_model_disk_space` is available in every authenticated access mode. With no arguments it returns available bytes; with `{"model":"qwen3.5:9b"}` it reads the registry manifest and returns `downloadBytes`, `required`, `reserve`, `available`, `missing`, and `status` (`sufficient`, `insufficient`, or `unknown`). It never starts a download or removes files. The conservative estimate includes the full model plus 512 MiB, without subtracting cached layers. It checks the local `OLLAMA_MODELS` directory or `~/.ollama/models`; it cannot discover a different storage volume configured inside another server process. Recheck immediately before downloading; unknown size is not approval to proceed.

Open **Подключения → Доступ к чатам через MCP**, enable access, then copy the connection into your MCP client. The local Streamable HTTP endpoint uses a session bearer token. Stopping access, restarting Petya or switching companies ends that connection. Copy the new configuration after enabling it again.

- Discover projects and chat IDs with `list_chat_projects` and `list_chats`.
- Read, replace or clear a composer draft with `get_chat_draft` and `set_chat_draft`. Supply the previous text to avoid overwriting a concurrent edit. Use the project draft owner for a new chat. Preview content with `read_draft_attachment`. Add or remove attachments with `add_draft_attachment` and `remove_draft_attachment` (base64 text files, DOCX or images up to 1 MiB).
- Inspect versions with `list_chat_versions` and `read_chat_version`. Use `select_chat_version` to switch, or `prepare_chat_version` to stage an edited or repeated question. The user sends it from Petya; preparing a version runs no commands.
- Use `list_chat_materials`, `read_chat_material` and `set_chat_material_enabled` to inspect and change the selected chat's context. `add_chat_note` saves a note in the company's shared memory.

Use `list_chat_clarifications` to discover pending questions and `get_chat_clarification` to inspect their original request, options, input requirements and expiry. With full edit access, `answer_chat_clarification` accepts either `answer` or an `optionId` and immediately resumes the saved request; `cancel_chat_clarification` cancels it. Answers run in the originating chat/project scope without opening it or changing the desktop selection. This can perform the original external action, so read-only and draft-only clients cannot answer. IDs are single-use after a valid answer; a new question returns a new ID. Changed connections, versions, expired questions and inaccessible projects are rejected. Results update the desktop chat. Pending questions and original requests are persisted, with a 30-minute lifetime (legacy Slack questions: 10 minutes). Restart-safe descriptors restore Git input, image-description and build-repair task questions after scope validation. Other callbacks survive only in memory: after restart their questions remain visible with `canResume: false` and a draft recovery action, never automatic replay. A running action interrupted by restart is marked for review, not retried. The tools cover the shared clarification mechanism, including adapted team-fill and Slack-channel questions. Technical failures and native permission dialogs are not converted into answerable questions.

New MCP connections default to the current project and read-only access. Select draft editing or full editing before enabling the connection. Company-wide notes can only be created with full company access. A project-scoped client can read shared materials already referenced by messages in that project. Draft and version writes require the opaque `revision` from a fresh `get_chat_draft` or `list_chat_versions` call. On conflict, read again before proposing a new write.

In an open chat, Ctrl/Cmd+F searches all loaded and older messages in that version. The message menu copies a local petya:// link to its version and message. MCP clients can use the optional query in `read_chat_version`; assistant messages include their local links. `list_chats` includes the reason for pending attention. Links open chats stored in the company's local Petya profile.

Chat drafts appear in the project sidebar. Hold Ctrl and press Tab or Shift+Tab to switch between recently visited chats. In chat search, select Files to open a matching line. The answer menu saves a reference in its project. MCP exposes the same data via `search_chat_files`, `list_saved_answers` and `bookmark_chat_answer`; bookmark writes require edit access.

### Extension-rendered chat replies

Ask “Сколько каких задач у меня в Jira?” to see counts by issue type, or ask for counts by status. Jira searches issues assigned to the connected account within the chat's authorized project scope. The provider supplies both the text and the image. Both stay on the assistant message when reopening a chat or viewing an older version. MCP clients may request saved visuals with `read_chat_version` and `includeImages: true` under the existing chat access scope.

After four hours away, reopening a conversation offers a one-sentence recap of the earlier discussion. The unread divider uses a per-company, per-version reading position. The message menu can branch the history up to that message within the same project. MCP offers `branch_chat_at_message` (edit access) and `summarize_chat`. Read receipts, navigation history, the composer preview and approval of outbound Jira submissions belong to the desktop UI.

Confluence also renders chart replies. Ask “Сколько страниц в Confluence по пространствам?” for a horizontal bar chart of accessible pages grouped by space. A configured space limits the report. Bundled providers may import `../chart-reply.cjs` and call `chartReply({ kind, title, rows, emptyText })` with `bars` or `donut` and rows of `{label, count}`, or return their own image.

### Blender animation edits

Ask Petya to clean redundant animation keys or find a short movement spike. Choose a local `.blend` and, if prompted, the object with the active Action. Petya uses an installed Blender executable to prepare a looping schematic preview. Apply saves the inspected candidate beside the original as a separate file. A proposal expires after ten minutes. Linear simplification and spike detection support position, scale and Euler rotation channels. Complex NLA, IK and quaternion motion require separate diagnosis.

The authenticated chat MCP server exposes `pick_animation_file`, `analyze_animation` and `apply_animation_edit` in edit mode. Provide the active `chatId` and use the opaque file and proposal IDs returned by Petya. The native file picker and confirmation dialogs run in Petya.


### Artist (Художник)

Enable **Художник** under **Подключения → Картинки**. Describe a scene in the card, select the canvas and quality, or ask Petya to draw in chat. The first local drawing asks before downloading the pinned stable-diffusion.cpp engine and Stable Diffusion 1.5 model (about 2.2 GB, 2.5 GB of free space required). Downloads are SHA-256 verified. Subsequent drawings run offline on the CPU. The optional WebUI address accepts loopback HTTP only. Disabling Artist returns chat drawing to the existing SD-Turbo integration.

The authenticated MCP tool `generate_painting` requires edit access, an enabled Artist and confirmation in Petya. It accepts `prompt`, optional `quality` (draft, standard, high) and `format` (square, portrait, landscape), and returns a PNG image block. Allow up to an hour for the first download. Enablement and connection settings are managed inside Petya.

### Contextual chat extensions

Petya discovers trusted bundled adapters in `src/extensions/<id>/desktop-reply.cjs`. Each exports a unique
`type`, a display `name`, a catalog `description`, and `matches(command, {files, topic, settings})`.
Set `service: true` to run the service access check. Supply `scope(services, topic)` and
`answer(command, scope)` returning MCP text/image blocks, or `turn(services, command, context)`
for an interactive workflow. File-aware adapters opt in with `acceptsFiles(files)`. An ambiguous
match falls through. Petya activates the selected bundled adapter per company on first use.
The download confirmation threshold is in Connections > Chat extensions (100 MiB by default).
Optional catalog installers export `downloadBytes(services)` and `install(services, check, report)`.
The host checks the estimate (unknown sizes require approval), coalesces installs and publishes progress.
The size policy is configured in the app; MCP clients cannot raise it. Other download owners must check actual remaining bytes with `needsApproval` before downloading.

An authenticated MCP client can call `list_chat_extensions`. With edit access, `use_chat_extension`
routes a request through the same adapter in the active authorized chat and returns its text and images.
Interactive controls and connection approvals stay in Petya. Blender's file selection, preview and
confirmed copy are also available via its dedicated MCP tools.

In desktop 0.8.3, Settings → Services → «Каталог приложений» lists the available company modules. Enable Unity Editor, start the local HTTP server in MCP for Unity, enable execute_code and use «Сохранить и проверить». In chat, «Покажи префаб Tank» opens the extension's search. Results are scoped to Assets in the connected editor; previews and Prefab Mode use the selected asset GUID. An external assistant with edit access can request unity_find_prefabs, unity_preview_prefab and unity_open_prefab for the open chat. Each editor action requires confirmation in Petya.

Unity uses live MCP discovery. In an active chat, ask for the Unity console, errors, scene hierarchy, or editor tools.
The extension can display the server's advertised input schemas, invoke a native tool, and read published
resources and resource templates. The same operations are exposed as `unity_discover`,
`unity_call_tool` (name and arguments) and `unity_read_resource` (URI). Each requires edit access to the
active chat, an enabled Unity connection and local approval in Petya. Review the tool name and exact
arguments before approving an edit. Available operations depend on the connected editor. Prefab search
prefers native `manage_asset`; older servers and the directional preview/open workflows use `execute_code`.

Extensions may provide `result.cjs` with an `id`, `describe(message, topic, services)` and, for direct actions, `perform(action, result, services, check)`. Descriptors supply a stable object key, title, subtitle and action IDs/labels. Command actions use the normal chat pipeline. Direct actions recheck ownership and availability after asynchronous work and before side effects. The shared result cards and composer selector retain the selection (or explicit reset) within the company, project, chat and version. Multiple objects require an explicit choice. Imported files expose folder navigation only when their original local path was recorded by the native picker.

### Extension-driven diagnostics

Adapters may export an `agent` capability description and `agentTurn(services, command, check)`.
The local model selects an adapter from those descriptions when no direct route matches. The shared
`src/extensions/agent.cjs` runner discovers tool schemas, validates arguments, reads results and
requests the next step through native model tool calls. It limits each run to eight observations,
twelve planning turns and up to three completion reviews, rejects
repeated calls and checks chat scope and cancellation between steps. Tool results are untrusted data.
Each adapter supplies its read-only action policy. All other calls become proposals with evidence.

Unity supports `unity_assist` (command, chatId, optional instance) through MCP and contextual chat.
It reads scene objects, resources, physics and console data through the selected live editor.
Proposed edits are not executed during diagnosis. `unity_apply_agent_proposal` takes the returned
proposalId, verifies the original chat/version/connection, shows the exact operation for local
confirmation and consumes the proposal once. The chat card shows observations and an apply button.
Both tools require MCP edit access. A changed chat, model or connection interrupts the workflow.

### Unity layout extension (0.8.3)

**Вёрстка Unity** imports Figma frames and Zeplin screens into the active Unity scene as a UI Toolkit `UIDocument`, with a separate UXML, `PanelSettings`, image files and supplied TTF/OTF files. Enable Unity Editor and configure either a Figma personal token (`file_content:read`) or a Zeplin access token. Tokens use the company-scoped OS-encrypted settings store and are redacted from public settings. Personal-token connections do not provision an OAuth application or provide an application icon setting.

Paste a Figma frame URL containing `node-id` or `https://app.zeplin.io/project/PROJECT/screen/SCREEN`. Preparation reads the design and downloads its images. The review panel lists required font families, weights and italic styles; choose the corresponding TTF/OTF files before applying. The service APIs do not supply font binaries, so Petya does not silently substitute missing fonts. Image downloads only use HTTPS provider/CDN hosts, never forward service tokens to asset URLs, reject redirects, and enforce byte limits.

Responsive mode maps horizontal/vertical Auto Layout, fill/hug sizing, padding, spacing, wrapping, edge/center/stretch/proportional constraints, and Figma scroll containers into UI Toolkit. It uses `PanelSettings.ScaleWithScreenSize` and the source reference resolution. Disable responsive mode for a fixed layout. It does not invent a mobile redesign or application behavior absent from the source. Mixed text runs, container effects, and unsupported styling produce review warnings. Figma leaf vector/image/effect layers use rendered PNG exports; Zeplin images require PNG/JPEG exports associated with layer source IDs. Exported Zeplin groups are flattened into images. Font selection must match the indicated family and style.

Applying requires `execute_code` in MCP for Unity and a confirmation dialog in Petya showing the editor, active scene, layer count and resources. The importer checks project/scene identity between transfers, validates file checksums and imported texture/font assets, then creates a uniquely named folder under `Assets/PetyaLayouts` and a new scene object. It never saves the scene automatically; Unity Undo removes the created object, while imported resources remain. A failure before placement creates no scene object; interrupted transfers can leave files in the target project's `Temp/PetyaLayout-*`, and a failed Unity asset import can leave its uniquely named asset folder for diagnosis. Retry starts a separate import.

MCP tools use the same feature methods and edit-access/project/chat checks as the UI:

- `prepare_unity_layout(chatId, url, responsive?)`: prepare the design, download images and return required fonts, warnings and resource sizes.
- `get_unity_layout_proposal(chatId, proposalId)`: inspect the current review data.
- `set_unity_layout_font(chatId, proposalId, fontKey, base64)`: supply the actual TTF/OTF data for a required font.
- `pick_unity_layout_font(chatId, proposalId, fontKey)`: open the native font picker in Petya.
- `apply_unity_layout(chatId, proposalId, instance?)`: import resources and place a document after local confirmation; returns editor choices when selection is ambiguous.

The extension is also available through `list_chat_extensions` and `use_chat_extension`. Proposals are session-local and expire when the chat, company, version or credentials change. At most five proposals are retained. Limits: 1500 layers, 40 nesting levels, 100 downloaded images, 12 MiB per resource, 48 MiB total resource data, and 2 MiB UXML. Progress uses the notification center and is restored when the window reopens. Credentials and the choice of local font files remain in the application UI; supplied font bytes are also accepted through the scoped MCP tool.

Validation includes authenticated MCP calls, provider/CDN fixture requests, real Unity asset import and scene placement, and a 446-layer responsive stress fixture. See [verification results and reproduction](layout-verification.md).

### Automatic work context

Vague questions such as «посмотри что не так» resolve saved context before answering: the latest eligible recorded meeting, otherwise team requests in synced Slack threads. Existing chat materials take precedence. Selected projects restrict Slack channels; ambiguous channels without a project require clarification. Recorded meetings are shared company context available across projects. Sources, timestamps and bounded text snapshots stay in the chat for follow-up questions. Missing recordings or unsynced Slack messages cannot be inferred.

`resolve_work_context(chatId)` uses the same resolver and returns evidence for an MCP assistant to answer. It is read-only; project-scoped clients can only discover shared materials already referenced in their authorized project. Excluded materials and disabled project services remain excluded. Recording permissions, connection settings and sending messages remain in the application.

### Meeting recording and memory

Petya's core records **meetings**, not a particular app: «Слушать встречу» on the home page (and «Запись встреч» in settings) captures system audio and, if allowed, the microphone, locally; there is no meeting bot. Without any meeting app Petya records when the user asks and stops when the user stops. Meeting apps plug in as **meeting sources** (`src/features/meeting-sources.cjs`): an extension declares `"provides": {"meeting-source": "meeting-source.cjs"}` and exports `detect()` (is a meeting going on), optionally `speakers()` (who talks, for labelling the meeting sound), `participants()` (names for «Имя на встречах» in «Команда»), `joinLinks`/`recognizeLink(url)` and `summaryMail()` (the service's own letter about the meeting). A source counts only while its extension is added in the catalog. With a source, `meetingAutoRecord` decides what happens when it sees a meeting: start automatically, ask first (`ask`), or only record manually (`off`); `meetingCaptureMic` adds the microphone. The **Zoom** extension (`src/extensions/zoom`, [docs/apps/zoom.md](apps/zoom.md)) is the first such app; **Google Meet** ([docs/apps/google-meet.md](apps/google-meet.md), a call's browser tab) and **Microsoft Teams** ([docs/apps/teams.md](apps/teams.md), the call window of the app or the web) work the same way and also provide the calendar's Meet / Teams calls; window titles come from the neutral `src/desktop-windows.cjs`. The core and the calendar never mention these apps (`tests/core-meeting-guard.cjs`); calendar users who had Meet / Teams as calendar choices get the extensions added once (`videoAppsMigration`). Settings of older versions (`zoomBotMode`, `zoomCaptureMic`, team «Имя в Zoom») migrate once (`src/meeting-migration.cjs`), and users who recorded Zoom meetings get the Zoom extension added automatically. Updates never silently enable recording for an opted-out profile. OS permissions still require the app. Transcripts (including the local microphone) are stored in encrypted company memory, independently of the selected chat, for the configured 1–7 days. System audio capture includes other applications. Recording continues until the meeting ends; only then does recognition start. Encrypted audio segments survive recognition failures and restarts and are deleted after successful processing; stale pending audio is removed on startup or the next recording according to the context retention period. A dedicated sandboxed hidden renderer owns system audio and microphone capture; it survives chat navigation and main-window reloads. It has no chat or transcription API. A dedicated meeting microphone never enters the voice-command timeout. The notification center shows recording, processing, completion and retryable errors.

MCP `read_meeting_memory` reads complete transcript segments with optional `sessionId`, `offset`, and `limit` (up to 100); it requires company-wide access and cannot start capture or bypass OS permission. `resolve_work_context` can use shared meeting sessions in any project; project-scoped MCP access retains its existing material restrictions.

MCP `meeting_recording_status` exposes the same processing snapshot as the UI; `retry_meeting_processing(sessionId)` retries a failed saved recording and requires company-wide edit access. MCP `local_meeting_status` reports capture state. `start_local_meeting` requires company-wide edit access and the user-selected automatic mode; ask-first confirmation and OS permissions remain in the app. `stop_local_meeting` requires company-wide edit access and stops capture before processing. UI and MCP share the same controller.

Chat continuations publish running, attention, completed and cancelled states through the existing chat jobs and notification center. `stop_chat_continuation` requests cooperative cancellation; completed external effects are not rolled back, and an unknown outcome is never retried automatically. `list_chat_continuations` returns the last 50 continuation records for an accessible chat. `answer_chat_clarification` accepts an optional `assistant` display label (self-reported, not authenticated identity). The chat header shows this history. Notifications restore from saved chat state, update in place, and provide Open/Stop actions.

Direct Slack requests now show the exact channel, thread, mentions and message before sending. Confirmation is single-use through the scoped clarification flow. Replies retain service receipts and source links; `read_chat_version` includes sources and receipt IDs for MCP clients. The result card distinguishes acknowledged writes from uncertain outcomes. Its verification action only reads a bounded Slack history/thread page and matches the returned message timestamp or original client message ID; no match is inconclusive and never enables automatic resend. See [Slack history](https://docs.slack.dev/reference/methods/conversations.history/) and [thread replies](https://docs.slack.dev/reference/methods/conversations.replies/).

Jira and text-file change cards can verify uncertain writes by comparing the current fields/content against the saved preview. A match confirms current state, not who produced it. Verification never writes, and a recovered result does not enable automatic undo. Mismatches and read failures remain actionable uncertain states. Verification progress and completion are available in the notification center independently of the open settings view. Existing contact/file/task result cards and compact source sections remain the owners of their specific results.

MCP result verification: `list_chat_action_results({chatId})` lists safe Slack receipt and Jira/file change metadata with the current chat `version`; pass its result `id` as `resultId` to `verify_chat_action_result({chatId, resultId, version})`. Both tools are available in read, drafts and edit modes. They run in the originating chat/project without changing the desktop selection. Verification performs no external write or resend; it updates only Petya's local receipts and notifications. Results report `confirmed` or `inconclusive`, `checkedAt` and `replayed: false`; access and technical failures are MCP errors. A confirmation establishes observed state, not authorship. Only stored, scoped results are accepted: arbitrary paths, URLs and task keys cannot be supplied. Archived projects/chats, stale versions, busy chats, changed connections and revoked access are rejected. Lists omit file contents, absolute paths, credential signatures and preview internals.

### Company switching without an application restart

Switching companies keeps the Electron process, tray and local speech runtime alive. The window reloads the selected company's UI and stored chats. Profile IPC handlers, timers, browser windows and MCP access are disposed before the next profile is loaded; browser cookies use the company's existing on-disk partition directories. Busy chat requests, recording, synchronization and model preparation still block switching. If profile initialization fails, Petya restores the previous profile.

MCP tool `get_company_context` returns the connection's current company and switching status. Switching itself is UI-only: an assistant's grant never authorizes access to another company, and the old MCP endpoint is revoked on a switch. Enable MCP again in the target company if needed.

### Python execution prototype

Ask `Вычисли через Python: ...` or `Проанализируй через Python приложенный CSV`.
The Python extension generates a standard-library script with the selected local model,
runs it, and can correct one Python error. Explicit fenced Python runs unchanged.
Code, stdout, stderr and exit status are retained in the chat. The initial version returns
text only (including CSV/JSON text), not downloadable files or plots. No pip installation.
Inputs are copied text supplied both as files in `/work` and in the `files` dictionary: at most five complete text
attachments, 40000 characters each; truncated attachment previews are rejected.

Prerequisite: locally running Docker Desktop with Linux containers and a locally pulled
`python:3.12-slim` image (`docker pull python:3.12-slim`). Petya never pulls automatically.
Missing prerequisites appear as a resumable chat question. Enable Python in the extension
catalog for direct MCP use; an explicit chat request activates it through the existing host.
Only local Unix/named-pipe Docker contexts are accepted. Each execution pins the image ID,
uses no host mounts or inherited container credentials, disables networking, drops all
capabilities, enables no-new-privileges and runs as UID 65534. Limits: 15 seconds execution,
256 MiB memory including swap, one CPU, 32 processes, 16 MiB temporary storage and 64 KiB
combined output. The root filesystem is read-only. Containers are removed after success,
failure, cancellation or context change. Abrupt application termination can leave a container;
it is labelled `com.petya.python=true` for manual inspection/removal. There is no native Python fallback.
The Docker image/daemon are trusted prerequisites; this is process isolation, not a claim
that arbitrary code is immune to container/kernel vulnerabilities.

MCP: `python_status({chatId, version})` checks readiness; edit-only
`run_python({chatId, version, code, files})` calls the same runtime as chat and saves the result;
`stop_python({chatId, version})` cancels it. The active chat, version, project, company and
access are rechecked during execution; read/drafts clients cannot run or stop code.
Operation notifications work with settings closed and restore from a snapshot.
Run `node tests/python.cjs`, `node tests/python-ui.cjs`, `node tests/python-live.cjs` (Docker required),
`node tests/python-model-live.cjs` (local model and Docker required), and
`node tests/mcp.cjs` to check behavior and the MCP client contract.

### Project instruction files

Petya reads root `AGENTS.md` and `petya.md` (case-insensitive filenames) on each local-project request, including Git-ignored instruction files. They are separate project instructions, not keyword-selected reference documents. `petya.md` refines `AGENTS.md`; current user instructions and existing permission/confirmation requirements take precedence. Rules remain scoped to their connected project folder. Nested files are not automatically applied. Symlinks, ambiguous case variants, invalid UTF-8 and oversized files fail explicitly; instructions are never silently truncated. The combined instruction payload is limited to 24 KB.

MCP `read_project_instructions(projectId)` exposes the same reader for folders already connected in Petya, subject to the MCP project scope. It accepts no filesystem path and changes no files or permissions. The application feature API is `projectInstructions.read(projectId)`.

### Petya model runtime lifecycle

`petya_model_status`, `start_petya_model` and `stop_petya_model` share the
`modelRuntime` application feature and controller. Status requires MCP access to
the whole company; start/stop additionally require `edit`. Checks are repeated
inside the operation. No executable paths, tokens or arbitrary model names are
accepted. Stop cancels the service's queued and active inference requests.

Progress uses the stable `petya-model-runtime` notification, independent of the
settings view, with snapshot recovery after reopening. Start supports cancellation
and terminal errors support retry. Company teardown disposes the controller.

The bundled release catalog is intentionally empty until qualification and a
verified installation are complete. Starting therefore reports that a checked
release is unavailable. These controls do not download weights, change the chat
model. Requests explicitly selecting `petya-v1` on the configured local chat
endpoint now use the shared `modelRuntime` service through both scoped request
paths, including speculative answers. Other models retain their existing path.
The own runtime does not start automatically or fall back to Ollama on failure.
Cancellation and company teardown suppress stale chunks and final responses.
The installer, default-model setup and final platform validation remain
release work; the empty catalog still prevents loading an unqualified release.

The shared dialogue answer handler keeps an explicitly selected `petya-v1`
model pinned: it does not discover an alternative Ollama knowledge model,
restart Ollama, or apply Ollama-specific low-memory recovery to its failures.
Errors refer to Petya's model service; cancellation is reported as cancellation.
Malformed-response retry and the existing repeat guard remain active. This is
answer handling; production model execution still needs a qualified installation
and live application verification. `tests/dialogue-own-runtime.cjs` exercises this behavior
without loading model weights.


The internal own-model request route is shared application logic, not a new
raw-inference IPC or MCP endpoint. MCP lifecycle tools use the same controller;
they cannot supply runtime addresses or bypass installation qualification.
Chat submission and its existing application confirmations remain unchanged.
Routing is covered by `tests/model-runtime-router.cjs` and the feature test;
MCP lifecycle access remains covered by `tests/mcp.cjs`.

`tests/model-runtime-route-http.cjs` connects the shared feature, router,
controller and real runtime HTTP client to an authenticated loopback fixture.
It checks streaming and non-streaming responses, unchanged role history and
sampling, active and queued cancellation, no fallback on a stopped service,
restart and disposal. Its supervisor and replies are fixtures: this proves
transport integration, not model answer quality or an installed application
release.


### Shared per-chat model selection

`chatModels` owns the existing UI picker and MCP `list_chat_models(chatId)` /
`set_chat_model(chatId, model, previous)`. Pass the current selection returned
by the list as `previous`; an empty model restores the default. Reads respect
project scope. Writes require `edit` and recheck scope, chat identity, project,
version and prior selection after asynchronous discovery. No model is downloaded
or started by selection, and no chat message is submitted.

A qualified, ready own runtime exposes `petya-v1` independently of Ollama.
Selecting it does not call Ollama. A stopped or unqualified runtime cannot be
selected; an Ollama tag named `petya-v1` cannot bypass that gate. Other installed
local models retain the Ollama discovery path, with remote models excluded.
The picker supplies its chat ID and previous selection so a delayed request
cannot alter a different active conversation. Tests cover the shared service,
renderer binding and authenticated MCP calls. The production catalog remains
empty, so this does not admit the experimental training adapter.
