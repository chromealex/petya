# Zoom

«Zoom» is an extension (`src/extensions/zoom`, catalog category «Встречи и календарь», switch `extension_zoom`). Petya
itself knows nothing about Zoom: the core records **meetings** and lets meeting apps plug in. Without this extension
Petya still records a meeting when the user presses «Слушать встречу» (system audio and, if allowed, the microphone);
with it, Zoom meetings are found, recorded and labelled by themselves.

## What it adds

| Capability | File | What it does |
|---|---|---|
| `meeting-source` | `meeting-source.cjs` | `detect()`: a Zoom meeting window on this computer (`window.cjs`: the native helper `assets/native/watch-macos` on macOS, `watch-windows.ps1` on Windows; «Zoom Meeting», «Конференция Zoom», webinars, the visible floating video window). `begin`/`end`/`speakers()`: while Petya records, the names Zoom shows talking are sampled from its window every 2 s (`speakers.cjs`) and each fragment of the meeting sound gets the name heard most during it. `participants()`: names seen in the meeting (kept in `zoom-speakers-sample.json` in the company folder, mode 600) for «Имя на встречах» in «Команда». `recognizeLink`/`joinLinks`: Zoom join links. `summaryMail()`: Zoom's own letter with the transcript or summary (Gmail, `from:(zoom.us)`), used by the meeting summary. |
| `video-meeting` | `video-meeting.cjs` | The personal meeting room for new calendar events (see [cross-integrations.md](cross-integrations.md)); asks for the link once when it is not known. `recognizeLink` lets the calendar's known rooms tell Zoom links apart. |
| `meeting-recording` | `meeting-recording.cjs` | «Записать Петей» / «Петя запишет встречу» on calendar events with a Zoom link: a scheduled recording starts at the event time as soon as the Zoom meeting source sees the meeting (cancellable notification, `notifications.js`). |
| offer | `offer.cjs` | Offered only when Zoom is named («запиши встречу в Zoom», «в зуме»); zooming a picture or the screen («зум фото», «увеличь», «zoom in») is not this app. |

Settings card (`settings.js`, owned by the extension): whether the Zoom app is installed and the personal room link.
When to start recording (automatically / ask / only manually) and the microphone are Petya's own «Запись встреч»
settings (`meetingAutoRecord`, `meetingCaptureMic`), shared by every meeting app.

The extension's settings keys: `extension_zoom`, `zoomPersonalLink`, `zoomWindowTitle`, `meetingRecordingSchedule`.

## The meeting source interface

Declared in `extension.json` as `"provides": {"meeting-source": "<file>.cjs"}`; served by
`src/features/meeting-sources.cjs` (a dedicated registry next to app links: sources are polled by the recorder, not
shown as buttons). The file exports `{id?, name?, detect(context), begin?, end?, speakers?, participants?, joinLinks?,
recognizeLink?, summaryMail?}`; `context` is `{settings, dataRoot, from?, to?}`. `detect` returns
`{active, title?, app?, windowTitle?}` or null. A source counts only while its extension is added. The recorder
(`src/local-meeting.cjs`) polls `detect` every 5 s: two sightings start (or offer) a recording, three misses stop
a recording that followed the meeting; a recording started by hand runs until the user stops it.

## Migration from «Петя в Zoom» (`zoom-bot`)

`src/meeting-migration.cjs`, once per company on loading settings (`meetingMigration`):

- `zoomBotMode` → `meetingAutoRecord`, `zoomCaptureMic` → `meetingCaptureMic` (values kept); `zoomAutoRecord`,
  `zoomLocalService`, `zoomMemoryMigration` are no longer loaded and disappear on the next save.
- Team «Имя в Zoom» (`zoomName`) → «Имя на встречах» (`meetingName`); a muted offer of `zoom-bot` → `zoom`.
- Saved meeting transcripts labelled `Zoom` become `Встреча`; the letter kind `zoom-mail` becomes `meeting-mail`.
- The Zoom extension is added automatically for users who used Zoom recording: a saved personal room, scheduled
  recordings, the old auto-record switch, a window title, Zoom names in the team, recordings on disk or meeting
  transcripts in memory — unless the user had already decided about `extension_zoom`. New users do not get it.

## Tests

`tests/meeting-sources.cjs`, `tests/meeting-migration.cjs`, `tests/local-meeting.cjs`, `tests/zoom-window.cjs`,
`tests/zoom-speakers.cjs`, `tests/calendar-video.cjs`, `tests/app-links.cjs`, `tests/extension-offers-matrix.cjs`,
`tests/core-meeting-guard.cjs` (fails if Zoom appears in core files or other extensions).

Needs live checking: Zoom window detection and speaker names on real macOS/Windows meetings; Zoom's letters in Gmail.
