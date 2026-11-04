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
