# «Запись экрана → баг» (`screen-bug`)

Category: «Геймдев и сборки». Records the game window or a screen the user picks (at most 2 minutes, with a visible
«Стоп» window), adds what the game's log wrote meanwhile and the system info, drafts a bug report and hands it to the
project's tracker through `task-tracker`; the video and the log excerpt are attached to the created task on a press.

## Phrases

| Request | What happens |
| --- | --- |
| «запиши баг», «запиши экран», «запиши видео бага», «сними экран для бага», «запиши баг: инвентарь не открывается» | The choice card: previews of screens and windows (Petya's own windows left out), the game's log and system info switches, «Начать запись». The text after «:» is the user's note. |
| «останови запись экрана» | Stops a running recording (also «Стоп» in the control window, in the card or in the notification). |
| «оформи баг по записи экрана», «баг по последней записи» | The report card for the newest recording. Sent by the app itself when a recording is ready. |

Near-misses that stay with other apps: «запиши встречу» (the meeting recorder), «скриншот в задачу», «сделай баг из
скриншота», «заведи баг по этому экрану» («Скриншот → задача»), «запиши в дневник: …» («Дневник дня»), «запиши
решение: …» («Архитектурные решения»), «запиши время в Jira» («Учёт времени»), «запиши голосовое», «запиши звонок»,
«как записать экран». Rows in `tests/extension-offers-matrix.cjs`.

## Never silent

- Nothing is recorded from a chat turn: the turn only lists sources. Recording starts on «Начать запись» under a source
  the user picked in that card; a forged or stale source, pick or log path is refused (`setup().ipc.start`).
- On macOS the screen recording permission is checked first (`screenshot-task/capture.cjs` `ensurePermission`).
- The recording is owned by a small always-on-top control window (`recorder.html`, red dot, «0:12 из 2:00», «Стоп»),
  sandboxed in its own in-memory session; its display-media handler grants exactly the chosen
  `DesktopCapturerSource`. The window is excluded from the capture (`setContentProtection`). It stops at «Стоп», at
  2 minutes (the page and a main-process timer), when the source disappears, or at 150 MB. WebM (VP9/VP8), 2.5 Mbit/s,
  no audio.
- Progress lives in the notification center (`screen-bug-recording`, «Остановить» while busy, restored after reload).

## Log and system info

- `unity-log.cjs`: Unity's documented locations — Editor.log (`~/Library/Logs/Unity/Editor.log`,
  `%LOCALAPPDATA%\Unity\Editor\Editor.log`, `~/.config/unity3d/Editor.log`) and every `Player.log` two levels under
  `~/Library/Logs`, `%USERPROFILE%\AppData\LocalLow`, `~/.config/unity3d` (company / product), newest first; «Другой
  лог…» takes any `.log`/`.txt` from the system dialog.
- Excerpt: time-stamped lines (ISO, `[hh:mm:ss]`, `hh:mm:ss.mmm`) from 30 s before the start to the stop; Unity's own
  untimed lines by the file size at the start (everything appended during the recording plus 30 lines of context
  before it; a log truncated by an Editor restart is read whole). At most 400 lines, levels error / warning / trace /
  info, the Unity version from the header. Words that look like passwords or tokens (`clipboard/secrets.cjs`) are
  masked before anything is shown, stored or attached.
- `system-info.cjs`: OS and version, architecture, CPU and threads, memory, GPU (Chromium's GPU info), displays with
  scale and refresh rate, system language, Unity version. No user, host or serial names.

## Draft (`draft.cjs`)

- Steps are never written by the model: empty for the user to fill (or the user's own «шаги: a, b, c» from the note).
- Expected: from the note («…, должно открыться окно сундука»), otherwise empty.
- Actual: the local model gets only the numbered error/warning lines and their neighbours and must cite line numbers;
  an answer that cites no existing error/warning line is dropped. Without a model or without such lines: «В логе:
  <first error>». The title is the user's note, else the model's, else the first exception.
- The card shows the cited lines first, the whole excerpt folded, «по логу · строки N» next to «Фактически».

## Tracker and attachments

`k.links('task-tracker', …)` hands `{title, description, type:'bug'}` to the tracker's own flow (Jira/Asana preview and
«Создать» — the confirmation). The description carries steps, expected, actual, environment and the attachment list.
After the hand-off the card watches the chat for the created task (same recogniser as «Скриншот → задача») and offers
«Прикрепить к KEY»: the video (`video/webm`) and the log excerpt (`text/plain`) are uploaded with
`screenshot-task/attach.cjs` `upload` (Jira `POST /rest/api/3/issue/{key}/attachments`, Asana `POST /attachments`),
each ≤ 100 MB.

Files: `<userData>/screen-bug/<id>.webm`, `<id>.log.txt`, `<id>.json` (0600), the last 10 recordings kept.

## Verified with stubs vs live

Tests: `node tests/screen-bug.cjs` (routing, permission, choice, forged choices, recording stub with a growing
Editor.log and a time-stamped Player.log, masking, system info, draft with and without a model, hand-off, uploads and
media types); UI `tests/screen-bug-ui.cjs` (choice card, live recording and «Стоп», the draft request, report card,
tracker hand-off, attachments; screenshots `petya-screen-bug-*.png`).

Needs live checking:
- the real recording on macOS (Screen Recording permission, window sources, content protection of the control window,
  ScreenCaptureKit with a chosen window) and Windows (window capture of DirectX/fullscreen games, which may record
  black);
- WebM size and quality of a 2-minute game capture; Jira's attachment size limit on the user's site;
- that the Jira/Asana flows' «created» messages are recognised for «Прикрепить к KEY»;
- `getGPUInfo('complete')` names on both platforms; Player.log locations of real games.
