# Petya

A voice assistant for macOS and Windows (Electron, version 0.8.3). It lives in the tray, responds to "Петя", and works with context: Zoom meetings, Slack, Jira, Confluence, Notion, email, Telegram, and local projects. Speech recognition and the language model run locally (whisper.cpp / Qwen ASR, Ollama). The assistant itself speaks Russian.

What it does, in short:

- **Voice and text dialogue** with topics, conversation memory, and spoken replies.
- **Tasks:** creating and finding Jira issues, project status, team workload, duplicate detection.
- **Context:** meetings (system audio), Slack channels, Notion/Confluence documents, Gmail/Outlook, Telegram.
- **Actions:** drafting messages and tasks with confirmation, controlling apps on the computer, web search, analysing logs and attachments.

A detailed per-version feature history is in [docs/HISTORY.md](docs/HISTORY.md).

## Running

Requires Node.js 22.12+.

```sh
npm ci
npm start
```

Built-in OAuth clients are read from `src/integration-clients.json`, which is not in git (see `src/integration-clients.example.json`); without it the app starts and users configure their own clients. Services are configured in the app under «Подключения» (Connections). Answers need a local Ollama model (default `qwen3:4b`, `qwen3.5:9b` recommended); voice needs whisper.cpp (see the speech recognition section in [docs/HISTORY.md](docs/HISTORY.md#speech-recognition)).

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

Only via `python3 scripts/build.py` (`--mac`, `--win`, or both platforms without a flag). The output is the single current build per platform, `Petya.app` and `Petya-Setup.exe` in the project root; build and signing rules are in [AGENTS.md](AGENTS.md).

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
| `oauth/` | OAuth gateway and app registration ([REGISTRATION.md](oauth/REGISTRATION.md)) |
| `native/` | native macOS helpers (Swift) |
| `docs/` | module notes and evaluation reports |
| `tests/` | tests; `*-live.cjs` and `*-smoke.cjs` need Ollama or Electron |

## Data and security

Tokens are stored with Electron safeStorage (Keychain / DPAPI). Dialogue history is kept in the app data folder (`app.getPath('userData')`). The model and speech recognition accept only local addresses. OAuth secrets (`src/integration-clients.json`, `oauth/local/`, `.signing/`) are never committed.

## For agents

Project rules are in [AGENTS.md](AGENTS.md): builds, integration icons, Slack context, answer quality, language, and working alongside other agents.

### MCP access to chats

Open **Подключения → Доступ к чатам через MCP**, enable access, then copy the connection into your MCP client. The local Streamable HTTP endpoint uses a session bearer token. Stopping access, restarting Petya or switching companies ends that connection. Copy the new configuration after enabling it again.

- Discover projects and chat IDs with `list_chat_projects` and `list_chats`.
- Read, replace or clear a composer draft with `get_chat_draft` and `set_chat_draft`. Supply the previous text to avoid overwriting a concurrent edit. Use the project draft owner for a new chat. Preview content with `read_draft_attachment`. Add or remove attachments with `add_draft_attachment` and `remove_draft_attachment` (base64 text files, DOCX or images up to 1 MiB).
- Inspect versions with `list_chat_versions` and `read_chat_version`. Use `select_chat_version` to switch, or `prepare_chat_version` to stage an edited or repeated question. The user sends it from Petya; preparing a version runs no commands.
- Use `list_chat_materials`, `read_chat_material` and `set_chat_material_enabled` to inspect and change the selected chat's context. `add_chat_note` saves a note in the company's shared memory.

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

### Unity layout extension (0.8.3)

The chat extension **Вёрстка Unity** requires Unity Editor and either Figma or Zeplin. In settings, enter a Figma personal access token with `file_content:read` or a Zeplin access token, then paste a Figma frame URL containing `node-id` or `https://app.zeplin.io/project/PROJECT/screen/SCREEN`. Tokens use the existing OS-encrypted, company-specific settings store and are redacted from public settings. No OAuth application is provisioned; personal-token connections do not provide an application icon setting.

The extension reads the selected frame/screen and prepares fixed-position UI Toolkit UXML. Review the markup before importing. Unity must expose `execute_code`; import requires the existing confirmation dialog in Petya and creates a uniquely named asset under `Assets/PetyaLayouts`, without overwriting existing files or changing the scene. Select the intended editor when multiple Unity instances are open. This is a basic layout scaffold: images, custom fonts, effects, responsive constraints, and interactions need manual work. Large frames are rejected with a request to select a smaller frame.

MCP tools `prepare_unity_layout(chatId, url)` and `apply_unity_layout(chatId, proposalId, instance?)` use the same application logic as the UI, require edit access, and enforce chat/project scope and current dependencies. `list_chat_extensions` includes the extension; `use_chat_extension` accepts a layout request with a frame URL. Proposals are session-local: prepare again after restarting Petya or changing chat, company, or credentials. Background progress is shown in the notification center and restored from `layout.status` when the window reopens. Connection credentials can only be configured in the application settings.

API references: [Figma file nodes](https://developers.figma.com/docs/rest-api/file-endpoints/), [Zeplin screen versions](https://docs.zeplin.dev/reference/screen_version), and [Zeplin layers](https://docs.zeplin.dev/reference/layer). Validation: `tests/layout-mcp.cjs` runs through the real MCP client from `tests/mcp.cjs`, using fixture design responses and a stub Unity invocation; live service credentials and a Unity Editor are not required for this check. A separate real-editor check, `tests/layout-unity-live.cjs`, verifies the imported hierarchy and resolved geometry, text size and color for both providers; see [verification results and reproduction](docs/layout-verification.md).

### Automatic work context

Vague questions such as «посмотри что не так» resolve saved context before answering: the latest eligible Zoom session, otherwise team requests in synced Slack threads. Existing chat materials take precedence. Selected projects restrict Slack channels; ambiguous channels without a project require clarification. Selected-project Zoom context must identify that project. Sources, timestamps and bounded text snapshots stay in the chat for follow-up questions. Missing recordings or unsynced Slack messages cannot be inferred.

`resolve_work_context(chatId)` uses the same resolver and returns evidence for an MCP assistant to answer. It is read-only; project-scoped clients can only discover shared materials already referenced in their authorized project. Excluded materials and disabled project services remain excluded. Recording permissions, connection settings and sending messages remain in the application.
