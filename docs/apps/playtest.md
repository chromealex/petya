# Playtest review (`playtest`, «Разбор плейтеста»)

Local extension, category `gamedev`. Finds frustration moments in a recorded play session: repeated deaths, attempts
at the same spot, long idle/hesitation, negative think-aloud and taps on non-interactive places. Every moment has a
timestamp, a severity and its evidence (frame description, the player's words verbatim, a logged event); a moment
without evidence is never produced.

## Inputs
- **Video**: MP4, MOV or WebM attached from disk (the composer keeps its path), a path in the request, or the video
  attached earlier in this chat. A video attached without a path (e.g. imported from Slack/Telegram) is analysed from
  the attachment's own frames (up to 12) and transcript; idle detection then needs a path and the card says so.
- **Event log (optional)**: CSV or JSON next to the video. Columns/keys for time (`time`, `t`, `timestamp`, `ts`,
  `seconds`, `время` …: seconds, `mm:ss`, `hh:mm:ss`, epoch, ISO) and event (`event`, `type`, `name`, `событие` …),
  optional level (`level`, `stage`, `location`, `уровень` …). Kinds: death/fail/game over, retry/restart/respawn,
  level start/end, purchase, tap miss, session/recording start. Absolute times count from the session or recording
  start event (or the first event); the card notes that the recording must start then too.

## How it works
1. The chat turn answers at once with a running card; the analysis runs in the background. Progress (stage and
   percent) goes to the notification center under one id `playtest:<job>` with «Отменить»
   (`playtest-notifications.js`); the card polls the app's status and fills in when done; the result is saved into
   the chat message, so it survives a restart. A second start for the same video is refused while one runs.
2. Frames: a hidden sandboxed window (`sampler.html`) opens the file once and grabs frames every ~5 s (12–90 frames,
   up to 16 MP, 15 s per seek) in batches of 8. Per frame: a ≤ 640 px JPEG for the model (dropped after its batch),
   a ≤ 176 px thumbnail for the card (data URL, the card's CSP allows only `data:` images), the mean pixel change from
   the previous sample (32×18 grey) and an 8×8 average hash.
3. Vision (optional): gemma3:4b from Petya's optional models or another installed local vision model labels each
   frame (screen kind: gameplay / fail / win / menu / loading / dialog / other, visible text, one sentence, tap on an
   empty place). At most two requests at a time. Without a model nothing is guessed: idle still comes from pixels,
   speech and the log still work, and the card offers «Скачать модель для кадров» (declared in `downloads`).
4. Speech: the transcript Petya's video reader already made for the attachment, or Petya's own pipeline
   (`attachments.video({filePath})`: Whisper by ~30 s fragments) for a path. Negative phrases («не понимаю», «опять»,
   «куда тут прыгать», «бесит» …) are quoted verbatim; a sentence with swearing is marked «нецензурная речь — без
   цитаты» and its text is not stored. Whisper's stock captions are ignored. A phrase's time is estimated inside its
   fragment (shown as «≈»).
5. Moments (`moments.cjs`): deaths from the log and fail screens (a fail frame joins a logged death nearby);
   repeated attempts = ≥ 2 deaths on one level (log) or fail screens followed by the same-looking respawn (hash
   distance ≤ 10); idle = consecutive samples with almost no change for ≥ 20 s (loading screens excluded); speech;
   UI = frames with a tap on nothing or logged tap misses. Different kinds within 15 s raise each other's severity.
   Top issues are computed from the moments.

Cancellation destroys the sampler window, aborts vision requests and stops the transcription (Petya's
`cancelVideo`); a Whisper request already sent finishes or times out, as for attachments.

## Card
Session timeline with markers by type (spans for retries and idle) and a strip of screen kinds; a legend with counts;
«Главное» (top issues); moments with the thumbnail, time, type, severity, evidence, «Рядом: …», «Открыть на этом
месте» (Petya's small player window at that second; the system player if the codec does not play there) and «Создать
задачу: <трекер>» via `k.links('task-tracker')` (only connected trackers; the tracker's flow previews before
creating). A running card shows the stage, progress and «Отменить».

## Phrases
«разбери плейтест», «где игрок застрял», «моменты фрустрации в этом видео», «почему игрок бросил уровень»,
«разбери playtest». Near-misses (null / no offer): «разбери видео созвона» (meetings), «сделай гифку из видео»
(converter), «тест упал», «разбери профайлер», «что такое плейтест?», «как провести плейтест», «разбери видео».

## Limits
- Sampling every ~5 s misses short events between frames; idle needs ≥ 20 s.
- A small vision model can mislabel screens; labels are shown as evidence, and the log is preferred when present.
- Tap detection works only when touches or the cursor are visible in the recording.

## Verified
- Unit (`node tests/playtest.cjs`): fixtures in `tests/fixtures/playtest/` (CSV and JSON logs, a transcript), stubbed
  sampler / vision / transcription; routing, moments, batches and concurrency, notifications, no model, cancel,
  attachment frames, duplicate start, opening at a moment.
- UI (`tests/playtest-ui.cjs`): with ffmpeg present, a generated 60 s H.264 clip is analysed by the real sampler
  window (frames, pixel change, hashes, thumbnails); vision and speech are stubbed. Screenshots checked.
- Not verified here: a real gemma3:4b run on game footage, real Whisper on a think-aloud recording, the player window
  and the system-player fallback on macOS/Windows.
