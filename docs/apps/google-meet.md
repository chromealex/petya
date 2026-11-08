# Google Meet

«Google Meet» is an extension (`src/extensions/google-meet`, catalog category «Встречи и календарь», switch
`extension_google-meet`). It is built like [Zoom](zoom.md): Petya's core records **meetings** and knows no meeting
service; this extension plugs Meet in through the generic interfaces (meeting source, app links). Without it a Meet
call is still recorded with «Слушать встречу», and the calendar offers no Meet link.

## What it adds

| Capability | File | What it does |
|---|---|---|
| `meeting-source` | `meeting-source.cjs` | `detect()`: a Meet call is a browser tab, seen by the title of a browser window (the active tab's title): «Meet – abc-defg-hij», «Meet: Название встречи» in Chrome, Edge, Firefox, Safari, Arc, Yandex Browser (`meet.cjs` `callOf`). Windows come from the neutral core helper `src/desktop-windows.cjs`. Meet's own pages («Google Meet», «Google Meet – новая вкладка», the left-call page, Google's product pages), other «meet» words and windows of non-browser apps are not calls. The recording is named by the meeting name in the tab, or, when the tab shows only the code, by the calendar's known room for that code (`calendar-rooms.json`, `meetingTitle`). No speaker names: Meet's tab title does not carry them and nothing is guessed. `recognizeLink`/`joinLinks`: `https://meet.google.com/abc-defg-hij`. |
| `video-meeting` | `video-meeting.cjs` | A Meet call created by Google with a new Google Calendar event. Listed only while «Календарь» is added and a Google account has calendar access; fits only Google calendars. `run` confirms the choice (`{native:true}`); `prepareEvent` adds `conferenceData.createRequest` (`hangoutsMeet`, a fresh `requestId`) and `conferenceDataVersion=1` to the calendar's request; the join link comes back with the event. |
| `meeting-recording` | `meeting-recording.cjs` | «Записать Петей» / «Петя запишет встречу» on calendar events with a Meet link: a scheduled recording (`googleMeetRecordingSchedule`, at most 8, `src/meeting-schedule.cjs`) starts from the event time as soon as the Meet source sees the call's tab; cancellable notification (`notifications.js`, ids `meeting-schedule:google-meet:<id>`). |
| offer | `offer.cjs` | Offered only when Meet is named: «созвон в Meet», «в мите», «гугл мит», a meet.google.com link. «meeting», «meetup», «митинг», «митап», meetings in general, the calendar and Zoom are not Meet. |

Settings card (`settings.js`): how calls are seen (screen recording access on macOS, browsers on Windows) and in which
Google calendar Meet links are created; it explains what to connect in «Календарь» when nothing is. Recording mode
and the microphone are Petya's own «Запись встреч» settings.

Keys: `extension_google-meet`, `googleMeetRecordingSchedule`. No Google sign-in of its own: the calendar's Google
account (shared mail/calendar OAuth) creates the event.

## Seeing windows

`src/desktop-windows.cjs` lists top-level windows with titles for any meeting source; it names no service.
Windows: a PowerShell script (passed with `-EncodedCommand`, nothing to unpack) enumerates visible windows with their
process names. macOS: Electron's window list, only when screen recording access is already granted (never
requested). Other platforms: no detection. One listing is shared for 2 s between sources polled together. Only the
active tab of each browser window is visible: a call in a background tab is not seen until the user switches to it.

## Migration

Meet used to be a choice of «Календарь» itself. `src/meeting-migration.cjs` (`videoAppsMigration`, once per company)
adds «Google Meet» for users with a Google account that has calendar access, unless they already decided about
`extension_google-meet`. Users who never connected a calendar do not get it.

## Tests

`node tests/google-meet.cjs` (links, titles of every browser and non-call titles, known-room titles, window listing,
provider readiness/run/prepareEvent, scheduled recording, settings data, offer), `tests/app-links.cjs`,
`tests/calendar-video.cjs`, `tests/calendar.cjs`, `tests/meeting-sources.cjs`, `tests/meeting-migration.cjs`,
`tests/extension-offers-matrix.cjs`, `tests/core-meeting-guard.cjs`; UI: `tests/calendar-ui.cjs`,
`tests/meeting-apps-ui.cjs` (catalog «Встречи», both settings cards, confirm-step choices from the three apps' providers; screenshots `petya-meeting-apps-*.png` in the temp folder). Everything ran with stubs; no real Google account or browser windows.

Needs live checking: the exact tab titles of a Meet call in each browser and UI language (green room vs. in call),
the Windows PowerShell listing and macOS window names with screen access, a real Meet link created with an event.
