# Petya extensions

The full specification of a Petya extension («приложение» in the catalog): what goes into its directory, what each
file must export, how it talks to the chat, the cards, other extensions and the user, how it is tested, and how it is
installed into a running Petya without rebuilding the app. `AGENTS.md` → «Extensions» lists the obligatory rules;
this file explains them.

Reference implementations: `src/extensions/regex-cron/` (smallest bundled app), `tests/fixtures/extensions/word-count/`
(smallest external app, used below), `src/extensions/crashes/` (service, settings, cross-app actions),
`src/extensions/calendar/` (clarifications, confirmations, several providers), `src/extensions/zoom/` (no cards:
a meeting source and cross-app providers).

## 1. Where extensions live

| Origin | Folder | Loaded | Catalog mark |
|---|---|---|---|
| bundled | `src/extensions/<id>/` | at startup, shipped inside the app package | — |
| installed | `<userData>/extensions/<id>/` | at startup and live after «Установить из файла…» | «Стороннее» (rail «Сторонние») |
| development | one folder chosen in Settings → «Расширения» → «Папка разработки» | live, reloaded on every save | «Разработка» |

`<userData>` is Petya's application data folder (`~/Library/Application Support/Petya` on macOS,
`%APPDATA%\Petya` on Windows). Extensions are application-wide; the catalog switch (`extension_<id>`) is per company.

All three origins go through one registry, `src/extension-registry.cjs`. Every scan of extension folders — the
catalog and renderer host (`src/features/extension-ui.cjs`), offers (`extension-offers.cjs`), cross-app links and
meeting sources (`app-links.cjs` `scan()`, `meeting-sources.cjs`), chat replies (`extension-replies.cjs`,
`desktop-reply.cjs`), chat result and change adapters (`chat-results.cjs`, `chat-changes.cjs`) and downloads — reads
`registry.live()` / `registry.files(name)`, never `fs.readdirSync('src/extensions')`. A new registry must do the same
and cache with `registry.cached(key, build)`, which is cleared when an extension is installed, removed or reloaded.

**Bundled ids win.** An installed or development extension whose id equals a bundled one is refused with a clear
error; it can never shadow, patch or extend a bundled extension.

## 2. Directory layout

```
<id>/
  extension.json        descriptor (required)
  icon.svg              24×24 monochrome stroke icon in currentColor (required for catalog apps)
  feature.cjs           main-process code: chat turns, IPC, services (optional)
  offer.cjs             when to offer the app to someone who has not added it (recommended)
  <x>-cards.js/.css     renderer: chat cards built with window.resultKit (when it answers with cards)
  settings.js           renderer: its own settings card (when "settings": true)
  settings.html         static settings markup (rare; "markup")
  <kind>.cjs            providers for cross-app kinds ("provides")
  downloads.cjs         which declared downloads are already on disk ("downloads")
  desktop-reply.cjs     a reply provider for the generic chat-extension flow (rare)
  result.cjs/change.cjs adapters for chat results / chat changes (rare)
  locales/en.json       translations — installed/development extensions only (bundled ones use src/locales/en.json)
  *.cjs                 helpers (client.cjs, query.cjs, …)
```

File names are lowercase `a-z0-9-` with the extensions shown. No symlinks anywhere in an installed or development
extension (refused). Everything the extension needs is inside its folder; there is no `npm install` step.

## 3. `extension.json`

| Field | Type | Meaning |
|---|---|---|
| `id` | `a-z0-9-`, starts with a letter | Equals the folder name (installed) / is the extension's identity (development). Unique; never a bundled id. |
| `name` | Russian string | Catalog and card title, ≤ 80 characters. |
| `description` | Russian string | One sentence: what it does for the user, ≤ 400 characters. Searched by the catalog. |
| `version` | `"1.2.0"` (digits and dots) | Optional for bundled, recommended for external: shown in the review and compared on update. |
| `author` | string | Optional; shown in the review dialog and the catalog details. |
| `category` | id from `src/extensions/categories.json` | `gamedev`, `analytics`, `team`, `meetings`, `docs`, `dev`, `comms`, `computer`, `personal`, `creative`. Required for external. |
| `icon` | `"icon.svg"` | Validated (no scripts, styles, links, `url()`), inlined and tinted by the category hue. Generic metaphor, never a brand logo. |
| `examples` | 2–6 Russian phrases, ≤ 120 chars | What people say; shown under «Примеры обращений», searched, put into the composer when clicked. |
| `setting` | `"extension_<id>"` | The catalog switch. Exactly this for external extensions. Bundled service modules use `module_<id>` with `service`. |
| `settings` | `true` / `false` | Whether it has its own settings card (`settings.js`). Must be declared explicitly. |
| `service` | module id | Bundled service modules only (Slack, Jira, Unity…). Refused for external extensions. |
| `feature` | `"feature.cjs"` | Main-process module (section 4). |
| `scripts` | `[["file.js", "after.js"], …]` | Renderer scripts and the core script each must load after: cards after `message-format.js`, settings after `notifications.js`. A script runs when the app is added (or always when `settings` is false and it is a cards script). |
| `results` | `{dataKey: "rendererFunction"}` | `message.extensionData.<dataKey>` is drawn by `window.<rendererFunction>(parent, data)`. |
| `markup` | `"settings.html"` | Static HTML inserted into the settings form (no scripts run from it). Prefer `settings.js`. |
| `connects` | string | The service it needs («Sentry», «GitHub»). The catalog shows «Подключить» until `offer.ready(settings)` is true (or one of `connectsKeys` is filled). |
| `connectsKeys` | `[settingKey]` | Without an offer: settings whose presence means «connected». |
| `desktop` | `{apps, required?}` | The desktop program the app works with, by install names (`["Blender", "Blender Foundation"]`; a name matches with a version suffix too). When the program is installed the catalog suggests the app («Нашёл на компьютере») and marks the tile; with `required: true` «Добавить всю категорию» leaves the app out while the program is missing (`src/desktop-apps.cjs`). |
| `uses` | `[kind]` | Cross-app kinds its cards call (section 9). Fills «Работает вместе с». |
| `provides` | `{kind: "file.cjs" \| [files]}` | Kinds it serves to other apps (section 9). |
| `downloads` | `[{id, name, bytes \| {darwin, win32}, approx?, optional?, requires?}]` | What adding it downloads (section 11). |

`registry.validate()` checks all of this; bundled errors throw at startup (a bug), external errors refuse the
extension and show a notification with the reason.

## 4. `feature.cjs`

```js
const kit=require('../app-kit.cjs');
module.exports={
 name:'wordCount',                                   // camelCase id; external: exactly the camelCase id
 defaults:{'extension_word-count':'false',wordCountLimit:'8'}, // its settings, all strings
 secrets:['wordCountToken'],                         // settings stored with the OS keychain (must be in defaults)
 validate(next){ /* throw Error('…') for invalid values on save */ },
 setup(services){ return {ipc:{…}}; },               // once per company; returns ipc and at most its own service
 async turn(s,command){ … },                         // a chat turn, or null
 teardown(){ … },                                    // stop timers/watchers/listeners (needed for live removal)
 migrate(settings,saved,{dataRoot}){ … }             // optional: one-time settings migration on load
};
```

- **`turn(s, command)` returns `null` unless the request is clearly for this app *and* `kit.installed(s, id)`.**
  Petya tries extension turns before its own handlers, so a greedy pattern steals ordinary talk. Match the subject
  and the intent («объясни регулярку», «составь cron»), refuse definitions («что такое cron») and neighbours'
  subjects; test the near-misses (section 13). When added but not connected, answer with `question:true` and say
  where to connect (`kit.reply(s, command, {question:true, text:'Подключите … в настройках → «…»'})`).
- **`setup(services)` and the flat merge.** Everything `setup` returns except `ipc` is merged *flat* into the shared
  `services` object (`services.<key>`), where other features read it. Returning `{client}` would overwrite whatever
  `services.client` was. Return `{ipc}` and, if other code needs your service, one key equal to your `name`.
  External extensions are held to this: any other key is refused, and so is a name another feature already uses.
- `services` (`s`) gives live state: `settings`, `saveSettings(patch)`, `dialogue`, `request(url, options)` (the
  proxy-aware HTTP client), `win`, `dataRoot` (company folder), `requestProgress.report(text)`, `chatBrowser`,
  `appLinks`, `meetingSources`, `smoke`, … Read `s.settings` at call time; it is replaced on save.
- IPC: `setup` returns `{ipc:{method(...args){…}}}`; the renderer calls `window.petya.feature('<name>', 'method', …)`.
  Validate every argument: the renderer is not trusted with paths or ids it could forge.
- Main-process events to the renderer: `s.win.webContents.send('extension-install-progress', {id, title, text, busy,
  kind, percent?})` lands in the notification center (section 12).
- **Settings keys of external extensions are namespaced**: `extension_<id>` or keys starting with the camelCase id
  (`wordCountLimit`). A key like `ollamaUrl` is refused.
- `teardown()` makes removal, update and development reload live. Without it, removing or updating an installed
  extension switches it off everywhere at once and asks to restart Petya to unload its code.
- `require('../app-kit.cjs')`, `require('../../input-required.cjs')` and every other relative path that leaves the
  extension's folder resolve as if the extension lived in `src/extensions/<id>/`, so the same code works bundled,
  installed and in the development folder. Paths inside the folder resolve normally. Node built-ins are available;
  there are no npm dependencies — vendor what you need into the folder.

## 5. `offer.cjs` and precision

```js
module.exports={id:'word-count',name:'Счётчик слов',pitch:'посчитаю слова в тексте и покажу самые частые',
 names:[/…service names…/iu], topics:[/посчитай слов/iu], avoid:[/сообщени|символ|строк/iu],
 requests:[/посчитай|сколько/iu], connect:'install', ready:settings=>settings['extension_word-count']==='true'};
```

`src/features/extension-offers.cjs` offers a missing app when the talk enters its subject: a direct request
(«покажи крэши за неделю») is answered by the offer and resumes after connecting; a mention under an answer gets a
quiet offer once per chat. Rules:

- `names` — explicit service names («Sentry», «App Store»). A named service beats subject words.
- `topics` — subject words. They must not catch neighbours: «отзывы» in «код-ревью» is not store reviews. List every
  near-miss you know in `avoid`.
- `requests` — what makes a mention a request for data now («покажи», «сколько», «проверь»).
- `ready(settings)` — added **and** connected; the catalog uses it for «Подключить».
- `connect` — `'install'` (adding is enough) or `'settings'` (needs a token after adding).
- `connected?(settings)` — the catalog's «подключено» when it differs from `ready` (a crash source is connected before
  «Крэши» is added); `also?:[ids]` — extensions added together with this one when the offer is accepted;
  `service?` — bundled only: connected in Petya's own service settings (Google Play).
- Ties are never guessed: two apps that fit equally well are both named in the question. Do not raise your score with
  extra topics to win a tie — make the patterns precise instead.
- Add the app's rows to `tests/extension-offers-matrix.cjs`: `own` (requests that must offer exactly it) and `not`
  (neighbours' phrases and small talk that must not). Bundled apps only; external ones test their offer in their own
  unit test with `offers.candidates(text, {offers:[offer], settings:{}})`.

## 6. `src/extensions/app-kit.cjs`

- `installed(s, id)` — the catalog switch is on.
- `modelJSON(s, {system, user, schema, predict?, temperature?})` — a structured answer from the local model, or `null`
  without a model or with invalid JSON. Everything checkable is checked by code; the model explains and drafts.
- `reply(s, command, {text, by, data, sources, error, question})` — records the turn in the active chat, attaches
  `data` as `message.extensionData`, returns the turn result. `by` is the app name.
- `failure(s, command, by, error)` — a service failure under the app name; missing access is told apart from errors.
- `plural(n, ['крэш','крэша','крэшей'])`.

## 7. Cards

A renderer script defines `window.<rendererFunction>(parent, data)` from `results`. Rules:

- Build only with `window.resultKit` (`src/ui/result-kit.js`): `k.card({app, initial, color, key, href, status, title,
  subtitle, meta, chips, actions, body, className})`, `k.el(tag, class, text)`, `k.chip`, `k.table`, `k.views`,
  `k.collapse`, `k.panel`, `k.toast(text, {undo, action, error})`, `k.ask(text, {send})`, `k.links(kind, payload, …)`,
  `k.icons`, `k.store`.
- **A real visualization fit for the data**: bars, a timeline, a sparkline, a diff list, progress — plain DOM/CSS or
  inline SVG; no libraries, no network.
- A status chip and action buttons that call the app's IPC or send a follow-up with `k.ask(text, {send:true})`.
- **Never `innerHTML` from data**; text goes through `textContent` (`k.el`). Guard against drawing twice:
  `if(parent.querySelector('.my-card'))return;`.
- Mark service, user and model content with `data-no-i18n`; format numbers and dates with
  `window.petyaLocale||'ru-RU'`; never compare labels with Russian literals.
- Style with the CSS vars `--ink --muted --green --line --bg` and the kit tones (`#c9ed9d` done, `#e5ce8c` progress,
  `#f0b4a8` alert). Width ~620px, `max-width:100%`. Load the stylesheet beside the script:
  `style.href=new URL('x-cards.css', document.currentScript.src).href`.
- Installed and development extensions are served through `petya-ext://<id>/<file>` (section 14); write the same
  code — the host builds the URL.

## 8. Settings

`settings.js` (after `notifications.js`) builds a card with `data-extension="<id>"` inside `#settings-form`; the host
folds it into a disclosure and shows it only while the app is added. Tokens are feature `secrets`: the form sends
them on save, `publicSettings()` returns them empty; show «сохранён» from a flag, never the value. Reuse shared
credential adapters (Atlassian, Google, Microsoft, GitHub) instead of asking for the same token twice. No
extension-specific code in the application shell. Example: `src/extensions/layout/settings.js`.

## 9. Cross-app kinds

One app offers a capability; other apps' cards use it without knowing who provides it
(`src/features/app-links.cjs`, details in `docs/apps/cross-integrations.md`).

- Kinds: `video-meeting`, `task-tracker`, `share-message`, `code-fix`, `meeting-recording`, `spreadsheet-export`,
  `document-export`.
- **Consume**: declare `"uses":[kind]`, put `k.links(kind, payload, {context, label})` into the card actions. It shows
  nothing without a ready provider, one button for one, a menu for several. Never hard-code «В задачу Jira» or
  «Отдать Программисту».
- **Provide**: `"provides":{"task-tracker":"task-tracker.cjs"}`; the file exports `{id?, name?, label, order?,
  ready(settings), fits?(context, settings), hint?(settings, context), async run(services, payload, check),
  recognizeLink?(url), prepareEvent?(event, context)}`. `run` writes nothing by itself unless the user pressed the
  button; providers whose app has its own confirming flow return `{ask:'<chat request>'}`; call `check()` right before
  an external write.

### Sources of one kind of data

When an app can read the same data from several services (crashes: Sentry, Google Play, Crashlytics; meetings: Zoom,
Meet, Teams), keep the app source-agnostic and let each service plug in as a source declared through `provides`,
served by a dedicated registry next to app links. Two exist:

- `meeting-source` (`src/features/meeting-sources.cjs`, `docs/apps/zoom.md`): `{id?, name?, detect(context), begin?,
  end?, speakers?, participants?, recognizeLink?, joinLinks?, summaryMail?}`, polled by the meeting recorder;
- `crash-source` (`src/features/crash-sources.cjs`, `docs/apps/crashes.md`): `{id?, name?, color?, names?,
  standalone?, service?, ready(settings), issues(services, query), release?, crashFree?, resolve?, reopen?,
  issueUrl?}`, read by «Крэши» (`src/extensions/sentry`, `crashlytics`, `google-play` are sources; the crashes app
  shows them together);
- `messenger-source` (`src/features/messenger-sources.cjs`, `docs/foundations/messengers.md`): `{id, name, names?,
  memory?, ready(settings), channels, messages, thread?, search?, presence?}`, read by «Mattermost», «VK Teams» and
  «Поиск по всему» (Slack, Telegram, Discord, Mattermost and VK Teams are sources);
- `search-source` (`src/extensions/search-all/registry.cjs`, `docs/apps/search-all.md`): `{id, label, order?, icon?,
  color?, in?, names?, parts?, ready(settings, services), off?, timeout?, search(services, {topic, terms, own,
  words})}`, read by «Поиск по всему» (Slack, «Документы», Jira, «Глоссарий», «Google Диск» are sources).
  «Поиск по всему» (Slack, Telegram, Discord, Mattermost and VK Teams are sources).
- `purchase-source` (`src/features/purchase-sources.cjs`, `docs/apps/iap.md`): `{id, name, ready(settings), hint?,
  maxDays?, names?, confirm?, plan?, fetch(services, {start, end, plan?, check})}`, read by «Покупки в игре» (App Store
  Connect and Google Play reports in `src/extensions/iap`, a purchases table of «SQL по словам»); a source with
  `confirm` runs only the plan the user confirmed on the card.

A source counts only while its extension is added; an installed extension may provide one, and a broken installed
source is skipped and reported. A new source kind is a core change: add it to `REGISTRIES` in `app-links.cjs` and
write its registry on `app-links.scan()` with `registry.cached()` (bundled code). Implement the first source(s) and
document the others in `docs/apps/<id>.md`. An app that needs a source the user has not connected asks with
`services.extensionOffers.propose(command, ids, text, by)` — the same offer card, resumed after connecting.

## 10. Other hooks

- `desktop-reply.cjs` — `{type:<id>, name, description, matches(command, context), turn(s, command, context, check)
  | scope(s, topic) + answer(command, scope), install?, downloadBytes?}` for the generic «chat extension» flow
  (`src/features/extension-replies.cjs`). Prefer `feature.turn`.
- `result.cjs` — `{id, extract?(result), describe(message, topic, services)}` for chat results the user can select and
  act on (`src/features/chat-results.cjs`); `change.cjs` — edits through chat changes. Rare; read the Jira ones.

## 11. Downloads

Anything the app downloads (a model, an image, a binary) is declared in `"downloads"` and `downloads.cjs` exports
`async present(services) → ids already on disk`. The catalog shows the weight, sums it per category and selection and
warns about free space. Model downloads keep their own approval. Apps without downloads declare nothing.

## 12. Side effects, notifications, clarifications

- **Confirmation for every side effect.** Writes to a service, deleting files, re-running CI, sending messages,
  creating events happen only after the user pressed a card button or answered the shared question panel — never
  from a chat turn by itself. Destructive actions offer «Отменить» (`k.toast(text, {undo})`) or ask first; deleting is a
  red trash button (`window.deleteButton`).
- **Notifications for long work.** Downloads, installs, syncs and long background jobs publish to the notification
  center from the main process with one stable id per operation, real percentages only when the total is known, and a
  snapshot IPC so a reopened window restores the state (`AGENTS.md` → «Background operations and notifications»).
  From the renderer: `document.dispatchEvent(new CustomEvent('petya-ui-notification', {detail:{id, title, text, kind,
  busy, actions:[[label, fn]]}}))`.
- **Clarifications, not errors.** Missing input or an ambiguous target is a question:
  `require('../../input-required.cjs').ask({text, label?, placeholder?, options?, strictChoices?}, answer=>resume)`
  thrown from the turn *before* side effects; the answer resumes the exact step. Re-throw `InputRequired` from your
  `catch`. Never ask the user to retype the request.

## 13. Tests

- **Unit** `tests/<id>.cjs` — no network: stub `s.request`/`fetch`, `s.dialogue` (`rememberAction`, `active`,
  `persist`), `s.settings`. Cover: routing incl. near-misses that return `null`, not added → `null`, not connected →
  a question, the happy path's card data, a service error, behaviour without a model.
- **UI** `tests/<id>-ui.cjs` — copy `tests/regex-cron-ui.cjs`: render the card from realistic `extensionData` with
  `showDialogueMessages`, assert the DOM (including that data never becomes HTML), then
  `require('./card-shot.cjs')(win, '.my-card', 'petya-<id>')` and **look at the PNG** (Read it) and fix the layout
  until it looks right. For dialogs capture the whole page (`win.webContents.capturePage()`). Run:
  `timeout 120 xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/<id>-ui.cjs`.
- **Offers** — rows in `tests/extension-offers-matrix.cjs` (section 5).
- **All app UI tests** — add the test to the list in `tests/apps-ui.sh` and run it.
- Guards: `tests/extension-ui.cjs` (descriptors), `tests/core-meeting-guard.cjs` (the core and other apps never name
  a meeting service), `tests/interface-language.cjs` (translations).
- Finally `npm test` and the smoke test
  (`xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/smoke-ci`).

**Without real credentials**: use the services' real, current REST endpoints and auth (check the official docs), stub
the responses in tests with realistic payloads, and say in `docs/apps/<id>.md` what was verified with stubs and what
still needs a live check.

## 14. Installed extensions (no rebuild)

**Trust model.** An installed extension is not sandboxed. Its `feature.cjs` and providers run in Petya's main process
with Petya's rights (files, network, saved connections); its renderer scripts run in Petya's window. Installing is a
trust decision, made in a review dialog that states this plainly. What Petya does enforce:

- the review dialog lists name, id, version, author, category, files and size, what it connects to, provides and
  uses, downloads and whether it has main-process code; nothing is copied into `<userData>/extensions/` until
  «Установить» is pressed with the confirmation box checked (the IPC itself refuses without `confirmed === true`);
- the package path always comes from the system file dialog, never from the page;
- archives: stored or deflated only, ≤ 20 MB packed, ≤ 50 MB / 1000 files unpacked, no encryption, no absolute or
  `..` paths, no symlinks, no duplicate names; the same rules for folders;
- validation as strict as bundled plus: `setting` is `extension_<id>`, no `service`, namespaced settings keys,
  `feature.name` is the camelCase id, `setup` returns only `{ipc, <name>}`, no bundled id, valid `locales/*.json`;
- renderer files are served only through `petya-ext://<id>/<path>` (`protocol.handle`): only that extension's live
  folder, no `..`, no hidden files, no symlinks, only `.js .css .svg .png .jpg .webp .gif .woff2 .json` (never
  `.cjs`), `no-store`, `nosniff`; the page's CSP allows `petya-ext:` for scripts, styles and images only (not
  `connect-src`), and `file://` requests into the extensions folder or the development folder are cancelled, so
  external code never loads any other way.

**Install / update / remove.** Catalog → «Установить из файла…» → «Архив .zip…» or «Папка…» (extension.json at the
top or one folder down) → review → «Установить». The extension appears under «Сторонние», added in the current
company. Installing the same id again is an update: the review shows `1.0.0 → 1.2.0`, a reinstall or an older version.
The details panel has «Открыть папку» and a red trash button that asks before deleting the files (settings stay).

**What is live and what needs a restart.**

| Action | Live | Restart («Перезапустить» in the notification) |
|---|---|---|
| install | feature `setup`, IPC, turns, offers, providers, sources, reply/result adapters, renderer scripts, settings card | — |
| update / remove, feature with `teardown()` | everything | — |
| update / remove, feature without `teardown()` | switched off at once in turns, IPC, offers, providers | to unload the old code (an update loads after restart) |
| renderer scripts | new scripts load at once; removed ones stop being called | a removed script's globals stay until the window reloads |
| `locales/*.json` | main-process text at once | renderer text after a restart |

**Errors** — a broken descriptor, a feature that throws on load or in `setup`, a provider of the wrong shape: the
extension (or that file) is left out and a notification names the file and line («feature.cjs:12: …») with
«Открыть папку». Petya keeps running.

## 15. Development folder — the recommended way to build an extension

Build against an installed Petya, with no rebuild and no restart:

1. Create a folder with `extension.json` (copy `tests/fixtures/extensions/word-count/`); give it a new id.
2. Settings → «Расширения» → «Папка разработки» → «Выбрать папку…». The extension loads as «Разработка» and is added.
3. Edit and save. Petya watches the folder (debounced), then: `teardown()` → forgets the modules of that folder only
   → validates → `setup()` → reloads the renderer scripts and redraws the open chat's cards. Load errors arrive as
   notifications with the file and line; the fix replaces them.
4. When it works, either install it from a .zip (`zip -r word-count.zip word-count`) or, for a bundled app, move the
   folder to `src/extensions/<id>/`, move `locales/en.json` entries into `src/locales/en.json`, add its tests and docs.

A development copy replaces an installed copy with the same id while the folder is set; «Отключить» brings the
installed one back. In smoke tests the folder is set with `window.petya.feature('extensionUI', 'setDevFolderPath', dir)`.

## 16. Localization

Bundled: every Russian string of cards, settings and `extension.json` gets its English entry in `src/locales/en.json`
in the same commit (`node scripts/i18n-strings.cjs --missing en` must be empty). Installed/development: ship
`locales/en.json` = `{"strings": {"Русский текст": "English"}}`; Petya's own strings win over the extension's.
Keep literals whole phrases; mark content `data-no-i18n`; format with `window.petyaLocale`.

## 17. `docs/apps/<id>.md`

Short, English: what it does, trigger phrases and near-misses, setup (where to get a token, scopes), the service API
endpoints used, limits, other possible sources, and what was verified with stubs vs live.

## 18. Minimal complete example

`tests/fixtures/extensions/word-count/` (also installed by `tests/extension-external-ui.cjs`):

```json
{
  "id": "word-count", "name": "Счётчик слов", "version": "1.0.0", "author": "Петя · пример",
  "description": "Считает слова в присланном тексте и показывает самые частые столбиками",
  "category": "docs", "icon": "icon.svg",
  "examples": ["Посчитай слова: мама мыла раму, рама мыла маму", "Сколько слов в этом тексте: …"],
  "setting": "extension_word-count", "settings": false, "feature": "feature.cjs",
  "scripts": [["word-cards.js", "message-format.js"]],
  "results": {"wordCard": "renderWordCard"}
}
```

```js
// feature.cjs
const kit=require('../app-kit.cjs');
const ID='word-count',BY='Счётчик слов';
const ASK=/^(?:посчитай|сосчитай|сколько)\s+слов(?:а)?(?:\s+в\s+(?:этом\s+)?тексте)?\s*[:—-]\s*/iu;
function count(text){/* → {total, unique, top:[{word,count}]} */}
async function turn(s,command){
 const match=ASK.exec(String(command||'').trim());
 if(!match||!kit.installed(s,ID))return null;                 // clearly ours and added, or null
 const body=String(command).trim().slice(match[0].length);
 if(!body.trim())return kit.reply(s,command,{by:BY,question:true,text:'Пришлите текст после двоеточия: «Посчитай слова: …».'});
 const result=count(body);
 return kit.reply(s,command,{by:BY,text:'Слов: '+result.total+', разных: '+result.unique+'.',data:{wordCard:result}});
}
module.exports={name:'wordCount',defaults:{['extension_'+ID]:'false'},validate(){},setup(){return {};},turn,count,teardown(){}};
```

```js
// word-cards.js
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('word-cards.css',document.currentScript.src).href;document.head.append(style);
 window.renderWordCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.word-card'))return;
  const body=k.el('div','word-body'),list=k.el('ul','word-bars'),max=Math.max(1,...data.top.map(r=>r.count));
  for(const row of data.top){const li=k.el('li'),word=k.el('span','word-name',row.word);word.dataset.noI18n='';
   const track=k.el('span','word-track'),bar=k.el('span','word-bar');bar.style.width=Math.round(row.count/max*100)+'%';track.append(bar);
   li.append(word,track,k.el('span','word-count',String(row.count)));list.append(li);}
  body.append(list);
  parent.append(k.card({app:'Счётчик слов',initial:'С',color:'#5a6f4a',status:{label:'готово',tone:'done'},body,
   actions:[{label:'Посчитать другой текст',run:()=>k.ask('Посчитай слова: ')}],className:'word-card'}));
 };
})();
```

plus `offer.cjs`, `word-cards.css` and `icon.svg` in the same folder. Its tests: `tests/extension-external.cjs`
(turn, install, update, removal, reload) and `tests/extension-external-ui.cjs` (card screenshot).

## 19. Checklist

- [ ] `extension.json`: id, Russian name/description, category, icon.svg, 2–6 examples, `setting`, `settings`
      declared, scripts with their `after`, results, `connects`/`uses`/`provides`/`downloads` when they apply,
      `version` (and `author`) for external.
- [ ] `feature.cjs`: unique camelCase `name`, string defaults (namespaced), secrets in defaults, `validate`,
      `setup` returns `{ipc}` (+ at most its own name), `turn` returns null unless clearly its request and added,
      a question when not connected, `teardown` stops everything `setup` started.
- [ ] `offer.cjs`: precise names/topics, known near-misses in `avoid`, `ready` = added and connected; matrix rows.
- [ ] Cards: resultKit only, a real visualization, status chip, actions, no `innerHTML` from data, `data-no-i18n`
      on content, `petyaLocale`, ~620px.
- [ ] Every side effect behind an explicit confirmation; destructive ones undoable or asked; red trash for delete.
- [ ] Long work in the notification center; missing input as a clarification before side effects.
- [ ] Other apps' actions through `k.links`; own capabilities through `provides`; several services → source kind.
- [ ] Translations (`src/locales/en.json` or `locales/en.json`).
- [ ] Unit test with stubs, UI test with a card screenshot you looked at, `tests/apps-ui.sh` list, `npm test`.
- [ ] `docs/apps/<id>.md` with what is verified with stubs vs live.
