# Meeting prep app (`src/extensions/meeting-prep`)

«Подготовка к встрече» prepares the user for the next meeting, or for a meeting they name. It shows:

- who attends, with roles and photos from «Команда»;
- what was discussed with these people last time;
- open tasks from those meetings, with their status in Jira or Asana;
- related Slack threads;
- three suggested agenda points, each citing the facts it rests on.

Facts are collected by code. The local model only words the agenda, and every point must cite fact ids from the
collected list. A point without a real citation is dropped. Without a model, or when the model cites nothing
real, the agenda is built by rules from the same facts.

## Phrases

| Request | Mode |
|---|---|
| «подготовь меня к встрече», «подготовь меня к синку по релизу», «подготовь к встрече «Синк по релизу»» | prep: next or named meeting |
| «что обсуждали с Олегом в прошлый раз», «что мы решили в прошлый раз на синке» | history with a person (their next meeting is shown if there is one) |
| «о чём следующая встреча» | next meeting |
| «повестка на синк», «составь повестку к завтрашней встрече» | agenda |

These phrases are not handled by the app and return `null`:

- «сводка встречи», «что решили на встрече», «что обсуждали на прошлой встрече»: Petya's meeting summary
  (`src/features/meeting-summary.cjs`). «На прошлой встрече» without a person or «в прошлый раз» stays there.
- «что у меня сегодня», «поставь встречу …», «найди час с Машей»: «Календарь».
- «запиши встречу»: the recorder.
- «Запомни повестку следующей встречи: …»: the meetings card's own action.
- «Составь повестку встречи по релизу»: an agenda on a topic, with no concrete meeting. It belongs to the built-in
  `meeting-agenda` skill (see `src/live-cases.cjs`). This app takes an agenda only *for* a meeting: «повестка на
  синк», «повестку к завтрашней встрече», «повестка следующей встречи».
- Any request that already contains its own list after a colon.

The same lists are in `AVOID` and `offer.cjs`. The calendar's `AVOID` now also leaves «повестка» and
«подготовь … к …» to this app. In the extension turn order, the calendar runs first.

## Where the facts come from

- **The meeting.** It comes from «Календарь», the same accounts and `calendarAccount` choice, via
  `CalendarClient.events` with attendees and organizer. The next meeting is the first timed, not-declined event
  that ends after now. An event that started less than 15 minutes ago still counts. A named meeting
  («к синку по релизу», «повестка на синк», a «quoted title») is matched by title words, with Russian endings
  folded. If it is not found within 7 days, Petya asks a strict-choice question listing the real upcoming meetings.
- **Attendees.** Event emails are matched to «Команда» members by email. The card's `k.avatar` shows the team
  photo. Several team members fitting «с Олегом» is a clarification.
- **Past meetings.** Calendar events from the last 30 days count when they have the same title or mostly the same
  people. These are joined with Petya's recorded meetings (`meetingSummary.meetings` over the company memory)
  that overlap them in time, ±15 min. A recording without a calendar event counts when the meeting source's title
  (the recording part's `title` before « · ») or its speakers (team-match labels) match. The summary is the
  memory item `kind:'summary'` of that session: its `decisions`, `tasks` and `notDiscussed`. The timeline marks
  each entry «сводка», «запись без сводки» (with «Собрать сводку», which calls
  `meetingSummary.summarize`) or «без записи».
- **Tracker status (read-only).** The tracker is used when Jira or Asana is connected (`workload.sources`). An
  explicit key in the task text (`REL-77`) is read with `GET /rest/api/3/issue/{key}`. Other tasks are found with
  `POST /rest/api/3/search/jql` (`text ~ "…"` in the chosen projects, updated in the last 45 days). For Asana,
  `GET /workspaces/{gid}/typeahead?resource_type=task` is used. A hit counts only when at least 60% of the
  task's words are in its title. Nothing is written.
- **Slack.** Threads come from Petya's memory (`source:'Slack'`, the last 7 days), already filtered by the
  modules and the chat's excluded materials. A thread counts when it shares a meaningful word with the meeting
  title or the open tasks, and, when attendees' Slack IDs are known, one of them wrote there. No new Slack calls
  or scopes are made.

## Prerequisite and connection

- **App not added:** the turn returns `null`, and the offers flow handles it.
- **App added, «Календарь» not added:** the answer is a question carrying the standard offer card for
  «Календарь». It comes from `extensionOffers.prerequisite('calendar', command)`, a small generic addition to
  `src/features/extension-offers.cjs`. Accepting adds the calendar, opens its settings, and «Готово — продолжить»
  resends the original request.
- **Calendar added but without calendar access:** a question pointing to «Настройки → Календарь».

## Actions on the card

- «Открыть звонок»: the event's video link.
- «Записать встречу»: `k.links('meeting-recording', …)`. It records now when the meeting is within 10 minutes,
  otherwise it schedules the recording. It is shown only when a recording provider fits the link.
- «Отправить повестку участникам»: `k.links('share-message', …)`. The message app's own flow previews the
  channel and text and sends only after its confirmation.
- «В описание встречи»: shown to the organizer only. It first shows the exact text (`meetingPrep.preview`), and
  only «Подтвердить» calls `meetingPrep.addAgenda`. This uses the new `CalendarClient.appendDescription`:
  - Google: `GET` the event, then `PATCH …/events/{id}?sendUpdates=all` with the old description kept.
  - Graph: `GET /me/events/{id}?$select=body`, then `PATCH /me/events/{id}`, keeping an HTML body as HTML with
    the text escaped.

  The text is never added twice. A second press reports «already». A write without an answer marks the outcome
  as unknown and is not retried.
- «Обновить»: asks again.

## Reminder (optional)

Settings → «Подготовка к встрече» → «Напоминать за 10 минут до встречи» (`meetingPrepRemind`, off by default).

1. Every 30 seconds the main process checks the next hour of the calendar. It refreshes the event list at most
   every 5 minutes.
2. For an event 10 minutes or less before its start, it publishes one notification
   «Через 10 минут: Синк по релизу — открыть подготовку». The id `meeting-prep:<event>@<start>` is stable, so
   unread state does not reset.
3. `settings.js` adds the «Открыть подготовку» action, which sends «Подготовь меня к встрече «…»».

The state (upcoming list and reminders shown) is persisted in `meetingPrepReminders`. A restart therefore never
repeats a reminder. A reminder due while the calendar cannot be read still comes from the saved list. After a
window reload, `meetingPrep.reminders` restores the active reminders.

## Limits

- Petya's meeting memory keeps 1–7 days (`contextDays`), so «last time» with a summary is only as old as the
  memory. Older occurrences appear from the calendar as «без записи».
- Summaries store tasks as free text, so tracker matching is by words and can miss a renamed issue. It is never
  guessed, and an unmatched task shows «нет в трекере».
- The description can be changed only by the organizer. Other users get the share-message action only.

## Verified

Everything is tested with stubs. No real Google/Microsoft, Jira, Asana or Slack credentials exist here.

- `node tests/meeting-prep.cjs` covers:
  - routing and near-misses against the calendar and meeting summary;
  - the calendar prerequisite through the real offers service, and the not-connected question;
  - the happy path with a stubbed Google Calendar, memory recordings and summaries, Jira by key and by words, and
    Slack from memory;
  - agenda citations with an invented citation dropped, the fallback without a model, a person clarification and
    the named-meeting question;
  - the 401 error;
  - confirmed description update (idempotent, organizer only, unknown outcome), and the Graph HTML append;
  - reminders: off by default, once, persisted, offline from the saved list.
- `tests/meeting-prep-ui.cjs` renders the card in the real window, checks the DOM, and saves
  `petya-meeting-prep.png` and `petya-meeting-prep-bottom.png` to the temp folder.

To verify live: a Google and an Outlook calendar with real recurring meetings, a description PATCH as organizer,
Jira Cloud JQL `text ~` results, and Asana typeahead.
