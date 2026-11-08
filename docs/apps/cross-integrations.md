# Cross-app links

One app offers a capability, other apps' cards use it without knowing who provides it. A card never shows a
button for an app that is not added and connected, and nothing is written until the user presses a button.

## Registry

`src/features/app-links.cjs` (feature `appLinks`). An extension declares in its `extension.json`:

```json
"provides": { "task-tracker": "task-tracker.cjs" }
```

(a list of files is allowed: the calendar provides Meet and Teams). Each file exports
`{ id?, name?, label, ready(settings), fits?(context, settings), hint?(settings, context), async run(services, payload, check) }`.

- `available(kind, context)` → `[{id, name, label, hint?}]`: only providers whose app is added (its catalog switch)
  and `ready` (connected), filtered by `fits(context)`, in a stable order (`ORDER` in the registry, then by id).
- `run(kind, id, payload)` refuses unknown kinds, unknown providers and providers that are not ready; `check()`
  lets a provider re-check readiness right before a write.
- IPC: `window.petya.feature('appLinks', 'available' | 'run', …)`; main-process code uses `services.appLinks`.

Renderer: `k.links(kind, payload, {context, label, title, primary, onDone, className})` in `src/ui/result-kit.js`
returns a node for an actions row: nothing without providers, one button for one provider, a button with a «▾» menu
for several (the last choice per kind is kept in `k.store`). A provider answering `{ask}` hands a prepared request
to the chat (`k.ask(…, {send:true})`), `{text}` shows a toast, `{settings: '<extension>'}` offers to open settings.
`k.card` accepts such nodes among its `actions`.

## Kinds and providers

| Kind | Provider (extension) | What `run` does |
|---|---|---|
| `video-meeting` | `zoom` (zoom-bot) | The user's Zoom **personal meeting room** link: the saved `zoomPersonalLink`, a personal-room link found in plain-text Zoom data on the computer, or `{needLink}` so the card asks to paste it once (validated `https://…zoom.us/j/<digits>[?pwd=…]`, then remembered). Ready when the Zoom desktop app is installed (`/Applications/zoom.us.app`, `%APPDATA%\Zoom\bin\Zoom.exe`) or a link is saved. No Zoom API, no OAuth. The same room serves every meeting; the choice says so. |
| | `google-meet`, `teams` (calendar) | The event patch (`conferenceData.createRequest` / `isOnlineMeeting`); fits only an event of a Google / Outlook calendar. |
| `task-tracker` | `jira`, `asana` | A chat request «Создай задачу в Jira/Asana: …» (or «Создай задачи … по встрече «…»:» with a list); those flows choose the project, preview and create only after confirmation. |
| `share-message` | `slack` | «Попроси команду …» for the team request flow: a channel only from the project's confirmed bindings, otherwise a question with concrete channels, then a preview with «Отправить». Never a guessed channel. |
| `code-fix` | `coder` | The problem as a coding request for «Программист» (own branch, diff for review). |
| `meeting-recording` | `zoom-bot` | Local capture (system audio, optional microphone) of a **Zoom** meeting: `when:'now'` starts it during the meeting, `when:'schedule'` stores a timer (`meetingRecordingSchedule`, at most 8) that starts the capture at the event time, retries while Zoom has not shown the meeting, and reports in a cancellable notification. Ready unless recording is switched off. |

Not provided: **Telegram** `share-message` — Petya reads Telegram but has no confirmed sending flow; adding one needs
its own chat selection and preview. «Программист» has no offer file, so a missing `code-fix` shows nothing (no
offer). Meet/Teams meetings in a browser are not recorded: the local capture detects Zoom only.

## Which cards use what

| Card | task-tracker | code-fix | share-message | video-meeting | meeting-recording |
|---|---|---|---|---|---|
| Crashes (Sentry), per issue | ✓ (bug) | ✓ | card: new crashes | | |
| Store reviews, per complaint theme | ✓ | ✓ | ✓ | | |
| Store reviews, per review | ✓ | | | | |
| CI builds, failed run | ✓ (bug) | ✓ (the existing hand-off text) | ✓ | | |
| Dependencies | vulnerable packages | safe updates in a branch | | | |
| Pull request with failing checks | ✓ | ✓ | waiting for review | | |
| Meeting summary | per task and «Создать все» | | summary | | |
| Calendar, confirm step | | | | ✓ + known rooms, typed link | |
| Calendar, created meeting / timeline | | | | | «Петя запишет встречу» / «Записать Петей» |

The meeting summary also gets «Назначить следующую встречу» when «Календарь» is added: a calendar request with the
people from the tasks is put into the composer.

## Calendar «Видеозвонок»

Choices: available providers (Zoom personal room, Meet or Teams of this calendar), then **known rooms** ranked for the
new meeting, then «Своя ссылка…» (any https link; Zoom/Meet/Teams/Webex/Jitsi/Telemost recognised) and «Без звонка».
Default: a known room that clearly fits (same people, or a similar title with some of them), else the last choice,
else Zoom, else the calendar's own call. A link goes to the event's location and description (Graph: location and
text body, no `isOnlineMeeting`).

Known rooms (`src/extensions/calendar/rooms.cjs`): meeting links in the user's events (conference link, location,
description) seen on **two or more different days**, learned from the events the calendar reads anyway and from one
60-day look-back at most once a day (when a confirm step opens). Links are normalized (tracking parameters dropped,
Zoom `pwd` and Teams `context` kept), deduplicated (one Zoom meeting id on any Zoom host), named by the most common
event title («Дейли · Zoom»), ranked by same attendees > similar title > frequency > recency with the reason shown.
Links typed in the confirm step are known at once. Stored per company in `calendar-rooms.json` in the company data
folder (mode 600, never sent anywhere); calendar settings list them with rename and forget (a forgotten room is not
learned again).

## Removed: the Zoom Marketplace app

The Zoom OAuth sign-in and the separate Meeting SDK participant were removed (the app will not be published). Old
`zoomCredential`, `zoomBotCredential`, `zoomBotUrl` and `zoomCaptureMode` values are no longer loaded and disappear
from the settings file on the next save; recording is always local.

## Verified with stubs vs. live

Tests: `node tests/app-links.cjs`, `node tests/calendar-video.cjs`, `node tests/calendar.cjs`; UI:
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
