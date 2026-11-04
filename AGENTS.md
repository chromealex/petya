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

# Background operations and notifications

- Proactively integrate every new or changed user-visible download, installation, update, and long-running background operation with the notification center (`src/ui/notifications.js`). Do not wait for a separate user request.
- Publish progress from the operation owner, independent of the settings view. Provide an IPC event and a current-state snapshot so reopening the window restores active progress.
- Use one stable notification ID per operation, update its card in place, and report completion or actionable errors. Offer retry, cancellation, or navigation only when supported. Never reset unread state for every progress tick.
- Show real progress percentages only when the total is known; otherwise show the actual stage with indeterminate progress. Do not imply that checking, downloading, and installing are the same stage.
- Verify progress and completion with settings closed, failure handling, and duplicate-start behavior. Keep notifications compact and accessible.
