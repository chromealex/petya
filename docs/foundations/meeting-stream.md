# Live meeting stream

While the user records a meeting, Petya publishes what is being said as it is recognised, so features and extensions
can react during the meeting (the first consumer is «Подсказки на встрече», `docs/apps/meeting-hints.md`). The stream
knows no meeting app: it is fed by the existing recorder and speech recognition.

- Core: `src/meeting-stream.cjs` (`MeetingStream`), service and registry: `src/features/meeting-stream.cjs`.
- Fed by `src/meeting-recording.cjs` (`observe`, one call per fragment recognised while the meeting is recorded) and
  `src/features/meeting-memory.cjs` (start and end with the recording).
- Tests: `tests/meeting-stream.cjs` (the contract alone, no app).

## Where the text comes from

Nothing new listens to the user. The meeting capture (`src/ui/meeting-capture.js`, `AudioListener`) already cuts system
audio and the microphone into fragments — after 650 ms of silence, or after 8 s of continuous speech with a 400 ms
overlap — and `MeetingRecording` recognises them one by one (Whisper or Qwen ASR, `src/voice-setup.cjs`) during the
meeting, stitching the words repeated across an overlap. Each recognised fragment is now also handed to the stream.
There is no extra recognition and no extra CPU for the stream itself.

From fragments the stream builds **utterances** per source:

- A fragment cut by a pause is a whole utterance: one `final` event.
- A fragment cut by the 8-second limit is unfinished: a **partial** (`final:false`) with the text so far; the next
  fragment of the same source that continues it (`overlap`) extends the text (another partial), and the fragment that
  ends with a pause gives the **final** with the whole text. Whether a fragment continues is known exactly when the next
  fragment is already recorded (`continues`), otherwise a fragment as long as the forced cut is taken as unfinished;
  if no continuation comes within 12 s, the utterance is finished as it is.
- A recogniser that streams words itself can use the generic producer form `transcript({utterance, text, final, …})`.

## Events

Every event is a frozen object; `seq` grows by one for each event of the process.

```js
// transcript
{type:'transcript', meetingId, seq, utterance, start, end, speaker?, text, final, source:'sound'|'mic', lag}
// lifecycle
{type:'started', meetingId, seq, at, context, replay?}
{type:'context', meetingId, seq, at, context}          // a source or the calendar added a title / attendees
{type:'paused' | 'resumed', meetingId, seq, at, context}
{type:'lag', meetingId, seq, at, context, behind, lag, pending}
{type:'ended', meetingId, seq, at, context, reason:'stopped'|'error'|'replaced', pending}
// context
{title, app, source, attendees:[names or e-mails], startedAt}
```

- `source`: `sound` — what the meeting played (the other participants), `mic` — the user's microphone.
- `speaker`: the name a meeting source saw talking (`speakers` hook of a meeting source), if any.
- `start`/`end`: milliseconds since the epoch, of the audio; `lag`: how long after `end` the event was published.

Guarantees:

- Partials of an utterance come before its final; the final comes once; nothing of that utterance follows it.
  Repeated identical partials are dropped; the same words again right after a final of the same source (the
  recogniser repeating an overlap) are dropped as a duplicate.
- `started` comes first and `ended` last for a meeting; an open utterance is finished before `ended`. Starting another
  meeting ends the previous one (`reason:'replaced'`).
- Transcript events exist only between `started` and `ended`, only while the user records, and not while paused.

## Bounded work and lag

- The stream adds no recognition. When recognition falls behind — `lag` over 15 s, or more than 3 fragments waiting —
  the stream is `behind`: partials are skipped (finals still come, with their `lag`), and a `lag` event reports the
  change both ways. Finals more than 90 s old are skipped (meeting memory still stores them).
- Fragments recognised after the recording stopped are not live: they only go to meeting memory, as before.
- Each subscriber gets its events one at a time and in order, without blocking the recorder. While a subscriber is
  busy, a newer partial replaces its waiting partial of the same utterance; at most 50 events wait per subscriber,
  the oldest are dropped. A subscriber that throws loses nothing but its own event.
- `status()` → `{active, meetingId, paused, lag, behind, skipped:{partials, finals, duplicates, dropped}, subscribers, seq}`.

## Using it from a feature

```js
const off = services.meetingStream.subscribe(event => { … }, {partials: false});  // returns unsubscribe
services.meetingStream.meeting();      // {meetingId, title, app, source, attendees, startedAt, paused} or null
services.meetingStream.recent(20);     // the last finals of the current meeting (memory only)
services.meetingStream.annotate(meetingId, {title, attendees});  // add context: emits `context`
services.meetingStream.pause(); services.meetingStream.resume();  // the user pauses the live stream
```

`partials` defaults to false; `lifecycle:false` gives transcript events only. The API object is frozen and has no
producer methods: only the recorder feeds the stream (`services.meetingStreamProducer`).
Renderer: `window.petya.feature('meetingStream','status'|'pause'|'resume')`.

## Using it from an extension

Declare a meeting listener in `extension.json`:

```json
"provides": { "meeting-listener": "listener.cjs" }
```

```js
// listener.cjs
module.exports = { id: 'my-app', partials: false, onEvent(event, context) { … } };
```

- `meeting-listener` is a registry kind (`REGISTRIES` in `src/features/app-links.cjs`), never a card button.
  `onEvent` must be a function, `partials` a boolean if present; invalid declarations are refused at load.
- A listener gets events **only while its extension is added** (the catalog switch, checked at every event). Added in
  the middle of a meeting, it first gets `started` with `replay:true`; removed, it gets nothing more (not even `ended`).
- `context` is `{meeting(), recent(limit), status()}` — read-only views. It carries no services: a listener that wants
  to do something outside Petya (post, create a task, mail) goes through its own app's card buttons or the shared
  question panel, with the usual confirmation. The extension's own feature (`setup(services)`) may use services as any
  feature does, under the same rules.

## Privacy

- Events exist only while the user records a meeting (manually or by the auto-record mode the user chose).
- Nothing is persisted by the stream: the last finals of the current meeting stay in memory and are wiped when it ends.
  The transcript is stored only by meeting memory, exactly as before the stream existed.
- The user can pause the live stream without stopping the recording (`pause`); while paused nothing is delivered and the
  utterance in progress is dropped.
- Nothing is sent anywhere by the stream; listeners get no network or service access through it.

## Not done yet

- Real word-by-word partials: the recogniser works on whole fragments (up to 8 s), so a partial appears only for long
  continuous speech. A streaming recogniser can feed `transcript()` without changing consumers.
- Attendees come from a meeting source's `participants` hook or from an app that calls `annotate` (the hints app reads
  the calendar); the recorder does not match voices to people beyond the source's `speakers` hook.
- Measured only with stubs and the recorder in tests; the latency on a live meeting depends on the speech model.
