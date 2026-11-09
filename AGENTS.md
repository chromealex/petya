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

# Versions and releases

- Every change to the app that reaches `main` (src, assets, packaging) raises the version; documentation, tests, training data and CI alone do not: a fix or small change is a patch (`0.10.0` → `0.10.1`), a new feature or app a minor (`0.10.1` → `0.11.0`). Run `node scripts/bump-version.cjs patch|minor` — it updates `package.json`, `package-lock.json`, the window footer, its English string, the Codex client info and the README badge together (the list is `scripts/version-places.cjs`).
- In the same commit add a section at the top of `docs/HISTORY.md`: `## x.y.z — what changed`, then short bullets for people, not commit messages. The release notes are taken from this section. `tests/version.cjs` (part of `npm test`) fails until the version matches everywhere and the section is there.
- Several agents merging at once: bump on top of the current `main` right before merging; if someone else took the number, take the next one.
- Each version also gets a post for the team channels (Slack #jw-petya, Telegram @aipetya), in Russian, for people: `docs/announcements/<version>.md` — `# Заголовок`, then short bullets on what changed for them. A new or changed screen ships its screenshot in `docs/screenshots/<version>/` (up to six PNGs, from the feature's UI test or `tests/card-shot.cjs`; look at it before committing). The Release workflow posts both when it publishes the release (`scripts/announce.cjs`, `.github/workflows/announce.yml`); a model release (`andromeda-dN`) is posted separately when its GitHub release is published, so write its release notes for people too.
- A release is the tag `v<version>` on `main` (`git tag v0.10.1 && git push origin v0.10.1`, or run the Release workflow): GitHub Actions builds `Petya-Setup.exe` and the notarized `Petya.dmg` (Apple Silicon; needs the signing secrets in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#releases)) and publishes the release with that HISTORY section. The local Mac build is still `python3 scripts/build.py --mac` (see Builds).

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

- A capability the user adds from the catalog (a service, cards, an app) is an **extension** — see «Extensions» below. Core functionality goes into a feature module in `src/features/` and one line in `src/features.cjs`, not into `src/main.cjs`.
- A feature exports `{ name, defaults, validate(next), setup(services) }`: `defaults` are its settings, `validate` checks them on save, `setup` creates its services and IPC handlers and returns `{ipc}` (reachable as `window.petya.feature(name, method, …)`) plus the services other code may use. Everything except `ipc` is merged **flat** into `services` (`services.agentTeam` in `converse.cjs`): return one unique key (best: the feature's `name`) or none, never a generic one that overwrites another service.
- `services` gives live access to shared state (`settings`, `dialogue`, `chatJobs`, `request`, `win`, …). Features are set up last, so everything they read already exists.
- Larger groups of existing main-process code live in `src/*-setup.cjs`; move code out of `main.cjs` rather than adding to it.

# Background operations and notifications

- Proactively integrate every new or changed user-visible download, installation, update, and long-running background operation with the notification center (`src/ui/notifications.js`). Do not wait for a separate user request.
- Publish progress from the operation owner, independent of the settings view. Provide an IPC event and a current-state snapshot so reopening the window restores active progress.
- Use one stable notification ID per operation, update its card in place, and report completion or actionable errors. Offer retry, cancellation, or navigation only when supported. Never reset unread state for every progress tick.
- Show real progress percentages only when the total is known; otherwise show the actual stage with indeterminate progress. Do not imply that checking, downloading, and installing are the same stage.
- Verify progress and completion with settings closed, failure handling, and duplicate-start behavior. Keep notifications compact and accessible.

# Extensions

The full specification, the minimal example and the checklist are in `docs/extensions.md`; read it before writing or changing an extension. Obligatory:

- **One directory owns everything.** An extension is `src/extensions/<id>/` (bundled), `<userData>/extensions/<id>/` (installed from a folder or .zip) or the development folder, with the same layout: `extension.json`, `icon.svg`, `feature.cjs`, `offer.cjs`, cards, `settings.js`, providers, `docs/apps/<id>.md` for bundled ones. Its settings markup, renderer, notifications and backend stay in that directory; do not add extension-specific settings controls, script tags or activation branches to the application shell, the catalog or the host.
- `extension.json` declares id, Russian name/description, `category`, `icon`, 2–6 `examples`, `setting` (`extension_<id>`), whether it has settings (`"settings": false` explicitly), `feature`, `scripts`, `results`, and `connects`/`uses`/`provides`/`downloads`/`version` when they apply.
- **Discovery goes through `src/extension-registry.cjs`.** Code that scans extension folders uses `registry.live()`/`registry.files(name)` and caches with `registry.cached()`; never read `src/extensions` directly. Bundled ids win: an external extension can never shadow or patch a bundled one.
- **`feature.turn(s, command)` returns `null` unless the request is clearly for this app and `kit.installed(s, id)`**; added but not connected → a short question saying where to connect. `setup` returns `{ipc}` and at most its own name (flat-merge rule above); `teardown()` stops everything `setup` started.
- **`offer.cjs` is precise**: explicit `names`, narrow `topics`, every known near-miss in `avoid`, `ready` = added and connected; add `own`/`not` rows to `tests/extension-offers-matrix.cjs`. Ties are asked, never guessed.
- **Cards** are built only with `window.resultKit`, contain a real visualization of the data, never set `innerHTML` from data, mark content `data-no-i18n` and format with `window.petyaLocale`.
- **An app's own interface outside the chat** — a page in the left rail or a tab on a page («Навыки», «Команда», another app's page) — is declared in `extension.json` `ui` (`pages: [{id, title, icon, after | group, render}]`, `tabs: [{page, title, render, order?}]`, `personFields: [{key, title, render, order?}]` — a field on the cards of «Команда») and drawn by its renderer `render(container, {feature, onShow, kit})` (`docs/extensions.md` §8a). Never add an app's card, tab or rail button to a core page by hand: tabs of every page go through the one tab host (`src/ui/page-tabs.js`), core pages included; tabs with the same name from several apps are one tab with a section per app. Data an app owns lives in the app, not in core (`tests/core-reminders-guard.cjs`, `tests/core-mail-rules-guard.cjs` keep reminders and mail rules there). What an app adds to Petya's own features goes through a registry, never a hard-coded entry: voice-command actions (`voice-action`), sections of the daily summary (`summary-section`), «Развитие» points for knowledge it keeps (`growth-source`), the «С чего начать» buttons (`quickStart`), tools of the semantic router (`route-tool`), its place in the request pipeline (`chat-route`), chat subjects it reads data for (`dialogue-kind`), documentation sources of the decomposition (`doc-source`), the check of a service card it owns (`connection-check`), and its settings' size and public flags (feature `limits`, `publicFlags`).
- **Side effects only after explicit confirmation** (a button the user pressed or the shared question panel), never from a chat turn by itself; long work goes to the notification center; missing input is a clarification (`input-required.cjs`) before side effects.
- Actions that belong to another app go through `k.links(kind, …)` and `provides` (`src/features/app-links.cjs`); never hard-code another app. Several services for one kind of data → a source kind, not branches.
- Reuse shared credential adapters for service connections; do not duplicate credentials. Tokens are feature `secrets`.
- Downloads are declared in `downloads` with `downloads.cjs` `present()`; the catalog shows the weight.
- Translations ship with the strings (`src/locales/en.json`; external extensions: their `locales/en.json`).
- **Tests:** a unit test with stubbed services (near-misses, not added, not connected, errors, no model); a UI test that renders the card and saves a `tests/card-shot.cjs` screenshot **that you open and look at**; the test in the `tests/apps-ui.sh` list; validate discovery and added/removed behaviour, including notifications while settings are closed; then `npm test`. No real credentials: real endpoints, stubbed responses, and say in the docs what is verified live.
- **Installed extensions are not sandboxed**: they run with Petya's rights. Keep the review dialog, the explicit confirmation, the archive/path checks and the `petya-ext://` confinement intact; never load external code another way.
- **Build extensions against a running Petya, not a rebuild**: Settings → «Расширения» → «Папка разработки» loads a folder as an extension and reloads it on every save (`docs/extensions.md` §15).

# Missing information in chat

- Missing input, ambiguous targets and prerequisites are clarification states, not technical errors. Ask in chat, retain the original request and resume the exact unfinished step after the answer.
- Use `input-required.cjs` with the scoped `clarifications` feature for new workflows, or an existing scoped continuation. Supply concrete choices when available, otherwise an inline input. Never ask the user to retype the original request.
- Emit a clarification before side effects. Never retry an external write with an unknown outcome. Revalidate company, project, chat/version and connection before continuing; support cancellation and reject stale answers.
- Test a multi-step clarification, invalid/missing input, cancellation, context changes and duplicate submission. Genuine connection, permission and execution failures must remain distinguishable from missing data.

- Chat clarification and permission controls must use the shared question panel in `src/ui/chat-clarification.js` (`createChatQuestion` / `renderClarification`). Keep the question and actions in the composer; use the main composer for free text. Dismiss the panel before resuming or cancelling, report outcomes in chat, and keep only a new unanswered question visible. Test duplicate clicks, follow-up questions, failures, and chat ownership. Do not introduce a second inline input or a separate permission style.

- A meeting recording outlives a company switch (`src/meeting-carry.cjs`): the company that records keeps its recorder in the background, its tab shows a red dot, the open company shows that meeting and can stop it but starts none of its own; recognition waits until the recording company is open again. Never stop a recording or block a company switch because of it; anything a recorder uses of its company goes through `bind.s`, not a captured `s`.

# Interface rules
- Colours in stylesheets are theme tokens (`src/ui/theme.css`: `--bg`, `--panel`, `--panel-2`, `--hover`, `--line`, `--ink`, `--muted`, `--accent`/`--green`, `--on-accent`, `--ok`, `--warn`, `--alert`, `--info`, `--violet`; translucent overlays are `color-mix(in srgb,var(--on) N%,transparent)`), never literal hex — the appearance setting (light/dark/presets/accent, `src/appearance.cjs`) must reach every screen. `node scripts/theme-tokens.cjs` rewrites literals; `tests/appearance.cjs` fails on any left.
- Scrollbars look the same everywhere — the chat's thin thumb, set once at the top of `src/ui/style.css`. Do not style scrollbars per element (only hiding one, like the chat timeline's, is allowed).
- Delete is a red trash-can icon button, everywhere: build it with `window.deleteButton(label, onClick)` or turn an existing button into one with `window.asDeleteButton(button, label)` (`src/ui/delete-button.js`, style `.delete-button` in `ux-pass.css`). The label (e.g. «Удалить участника», «Удалить из очереди») stays as the tooltip and accessible name. No text «Удалить» buttons, no grey «×» for deleting.
- «Убрать» / «Отвязать» (remove from a selection, unlink, detach a file) is not a delete: keep those as ordinary buttons.
- A delete that loses data asks for confirmation or offers «Отменить»; deleted company data goes to the Trash.
- Moments in time are relative: «12 секунд назад», «5 минут назад», «сегодня в 14:05», «вчера в 23:30», «в понедельник в 10:00»; a date only when it is more than a week away; the full date and time on hover. Use `window.timeElement(date)` (a `<time>` that keeps itself current), `window.relativeTime(date)` for text, `window.shortTime(date)` in narrow lists (`src/ui/relative-time.js`). Any `<time datetime>` is made relative automatically; add `data-absolute` for a clock that must stay absolute (e.g. times inside a meeting transcript). Deadlines and birthdays are dates, not moments.
- Interface chrome (titles, tabs, buttons, labels, statuses, card headers) is not selectable: `body` has `user-select:none`. Content people copy — chat messages, inputs, code, file and document text, errors — opts back in via the list at the end of `ux-pass.css`; add new content containers there (or give them the `selectable` class).
- Web pages open in the browser next to the chat, not in a separate window: `window.openChatBrowser(url)` in the renderer, `s.chatBrowser.open(topicId, url)` in the main process (`src/features/chat-browser.cjs`). Each chat keeps its own page; Cmd/Ctrl+click and «Открыть в системном браузере» use the system browser.
- When Petya's own browsing stops at a page that needs the person (sign-in, CAPTCHA, consent), open it in that chat's browser with `s.chatBrowser.attend(topicId, {url, partition, message, action, onAction, passed, onPassed})`, in the session Petya browses with (`petya-web-search` for search, `petya-service-<id>` for services), so what the person passes there applies to Petya. Continue by itself once `passed(url)` is true; a separate window is only the fallback when no chat is open.
- No system dialogs: confirmations and questions use Petya's own dialog — `await window.petyaConfirm(text, {detail, ok})` / `window.petyaAsk({...})` in the renderer (`src/ui/app-dialog.js`), `require('./app-dialog.cjs').showMessageBox(win, options)` in the main process (same signature and answer as Electron's; the system box only when the window is not ready). File pickers stay the system ones.
- Slack messages open in the Slack app (`window.petya.feature('slack','open', url)`, the Slack app's link opener), not in a browser.
- Cards with data (lists, charts, statuses) can go on dashboards (docs/dashboards.md). A new extension with read-only requests exports `dashboard: {accepts(command), widgets}` from its `feature.cjs`; `accepts` refuses anything that changes data, because the dashboard repeats the request by itself. An app with sources of its own lists them in `dashboard.sources` (with the names a request may use, as Grafana answers to its host «wombyte»), so «… (из wombyte)» selects that source. «Собери дашборд» adds the catalog apps it needs that need nothing connected by itself, names the connection for the others, and asks for a page URL for what no app shows (a web-page widget) — never answer «подключите приложения» without saying which, or without adding what can be added.
