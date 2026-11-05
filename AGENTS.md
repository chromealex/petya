# Language

- Write commit messages, documentation (README, AGENTS.md, `docs/`), and code comments in English.
- Petya's user-facing text stays in Russian: UI strings, spoken replies, model prompts, and test scenarios that check Russian answers.

# Builds

- The user requires exactly one current build per platform: `/Users/aleksandrfeer/Projects/Peter/Petya.app` for macOS and `/Users/aleksandrfeer/Projects/Peter/Petya-Setup.exe` for Windows.
- Build only with `python3 scripts/build.py` (`--mac`, `--win`, or both platforms without a flag). The npm build commands redirect to this script.
- Do not create backup, dated, or versioned `.app`, EXE, ZIP, or DMG files, or copies of builds in other folders. A new verified build replaces the current one at the same path.
- A temporary build is allowed only in the system temp directory for the duration of the process; delete it after both success and failure. Never run several builds at once.
- Copy the whole `src`, not individual changed files. Before publishing, check the package contents with `scripts/verify-package.py`; on macOS, verify the signature with the existing Developer ID and that the installed app launches.
- When cleaning builds, never delete sources, Electron dependencies, the speech-recognition runtime, user settings, or keys.

# Petya's icon in integrations

- Every bot, OAuth app, and integration of Petya must have Petya's icon set on the service side, including new integrations. Use the existing asset `assets/app-icon.png`.
- When creating or configuring an integration, save the icon and check that the service displays it. If the service does not support an icon or there is no access to its settings, tell the user explicitly.

# Slack context

- User requirement: a channel's purpose ("development", "QA") is not an unambiguous address. `jw-bw-dev` and `jw-mw-dev` belong to different projects. Do not create a global "development → one channel" mapping.
- For reading, team fill-in, and especially sending messages, take into account the current company, the explicitly selected project, and the source thread. If the context does not yield a single recipient, ask by voice for the project or channel with concrete options. Never pick the first or most recent channel by default.
- An explicitly named exact channel takes priority. Re-check the previous choice when the topic, project, or connection changes. Do not carry a choice over from one project to another.

# Answer quality: no prompt patches

- Do not add rules, reference notes, or special cases to the system prompt in `src/dialogue-request.cjs` just to make individual scenarios pass (scale-eval, answer-100, etc.). A small local model loses the conversation under a long list of rules: tests turn green while live dialogue gets dumber. Keep the base prompt short (the `answer-request` test limits its length).
- Fix a failing scenario in the data, routing, or evidence extraction — or fix the scenario itself if it is wrong. If the prompt really must change, replace or generalize an existing rule instead of appending a new one, and check long dialogues.
- Conversation history is sent to the model as `user`/`assistant` turns, not as a string inside the reference data. Do not bring back the old scheme.
- Do not disable the repeat guard (`src/answer-repeat.cjs`) and do not return to `temperature: 0` for ordinary dialogue.
- Test scenarios beyond 1–2 turns: follow-ups ("а он?", "нет, другое"), a repeated question (the answer must not match the previous one), topic changes, and corrections in conversations of 5–10 turns (`tests/long-dialogue-live.cjs`).

# Working alongside other agents

- Several agents may work in this folder at the same time. Before starting, check `git status` and `git log -5`; edit files in place instead of overwriting them from an old copy.
- Commit in small, complete steps, only your own files (`git add <files>`, not `git add -A`), with tests passing.
- Prefer your own git worktree (`git worktree add ../Peter-<task> -b <task>`) over editing the shared folder; uncommitted edits in the shared folder block everyone else's `git pull`. Commit after every finished step.

# Adding a feature

- New functionality goes into a feature module in `src/features/` and one line in `src/features.cjs`, not into `src/main.cjs`.
- A feature exports `{ name, defaults, validate(next), setup(services) }`: `defaults` are its settings, `validate` checks them on save, `setup` creates its services and IPC handlers (`services.handle(...)`) and returns the services other code may use (they become `services.<name>`, e.g. `services.agentTeam` in `converse.cjs`).
- `services` gives live access to shared state (`settings`, `dialogue`, `chatJobs`, `request`, `win`, …). Features are set up last, so everything they read already exists.
- Larger groups of existing main-process code live in `src/*-setup.cjs`; move code out of `main.cjs` rather than adding to it.

# Background operations and notifications

- Proactively integrate every new or changed user-visible download, installation, update, and long-running background operation with the notification center (`src/ui/notifications.js`). Do not wait for a separate user request.
- Publish progress from the operation owner, independent of the settings view. Provide an IPC event and a current-state snapshot so reopening the window restores active progress.
- Use one stable notification ID per operation, update its card in place, and report completion or actionable errors. Offer retry, cancellation, or navigation only when supported. Never reset unread state for every progress tick.
- Show real progress percentages only when the total is known; otherwise show the actual stage with indeterminate progress. Do not imply that checking, downloading, and installing are the same stage.
- Verify progress and completion with settings closed, failure handling, and duplicate-start behavior. Keep notifications compact and accessible.

# Extension settings ownership

- Each extension directory declares `extension.json`, including whether it has settings. Keep its settings markup, renderer, operation notifications and backend implementation in that directory.
- Use the generic extension host and catalog. Do not add extension-specific settings controls, script tags or activation branches to the application shell.
- Reuse shared credential adapters for service connections; do not duplicate credentials. Extensions without settings must explicitly declare that fact.
- Validate extension discovery and installed/uninstalled behavior, including notifications while settings are closed.

# Missing information in chat

- Missing input, ambiguous targets and prerequisites are clarification states, not technical errors. Ask in chat, retain the original request and resume the exact unfinished step after the answer.
- Use `input-required.cjs` with the scoped `clarifications` feature for new workflows, or an existing scoped continuation. Supply concrete choices when available, otherwise an inline input. Never ask the user to retype the original request.
- Emit a clarification before side effects. Never retry an external write with an unknown outcome. Revalidate company, project, chat/version and connection before continuing; support cancellation and reject stale answers.
- Test a multi-step clarification, invalid/missing input, cancellation, context changes and duplicate submission. Genuine connection, permission and execution failures must remain distinguishable from missing data.

- Chat clarification and permission controls must use the shared question panel in `src/ui/chat-clarification.js` (`createChatQuestion` / `renderClarification`). Keep the question and actions in the composer; use the main composer for free text. Dismiss the panel before resuming or cancelling, report outcomes in chat, and keep only a new unanswered question visible. Test duplicate clicks, follow-up questions, failures, and chat ownership. Do not introduce a second inline input or a separate permission style.
