# Language

- Write commit messages, documentation (README, AGENTS.md, `docs/`), and code comments in English.
- Petya's interface is written in Russian (the source language) and localized: see "Interface localization" below. Spoken replies, model prompts, and test scenarios that check Russian answers stay in Russian; the reply language is the separate «Язык ответов» setting (`communicationLanguage`: `auto` answers in the language of the question, or a fixed code), and the speech recognition hint is «Язык речи» (`speechLanguage`); both are resolved in `src/question-language.cjs` — read them through it, not directly.

# Interface localization

- The interface language follows the system language by default; the user can fix it in Settings → «Язык интерфейса» (`system`, `ru`, `en`). The choice is application-wide, stored in `userData/interface-language.json` (`src/interface-language.cjs`, feature `src/features/interface-language.cjs`). Unsupported system languages fall back to English.
- Every new or changed user-visible string ships with its translation in the same commit: write the text in Russian as before, then add the English entry to `src/locales/en.json` (`strings`, keyed by the exact trimmed Russian text). `node scripts/i18n-strings.cjs --missing en` lists what is missing; `tests/interface-language.cjs` (part of `npm test`) fails until it is empty. Text that must stay as written (Russian name forms) goes to `untranslated`.
- This applies to renderer markup and scripts (`src/ui`), extensions (`src/extensions/<app>`: cards, settings, `extension.json`), and main-process text that reaches the user: `Error(...)` messages shown as notices, `label`/`title`/`message` of menus, notifications and progress, tray menu, dialogs and notifications (`require('./interface-language.cjs').t(text)`).
- Renderer text is translated automatically as it enters the DOM (`src/ui/i18n.js`), including text composed from literals: keep each literal a complete phrase or fragment (`'Скачать язык: '+name`), not single letters or word endings, and do not build words from parts. For text that does not pass through the DOM (canvas, clipboard, `document.title`, values compared later), call `window.t('…')`.
- Never translate user or model content: chat message text (`.message-content`), inputs and editable areas are skipped; mark any other content area with `data-no-i18n` (or `translate="no"`, e.g. for language names that stay in their own language).
- Code must not depend on the displayed language: do not compare `textContent` or button labels with Russian literals; keep state in variables or `data-*` attributes (where old code compares, accept both `text` and `window.t(text)`). Format dates and numbers with `window.petyaLocale`, not a hard-coded `'ru-RU'`.
- Requests in other languages are rewritten into Russian by the local model before routing (`src/command-language.cjs`, called from `src/converse.cjs`); the chat keeps the user's own words (`routedText` holds the rewrite). New shortcut handlers match Russian phrasing only — do not add English or other-language patterns next to Russian ones. The wake word is accepted as «Петя» or Latin «Petya».
- Window-level UI tests run in Russian (`PETYA_SMOKE_TEST`); set `PETYA_INTERFACE_LANGUAGE=en` to check the English interface (`npm run test:interface-language-ui`). Adding a language means a new `src/locales/<code>.json` and its code in `SUPPORTED` in `src/ui/i18n-core.js`.

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

# Interface rules
- Delete is a red trash-can icon button, everywhere: build it with `window.deleteButton(label, onClick)` or turn an existing button into one with `window.asDeleteButton(button, label)` (`src/ui/delete-button.js`, style `.delete-button` in `ux-pass.css`). The label (e.g. «Удалить участника», «Удалить из очереди») stays as the tooltip and accessible name. No text «Удалить» buttons, no grey «×» for deleting.
- «Убрать» / «Отвязать» (remove from a selection, unlink, detach a file) is not a delete: keep those as ordinary buttons.
- A delete that loses data asks for confirmation or offers «Отменить»; deleted company data goes to the Trash.
