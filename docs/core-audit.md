# Core audit: what is still service- or app-specific in Petya's core

The plan for the next round of «выноси все максимально в приложения»: the core (`src/*.cjs|js|ps1`,
`src/features/*.cjs`, `src/ui/*.js`, `src/ui/*.css`, `src/ui/index.html`) should know no service and no app by name;
every service lives in its app (`src/extensions/<id>/`) and plugs in through a registry or contribution point
(`docs/extensions.md`).

- Scope of this list: everything except Slack, Telegram, Jira, Asana, Atlassian (Confluence), mail (Gmail, Outlook /
  Microsoft 365 mail), Notion and Google Play, which their own lanes move; their leftovers are added below in
  «Leftovers of the other lanes».
- Method: a scan of every core file for each extension's id, path, feature name and settings switch, and for ~30
  service names (`tests/core-guard-kit.cjs` has the scan; the guards `tests/core-*-guard.cjs` keep what was moved out).
  Line numbers are those of branch `core-out-dev-audit` (on top of `apps-own-their-ui`).
- Effort: **S** — under an hour, one or two files; **M** — half a day, a small generic hook and a test; **L** — a day or
  more, a new registry several lanes share or a stored-data change.

## Done in this round (lane dev-audit)

| Was | Now | Mechanism |
|---|---|---|
| `src/git-workspace.cjs`, `src/git-intent.cjs` | `src/extensions/git/workspace.cjs`, `intent.cjs` | `services.gitWorkspace` from the app's `feature.cjs` (name `gitWorkspace`) |
| `src/git-setup.cjs` (Git IPC + local project IPC) | Git IPC → `src/extensions/git/feature.cjs` (`window.petya.feature('gitWorkspace', …)`); local project IPC → `src/local-project-setup.cjs` | feature IPC |
| Git handler in `src/converse.cjs`, `git-input` in `clarification-runtime.cjs`, `git-read` in `capabilities.cjs`, `chat-jobs.cjs` check | `src/extensions/git/chat-route.cjs` | **new** `chat-route` registry (`src/features/chat-routes.cjs`) |
| `src/ui/git-workspace.js` + its rules in `style.css` | `src/extensions/git/git-panel.js`, `git-panel.css` | app script (after `project-sidebar.js`) |
| `src/build-watch.cjs`, `build-question.cjs`, `build-repair.cjs`, `build-repair-sources.cjs` | `src/extensions/ci-builds/` (same names) + `build-flows.cjs` (per company) | chat route (stage `builds`), **new** company lifecycle (`src/features/lifecycle.cjs`), feature IPC `repairSelect` / `questionSelect`, settings migration |
| build objects, ticks, resets, pruning, clearing in `src/main.cjs`; `buildRepair` / `buildQuestion` in `services` and `converse.cjs` | the app's feature (its own timer; lifecycle listeners) | lifecycle events `settings-saved`, `project-switched`, `topic-removed`, `contexts-cleared`, `company-closing` |
| Unity handler in `converse.cjs`, `unity` entry in `capabilities.cjs` | `src/extensions/unity/chat-route.cjs` (`handlesOff`) | chat route |
| Unity player icon / ranking in `src/project-icon.cjs`; `bundleVersion` in the Git version answer | `src/extensions/unity/project-detector.cjs` | **new** `project-detector` registry (`src/features/project-detectors.cjs`) |
| `unityToken` in `main.cjs` secrets / `publicSettings` | `secrets: ['unityToken']` of the Unity feature | feature secrets |
| `onUnityProgress` (preload), its handler in `notifications.js`; `.unity-prefab-actions` in `style.css` | `extension-install-progress` (generic channel) + snapshot via `petya-ui-notification` in `unity/chat.js`; `unity/chat.css` | notification center |
| `onMotionProgress` (preload), its handler in `notifications.js`; `.blender-motion-card` in `style.css` | the same for Blender (`blender/feature.cjs`, `chat.js`, `chat.css`) | notification center |
| `src/features/unity.cjs` (unused alias) | removed | — |

## Decision: «Имя на встречах» on «Команда» stays in the core

`meetingName` (`src/team.cjs:1`, `src/ui/team.js:5-36,115-167`, `src/team-match.cjs:25-27`, `src/meeting-company.cjs:14-16`,
`src/features/materials.cjs:33-34`) is **core**, not an app field:
- meetings are a core capability: recording, recognition, speakers, summaries and the meeting memory live in the core
  (`src/meeting-*.cjs`, `src/features/meeting-*.cjs`); the meeting apps (Zoom, Google Meet, Teams) are only *sources*
  (`meeting-source`) that tell the core who spoke;
- the field is service-agnostic: it names how a colleague shows up in *any* meeting (Zoom, Meet, Teams, a local
  recording with recognised speakers), and the names it is chosen from come from the core's meeting memory
  (`materials.meetingNames`), not from one app;
- the core's own matching of speakers to people (`team-match.cjs`, `meeting-company.cjs`) reads it; an app field
  (`ui.personFields`) is for data an app owns and the core does not read (like «День рождения»);
- `src/meeting-migration.cjs:39` already migrated the old Zoom-named field (`zoomName` → `meetingName`) so nothing
  service-specific is left in it.
If meetings themselves ever become an app, the field moves with them as a `personFields` entry with `key:
'meetingName'` (no data migration: the value already lives in the person record).

## Remaining service- and app-specific pieces

### A. Service modules, connections and the catalog (cross-lane — one generic registry)

| # | file:line | What | Owner | Mechanism | Effort |
|---|---|---|---|---|---|
| A1 | `src/modules.cjs:3-4` | the list of service modules (`unity`, `telegram`, `slack`, … `ai`, `googleplay`, `gmail`, `web`) and the `claude`/`codex` → `ai`, `outlook` → `gmail` key aliases | each app (`service` in extension.json) | build `optional` from descriptors with `service`; core modules (`ai`, `web`) stay in a short core list | M (cross-lane) |
| A2 | `src/project-settings.cjs:2-3` | display names of modules per project; «connected» special-cased for `ai`, `web`, `unity` | apps | descriptor `name` + `offer.connected` | S after A1 |
| A3 | `src/ui/modules.js:1` | `optionalModules` names in the renderer | apps | from `extensionUI.descriptors` | S after A1 |
| A4 | `src/ui/app-catalog.js:2,18` | catalog descriptions and artwork of service modules (Unity, Slack, Jira, …) | apps | descriptor `description` / `icon` (Unity already has `icon.svg`) | S after A1 |
| A5 | `src/ui/startup-connections.js:8-10`, `src/ui/connection-sidebar.js:34`, `src/connections-setup.cjs:19-23` | fixed lists of services checked at startup / shown in the sidebar (incl. `claude`, `codex`, `meetings`, `images`) | apps (+ core for whisper/ollama/meetings) | a «settings-connection» registry: `{id, name, check(services)}` per app | M (cross-lane) |
| A6 | `src/main.cjs:211` | changing `unityUrl` without a new token clears `unityToken` | unity | a settings hook with `{before, next, input}` (e.g. feature `normalize(next, before, input)` next to `validate`) | S |

### B. MCP server tools of apps

| # | file:line | What | Owner | Mechanism | Effort |
|---|---|---|---|---|---|
| B1 | `src/mcp-chat-tools.cjs:48-53`, `src/main.cjs:577` (`invokeUnity`) | Unity editor tools registered on Petya's MCP server | unity | an «mcp-tool» contribution: apps export `mcp.register(server, z, deps)` and the server loops over added apps' features; `deps.services` instead of per-app callbacks | M |
| B2 | `src/mcp.cjs:18`, `src/features.cjs:10`, `src/features/python.cjs` | Python tools + the compatibility alias that also makes Python a core feature | python | the same loop; `feature` in `python/extension.json`, drop the alias (keep `name`) | M |
| B3 | `src/mcp.cjs:25`, `src/features/blender-motion.cjs` | Blender animation tools + alias (tests import the alias) | blender | the same; tests require the app file | S after B1 |
| B4 | `src/mcp.cjs:26`, `src/features/layout.cjs` | layout tools + alias | layout | the same | S after B1 |
| B5 | `src/mcp.cjs:27-44`, `src/main.cjs:583` (`generatePainting`), `src/features/artist.cjs` | `generate_painting` tool written in the core | artist | the app's `mcp.register` | S after B1 |

### C. Chat pipeline and message rendering

| # | file:line | What | Owner | Mechanism | Effort |
|---|---|---|---|---|---|
| C1 | `src/converse.cjs:90-117` | drawing route: `imagePrompt`, then «Художник» (`ctx.artist`, `artistEnabled`) or local images | artist (+ core local images) | a chat route of the artist app (stage `commands`, after Git/Unity) that takes the request when enabled; the core keeps local images | M |
| C2 | `src/main.cjs:477,487` | `services.artist.stop()` on «отменить картинку» and on quit | artist | lifecycle event `quit` / an image-cancel event | S |
| C3 | `src/ui/dialogue.js:108` | `m.unityRequest` / `m.unityPrefab` message fields drawn by Unity's renderers | unity | store them in `message.extensionData` and declare `results` (keep reading the old fields in `unity/chat.js` for old messages) | M |
| C4 | `src/ui/message-format.js:71` | `message.motionMode` drawn by Blender's `renderMotionCard` | blender | the same (`results`) | M |
| C5 | `src/ui/dialogue.js:158`, `src/ui/chat-clarification.js:17` | `gitDiscovery` choice buttons («Работать с …», «Создать Git в …») | git | one generic result shape for choices: `choices: {feature, method, items}` (buttons call the app's IPC; voice picks by number) | M (shared with C6) |
| C6 | `src/ui/dialogue.js:178-183,205`, `src/ui/chat-clarification.js:15`, `src/chat-jobs.cjs:67` | `repairChoices`, `buildQuestionChoices`, `buildQuestionRetry` result keys (and `slackRequestChoices`, `reviewChoices`, `trackingChoices` of other lanes) | ci-builds (+ Slack, Jira lanes) | the same generic `choices` | M (cross-lane) |
| C7 | `src/main.cjs:368` | the Slack review flow gets the build watch as `services.ciBuilds?.watch` | ci-builds ↔ slack | goes with `src/review-assistant.cjs` to the Slack app; then the Slack app asks `ciBuilds` through a cross-app kind («build-watch») | S (Slack lane) |
| C8 | `src/ui/ux-pass.css:10-11,49` | the chat heading's order slot for `#project-git-open` | git | a heading-button contribution with an order (`ui.headingButtons`) or a generic `data-heading-order` | S |
| C9 | `src/capabilities.cjs:57` | `SERVICES` words the meaning router may restate (`unity`, `git`, `diff`, `python`, `slack`, `jira`, …) | apps | built from descriptor names and chat-route capability ids | S |
| C10 | `src/features/fresh-data.cjs` (whole), `src/capabilities.cjs:25`, `src/converse.cjs:82`, `src/features.cjs:41` | weather (Open-Meteo) and currency rates (Bank of Russia) answered by the core | a new app «Погода и курсы» (category personal) | `feature.turn` + `offer.cjs`; the capability through a chat route | M |

### D. Agents (Claude, Codex, the Programmer)

| # | file:line | What | Owner | Mechanism | Effort |
|---|---|---|---|---|---|
| D1 | `src/agent-board.cjs:11-13,70`, `src/ui/agent-board.js:2,7,26`, `src/features/agent-board.cjs:1` | lanes of the «Агенты» board fixed in the core: Petya, «Программист» (coder app), Claude, Codex | coder app; Claude / Codex | an «agent-lane» registry: `{id, name, mark, hint, rows(services)}`; Petya's lane stays core | M |
| D2 | `src/codex-client.cjs`, `src/task-monitor.cjs`, `src/interpretation.cjs`, `src/agents.cjs`, `src/agent-delivery.cjs`, `src/agent-budget.cjs`, `src/main.cjs:224,314-326`, `src/core.cjs:13-15`, `src/connections-setup.cjs:23`, `src/modules.cjs:4` | Claude (desktop app / CLI) and Codex (app server) as the two hard-coded agent runners, their budgets, delivery and «разъяснение» | apps «Claude» and «Codex» | an «agent-runner» registry `{id, name, available(), run(task), status(), budget()}`; the core keeps the queue, the board and the delivery contract | L |

### E. Project detection, onboarding and people

| # | file:line | What | Owner | Mechanism | Effort |
|---|---|---|---|---|---|
| E1 | `src/onboarding-guess.cjs:130-131,135,153-179` | first-run role guess: «Unity Hub» / Rider / Blender installed, Unity projects among recent folders (`ProjectSettings/ProjectVersion.txt`) | unity (+ blender) | project detectors' `detect` for the project count; an «onboarding-hint» contribution `{role, apps:[RegExp], weight}` from apps' `desktop.apps` | M |
| E2 | `src/onboarding-roles.cjs:5` | the role «Unity-разработчик» | core (a person's role) or unity | keep as a role; if roles become app-provided, the Unity app declares it | S |
| E3 | `src/features/people.cjs:62` | the calendar source of «Люди» special-cased by id (`peopleCalendar` switch) | calendar | the `people-source` provider's own `enabled(settings)` | S |
| E4 | `src/team-enrich.cjs:42`, `src/ui/team.js:84` | contact kinds of a person (GitHub, LinkedIn, Instagram, WhatsApp next to Slack/Jira/Telegram) | github app for GitHub; the rest generic | a «team-identity» person-account registry (Slack/Jira/Telegram lanes need the same) | M (cross-lane) |
| E5 | `src/work-query-route.cjs:23` | «Этот трекер не подключён» for Asana/Notion/Trello/GitHub/Linear/ClickUp names | apps | `extension-offers` already offers the added-or-not app; drop the list when each app has an offer | S |

### F. Attachments

| # | file:line | What | Owner | Mechanism | Effort |
|---|---|---|---|---|---|
| F1 | `src/attachments.cjs:12`, `src/attachments-setup.cjs:31-35` | `.blend` files: note «Сцена Blender», the picker's Blender branch | blender | an «attachment-kind» contribution `{extensions:['.blend'], note, pick?}` | S-M |

### G. Words that are not the app (stay, allowed in the guards)

- `src/computer-intent.cjs:13` — desktop apps Petya can open by name (Slack, Telegram, Chrome, Zoom, Jira, Unity, Figma…):
  could come from apps' `desktop.apps`, but «открой Figma» works without any app; low priority (S).
- `src/team-fill.cjs:28,56`, `src/team-roles.cjs:6-7` — role words («Unity-разработчик», «бэкенд») and Slack sidebar
  entries that are apps, not people.
- `src/live-cases.cjs`, `src/live-check.cjs` — live test dialogues (knowledge questions about Unity, Docker, …).
- `src/features/log-sources.cjs`, `monitor-sources.cjs`, `crash-sources.cjs`, `purchase-sources.cjs`,
  `messenger-sources.cjs`, `ua-sources.cjs`, `src/dashboards.cjs`, `src/features/dashboards.cjs` — registry
  plumbing whose comments and stop-words name example services (Loki, Grafana, Sentry, Unity Ads, …).
- `src/local-project.cjs:18`, `src/onboarding-guess.cjs:69-124,155,187-204` — the `git` program as a tool (listing files,
  the user's name/email, recent commits on the first run), not the Git app.
- `src/google-workspace.cjs`, `src/google-service-account.cjs`, `src/integration-clients.cjs`, `src/service-oauth.cjs` —
  shared credential adapters (AGENTS.md: reuse them, do not duplicate per app).
- `src/features/model-parts.cjs:6` — Petya's own model hosting on GitHub releases.
- `src/meeting-migration.cjs:12-55` — one-time migrations that must name the old keys and apps (Zoom, Meet, Teams,
  calendar accounts).
- Ollama, whisper, local voice and local images — Petya's own runtime, not a service of an app.

## New generic registries of this round (to reconcile with the other lanes)

- `chat-route` — `src/features/chat-routes.cjs`; `{id, stage: 'commands'|'builds', order?, handlesOff?, foreground?,
  capability?, resume?, route?(text), run(services, route, {text, pipeline, background})}`. Covers what other lanes may
  call «dialogue-kind» / «chat-route»: an app's chat handling at a fixed point of `converse.cjs`, its background-job
  exclusion, its meaning-router entry and its clarification restarts. New stages are added to `STAGES` and asked once
  in `converse.cjs`.
- `project-detector` — `src/features/project-detectors.cjs`; `{id, detect(dir), icon?, rank?, versions?}`.
- company lifecycle — `src/features/lifecycle.cjs`; `on(event, fn, companyId)` / `emit` / `drop` with
  `settings-saved`, `project-switched`, `topic-removed`, `contexts-cleared`, `company-closing`. The Slack lane can move
  `slackLogs.reset()` / `slackSync.reset()` and the review state the same way; a `quit` event would cover C2.
- Still to design (listed above): service modules from descriptors (A1), «settings-connection» (A5), «mcp-tool» (B1),
  generic result `choices` (C5/C6), «agent-lane» / «agent-runner» (D1/D2), «team-identity» (E4), «attachment-kind»
  (F1), a settings normalize hook with `{before, input}` (A6).

## Leftovers of the other lanes

_Each lane adds its rows here (same columns: file:line, what, owner, mechanism, effort)._

### Slack

### Telegram

### Jira / Atlassian (Confluence)

### Asana

### Mail (Gmail, Outlook)

### Notion

### Google Play
