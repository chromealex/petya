# Подсказки на встрече (meeting-hints)

During a recorded meeting, a small panel in the top right corner of the screen hints at what Petya already knows about
the talk:

- **«Это уже решали 3 октября»** — the talk matches a decision from the summary of an earlier meeting.
- **«Ты обещал: прислать макеты…»** — a task from a summary (the last 45 days) that the talk mentions: the user's own
  promises, and other people's only when they take part in the meeting (calendar attendees).
- **A term** from «Глоссарий» used in the talk, with its definition (when «Глоссарий» is added).

Each hint cites its source (the summary and its date, or the glossary and project). At most one hint per 30 seconds,
each decision/promise/term at most once per meeting. The panel never takes focus (the meeting app keeps the keyboard),
stays over full-screen apps, hides itself after a minute, and has «Понятно», «Не показывать такое» (turns off that kind
of hint: decisions, promises or terms) and «Скрыть» (until the meeting ends).

Category: meetings. Built on the live meeting stream (`docs/foundations/meeting-stream.md`) through the app's
`meeting-listener` (`listener.cjs`). Card key `meetingHints` (`renderMeetingHints`): the mode switch, the sources,
the meeting timeline with a mark per hint, and the hints with sources.

## Phrases

- «Подсказывай на встречах», «включи подсказки на всех встречах» — every recorded meeting.
- «Включи подсказки» — the meeting being recorded now, or the next one; switches off when it ends.
- «Выключи подсказки», «не подсказывай» — off.
- «Какие подсказки на встрече?», «подсказки» — the card with the current state.

Near-misses that are not this app (tested): «сводка встречи», «запиши встречу», «слушай встречу», «подготовь меня к
встрече», «что решили на встрече», «напомни о встрече», «подскажи, как поставить встречу», «включи подсказки в коде»,
«подсказка к задаче в Jira».

## Setup and privacy

- Off by default: adding the app does not turn hints on; the mode (`meetingHintsMode`: off / meeting / always) is set
  by the phrases above, the card or Settings. Muted kinds: `meetingHintsMuted`, reset in the card or Settings.
- Works only while the user records a meeting. The talk is compared in memory on this computer; hints are not saved
  (forgotten when the meeting ends) and nothing is sent anywhere. The transcript is stored only by meeting memory, as
  without the app.
- The calendar is read (when «Календарь» is added and connected) once per meeting for its title and attendees, via the
  calendar app's own accounts and client; nothing is written.

## Matching

- Fallback (always available): word stems of the last minute of finished phrases against each decision/promise; a
  match needs two shared stems covering half of the item, or three covering a third. Filler words are ignored. Terms
  match as whole words in their Russian case forms.
- **Semantic index hook:** when the services offer `semanticIndex.search(query, {kinds:['meeting-decision'], limit:3})`
  returning `[{text, score 0..1, at, title, sessionId}]`, decision matches with `score ≥ 0.78` come from it first
  (`knowledge.cjs` → `semantic`). Missing or failing index → keyword matching only. The index foundation is built
  separately; this is the contract it needs to serve.

## Limits

- Hints come from Petya's own meeting summaries: a meeting without a summary gives nothing; whether a promise is done
  is not checked against a tracker.
- Calendar attendees are e-mail addresses; another person's promise is shown only when their first name matches an
  attendee (e.g. `oleg@…` for «Oleg»), not across alphabets.
- The live text comes in fragments of up to 8 seconds, so a hint follows the phrase by a few seconds plus recognition.

## Verified

- Unit (`tests/meeting-hints.cjs`): routing and near-misses, matching against stubbed summaries and a temporary
  glossary, the semantic hook and its fallback, the 30-second limit, dismiss/mute/hide, the one-meeting mode, chat
  turns, the path stream → listener → hint (and nothing while the app is not added), calendar context with a stubbed
  Google Calendar response.
- UI (`tests/meeting-hints-ui.cjs`): the chat card and the real panel window (not focusable, always on top, buttons
  reach the main process), screenshots of both, light and dark.
- Not verified live: a real meeting with real speech recognition and a real calendar account.
