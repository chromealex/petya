# Microsoft Teams

«Microsoft Teams» is an extension (`src/extensions/teams`, catalog category «Встречи и календарь», switch
`extension_teams`). It is built like [Zoom](zoom.md) and [Google Meet](google-meet.md): the core knows no meeting
service; Teams plugs in as a meeting source and app-link providers. Without it a Teams call is still recorded with
«Слушать встречу», and the calendar offers no Teams meeting.

## What it adds

| Capability | File | What it does |
|---|---|---|
| `meeting-source` | `meeting-source.cjs` | `detect()`: the window of a Teams call — the desktop app (new Teams `ms-teams`, classic `Teams`) opens a call in its own window titled «<meeting> \| Microsoft Teams»; Teams on the web shows the same title in a browser tab (also «(work or school)», «(free)», «classic»). The main window is «<section> \| … \| Microsoft Teams» («Чат \| Анна \| Microsoft Teams», «Calendar \| Microsoft Teams») and is not a call; neither are «Microsoft Teams», notifications, sign-in pages or other apps' windows (`teams.cjs` `callOf`). The sharing toolbar / compact view count as a call without a name. Windows come from `src/desktop-windows.cjs` (see [google-meet.md](google-meet.md#seeing-windows)). The recording is named by the call window's title. No speaker names. `recognizeLink`/`joinLinks`: `teams.microsoft.com/l/meetup-join/…` (tenant `context` kept), `teams.microsoft.com/meet/<id>`, `teams.live.com/meet/<id>`. |
| `video-meeting` | `video-meeting.cjs` | A Teams meeting created by Microsoft Graph with a new Outlook event. Listed only while «Календарь» is added and a Microsoft **work or school** account has `Calendars.ReadWrite`; fits only Outlook calendars of such an account. Personal accounts (outlook.com, hotmail, live; the consumer tenant or an opaque token) are not offered Teams — the settings card says so. `prepareEvent` adds `isOnlineMeeting:true, onlineMeetingProvider:"teamsForBusiness"`; the join link comes back with the event. |
| `meeting-recording` | `meeting-recording.cjs` | «Записать Петей» / «Петя запишет встречу» on events with a Teams link; scheduled recordings (`teamsRecordingSchedule`) start as soon as the Teams source sees the call window. |
| offer | `offer.cjs` | Offered only when Teams is named: «встреча в Teams», «в тимсе», «тимс», a Teams link. «Тимлид», «тимбилдинг», a Slack team and meetings in general are not Teams. |

Settings card (`settings.js`): how calls are seen, which Microsoft accounts create Teams meetings, which need calendar
access, and which are personal (no Teams). Keys: `extension_teams`, `teamsRecordingSchedule`.

Work vs. personal account (`src/extensions/calendar/accounts.cjs` `microsoftKind`): the tenant id `tid` of the stored
access token when it is a JWT (work/school tokens are; the consumer tenant `9188040d-…` means personal), an opaque
token means personal, and without a token the address decides (outlook/hotmail/live/msn domains are personal).

## Migration

Teams used to be a choice of «Календарь» for Outlook calendars. `src/meeting-migration.cjs` (`videoAppsMigration`,
once per company) adds «Microsoft Teams» for users with a Microsoft work or school account that has calendar access,
unless they already decided about `extension_teams`. Users with only personal Microsoft accounts or without calendars
do not get it.

## Tests

`node tests/teams.cjs` (links, call/main window titles of the app and the web, account kinds, provider
readiness/fit/run/prepareEvent, scheduled recording, settings data, offer) and the shared tests listed in
[google-meet.md](google-meet.md#tests). Everything ran with stubs.

Needs live checking: real new-Teams and classic window titles on Windows and macOS (a popped-out chat must not look
like a call), Teams on the web in a browser, the account classification with real tokens, and a Teams meeting created
by Graph with an event.
