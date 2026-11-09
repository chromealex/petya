# Cross-app links

One app offers a capability, other apps' cards use it without knowing who provides it. A card never shows a
button for an app that is not added and connected, and nothing is written until the user presses a button.

## Registry

`src/features/app-links.cjs` (feature `appLinks`). An extension declares in its `extension.json`:

```json
"provides": { "task-tracker": "task-tracker.cjs" }
```

(a list of files is allowed). Each file exports
`{ id?, name?, label, order?, ready(settings), fits?(context, settings), hint?(settings, context), async run(services, payload, check), recognizeLink?(url), prepareEvent?(event, context) }`.

- `available(kind, context)` → `[{id, name, label, hint?}]`: only providers whose app is added (its catalog switch)
  and `ready` (connected), filtered by `fits(context)`, in a stable order: the provider's own `order` (lower first),
  then by id. The registry names no app.
- `recognize(url)` → `{kind, key, url, name}` or null: which service a meeting link belongs to, asked of the
  providers of added apps that export `recognizeLink`. The calendar uses it for known rooms; nothing else in Petya
  knows any service's link format.
- `run(kind, id, payload)` refuses unknown kinds, unknown providers and providers that are not ready; `check()`
  lets a provider re-check readiness right before a write.
- `prepare(kind, id, event, context)` — for a video call that the calendar service creates together with the event
  (Meet, Teams). The provider's `run` answers `{native:true}`; right before writing, the calendar passes the request it
  is about to send, `{calendar:'google'|'microsoft', body, query}`, and the provider's `prepareEvent` returns it with
  its own fields added. `context.account` is the calendar account `{key, provider, email, kind}` (`kind` is `work` or
  `personal` for Microsoft). The provider must still be ready; a result for another calendar is refused; the
  caller's object is not changed in place. The calendar itself names no meeting service.
- IPC: `window.petya.feature('appLinks', 'available' | 'run', …)`; main-process code uses `services.appLinks`.
- The same `provides` map also declares **meeting sources** (`"meeting-source"`), which have their own registry
  (`src/features/meeting-sources.cjs`, see [zoom.md](zoom.md) and the README): they are polled by the meeting
  recorder and never shown as card buttons. `scan()` in `app-links.cjs` reads both.
- **Ad sources** (`"ad-source"`) are declared the same way and read by «Реклама и монетизация»
  (`src/extensions/ad-revenue/sources.cjs`, see [ad-revenue.md](ad-revenue.md)): revenue reports of ad mediation
  services (AppLovin MAX, Unity LevelPlay), never card buttons.
- **Reminder triggers** (`"reminder-trigger"`, events «Напоминания» can wait for, see [reminders.md](reminders.md))
  and **journal sources** (`"journal-source"`, what «Дневник дня» knows about a day, see [journal.md](journal.md))
  are declared the same way and served by their apps' own registries.
- **Release checks** (`"release-check"`) are declared the same way and read by «Релизный чек-лист»
  (`src/extensions/release-checklist/checks.cjs`, see [release-checklist.md](release-checklist.md)): each provider
  answers named checks (`ci.green`, `crashes.release`, …) for a release; provided by Сборки, Крэши, Отзывы в сторах,
  Патчноуты, Локализация, Размер билда, Зависимости, Jira and the checklist itself (version numbers).

Renderer: `k.links(kind, payload, {context, label, title, primary, onDone, className})` in `src/ui/result-kit.js`
returns a node for an actions row: nothing without providers, one button for one provider, a button with a «▾» menu
for several (the last choice per kind is kept in `k.store`). A provider answering `{ask}` hands a prepared request
to the chat (`k.ask(…, {send:true})`), `{text}` shows a toast, `{settings: '<extension>'}` offers to open settings.
`k.card` accepts such nodes among its `actions`.

## Kinds and providers

| Kind | Provider (extension) | What `run` does |
|---|---|---|
| `video-meeting` | `zoom` (Zoom extension, order 10) | The user's Zoom **personal meeting room** link: the saved `zoomPersonalLink`, a personal-room link found in plain-text Zoom data on the computer, or `{needLink, text, placeholder, field}` so the card asks to paste it once (validated `https://…zoom.us/j/<digits>[?pwd=…]`, then remembered). Ready when the Zoom desktop app is installed (`/Applications/zoom.us.app`, `%APPDATA%\Zoom\bin\Zoom.exe`) or a link is saved. No Zoom API, no OAuth. The same room serves every meeting; the choice says so. `recognizeLink` tells Zoom links apart. Only while «Zoom» is added. |
| | `google-meet` («Google Meet», order 20) | `{native:true}`; `prepareEvent` adds `conferenceData.createRequest` (`hangoutsMeet`) and `conferenceDataVersion=1`. Ready with a Google account that has calendar access (and «Календарь» added); fits Google calendars. See [google-meet.md](google-meet.md). |
| | `teams` («Microsoft Teams», order 30) | `{native:true}`; `prepareEvent` adds `isOnlineMeeting`, `onlineMeetingProvider:"teamsForBusiness"`. Ready with a Microsoft **work or school** account with `Calendars.ReadWrite`; fits Outlook calendars of such an account, never personal ones. See [teams.md](teams.md). |
| `task-tracker` | `jira`, `asana` | A chat request «Создай задачу в Jira/Asana: …» (or «Создай задачи … по встрече «…»:» with a list); those flows choose the project, preview and create only after confirmation. |
| `share-message` | `slack` | «Попроси команду …» for the team request flow: a channel only from the project's confirmed bindings, otherwise a question with concrete channels, then a preview with «Отправить». Never a guessed channel. |
| `code-fix` | `coder` | The problem as a coding request for «Программист» (own branch, diff for review). |
| `meeting-recording` | `zoom` (Zoom extension) | Petya's local recording (system audio, optional microphone) of a **Zoom** meeting: `when:'now'` starts it during the meeting, `when:'schedule'` stores a timer (`meetingRecordingSchedule`, at most 8) that, from the event time, starts the recording as soon as the Zoom meeting source sees the meeting, and reports in a cancellable notification. Fits Zoom links only. Ready unless `meetingAutoRecord` is `off`. |
| | `google-meet`, `teams` | The same for Meet / Teams links (`googleMeetRecordingSchedule`, `teamsRecordingSchedule`): the scheduled recording starts when that app's meeting source sees the call. The timer is the shared core module `src/meeting-schedule.cjs` (each app passes its own key, name and `detect`). |
| `spreadsheet-export` | `google-sheets` («Google Таблицы») | The card's table `{title, sheet?, app?, header, rows}` (≤2000 × 40) as a chat request «Выгрузи в Google Таблицы «…» · N строк · #id»; the export card asks where (new spreadsheet, new tab, existing tab with the exact cell diff) and writes only on «Выгрузить». Ready when Sheets access is granted; without write permission it answers `{settings:'google-sheets'}`. See [google-sheets.md](google-sheets.md). |
| `document-export` | `google-drive` («Google Диск») | The card's text `{title, text (Markdown), app?}` as a chat request «Сохрани в Google Документы «…» · #id»; the confirmation card previews the document, lets the user fix the title and creates the Google Doc only on «Создать документ» (`drive.file`). Ready when Drive access is granted; without «Разрешить создавать документы» it answers `{settings:'google-drive'}`. No card uses it yet. See [google-drive.md](google-drive.md). |

Not provided: **Telegram** `share-message` — Petya reads Telegram but has no confirmed sending flow; adding one needs
its own chat selection and preview. «Программист» has no offer file, so a missing `code-fix` shows nothing (no
offer).

## Which cards use what

| Card | task-tracker | code-fix | share-message | video-meeting | meeting-recording |
|---|---|---|---|---|---|
| Crashes (Sentry, Crashlytics, Google Play), per issue | ✓ (bug) | ✓ | card: new crashes | | |
| Store reviews, per complaint theme | ✓ | ✓ | ✓ | | |
| Store reviews, per review | ✓ | | | | |
| CI builds, failed run | ✓ (bug) | ✓ (the existing hand-off text) | ✓ | | |
| Dependencies | vulnerable packages | safe updates in a branch | | | |
| Pull request with failing checks | ✓ | ✓ | waiting for review | | |
| Meeting summary | per task and «Создать все» | | summary | | |
| Calendar, confirm step | | | | ✓ + known rooms, typed link | |
| Calendar, created meeting / timeline | | | | | «Петя запишет встречу» / «Записать Петей» |

«Выгрузить в Google Таблицы» (`spreadsheet-export`): sprint plan, game metrics (daily series), A/B-test groups, the
config-balance report and its version diff. «Конфиги и баланс» also uses `code-fix` for «Применить в конфиги».

The meeting summary also gets «Назначить следующую встречу» when «Календарь» is added: a calendar request with the
people from the tasks is put into the composer.

## Calendar «Видеозвонок»

Choices: available providers that fit this calendar account (the Zoom personal room, Google Meet for a Google
calendar, Teams for an Outlook calendar of a work account — each only while its extension is added), then
**known rooms** ranked for the new meeting, then «Своя ссылка…» (any https link) and «Без звонка». Default: a known room
that clearly fits (same people, or a similar title with some of them), else the last choice, else the first provider
(providers come in their own order), else none. A create request without a choice (`video:true`) takes the first
available provider, or none. A provider that needs its link once answers `{needLink}` and the card
asks for it in place (placeholder and label from the provider). A link goes to the event's location and description
(Graph: location and text body, no `isOnlineMeeting`).

Known rooms (`src/extensions/calendar/rooms.cjs`): meeting links in the user's events (conference link, location,
description) seen on **two or more different days**, learned from the events the calendar reads anyway and from one
60-day look-back at most once a day (when a confirm step opens). Links of services with an app are recognised by that
app's provider (`appLinks.recognize`: Zoom's keeps `pwd` and dedups one meeting id on any Zoom host; Meet's by
the meeting code; Teams' keeps `context`); the calendar itself knows only Webex, Jitsi and Telemost. Tracking parameters are dropped; rooms are named
by the most common event title and the service («Дейли · Zoom»), ranked by same attendees > similar title > frequency
> recency with the reason shown. Without the Zoom, Google Meet or Teams extension, that service's links in events are not
learned as rooms.
Links typed in the confirm step are known at once. Stored per company in `calendar-rooms.json` in the company data
folder (mode 600, never sent anywhere); calendar settings list them with rename and forget (a forgotten room is not
learned again).

## Removed: the Zoom Marketplace app

The Zoom OAuth sign-in and the separate Meeting SDK participant were removed (the app will not be published). Old
`zoomCredential`, `zoomBotCredential`, `zoomBotUrl` and `zoomCaptureMode` values are no longer loaded and disappear
from the settings file on the next save; recording is always local.

## Verified with stubs vs. live

Tests: `node tests/app-links.cjs`, `node tests/calendar-video.cjs`, `node tests/calendar.cjs`, `node tests/meeting-sources.cjs`, `node tests/google-meet.cjs`, `node tests/teams.cjs`; UI: `tests/meeting-apps-ui.cjs`,
`tests/app-links-ui.cjs`, `tests/calendar-ui.cjs`, `tests/crashes-ui.cjs`, `tests/ci-builds-ui.cjs`,
`tests/dependencies-ui.cjs` (Electron, `PETYA_SMOKE_TEST=1`). Everything ran with stubbed services.

Needs live checking:
- that «Создай задачу в Asana: …» and «Создай задачи в Jira/Asana по встрече …» are routed to the Asana / batch flows
  by the live intent planner;
- Zoom personal-room discovery from local data (no plain-text location is documented by Zoom; on most installations
  the user will paste the link once);
- Graph events with a link in `location` + text body, and Google events with `location`/`description`, as invitees see them;
- the scheduled local recording at a real meeting start (Zoom window detection on macOS/Windows);
- the 60-day look-back on a large calendar (one request of up to 250 events).
