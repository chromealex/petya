# Reminders («Напоминания»)

Category: personal. No settings card (`settings: false`); added through the catalog switch `extension_reminders`.
Files: `src/extensions/reminders/`.

## What it does
- **Time reminders**, read by code (`when.cjs`, never the model), in the computer's local time: «напомни в 16:00
  позвонить», «через 2 часа», «через полчаса», «завтра утром», «в пятницу в 10», «15 ноября в 12:30», «через 2 дня в
  15:00», repeats «каждый понедельник в 10», «по будням в 9:30», «каждый день в 21:00», «по вторникам и четвергам».
  «в 4» means 16:00; a time already passed today means tomorrow; a day without a time gets 10:00 (said in the reply);
  «сегодня» without a time, a past moment, a missing subject or no time at all are asked through the shared question
  panel (`input-required.cjs`, options «Через час / Вечером в 19:00 / Завтра в 10:00»), and the answer resumes the request.
- **Event reminders** through reminder triggers (below): «напомни, когда закроют BW-123» / «когда BW-7 перейдёт в
  Review» (Jira), «когда Олег появится в сети» (Slack presence), «когда начнётся следующая встреча с Машей», «за 10
  минут до встречи с Олегом» (calendar), «когда соберётся билд» (CI builds). The trigger checks the event once when
  the reminder is made (an already closed task is said, not stored).
- **Location** («когда приду домой / на работу») is not supported yet — Petya does not know where the user is: the
  reply says so and offers a time reminder. Planned: Petya's mobile app reports zone events (see «Location triggers»).
- Chat commands: «какие у меня напоминания», «удали напоминание про банк» (with «Вернуть» in the card),
  «не напоминай про воду», «перенеси напоминание про счёт на 18:30», «отложи на 10 минут» (the last fired one).
- **Storage**: `<company data>/extensions/reminders/reminders.json` (mode 0600), per company, survives restarts; the
  last 20 deleted reminders can be restored. A reminder missed while Petya was closed or asleep fires once on start,
  marked «Пропущенное напоминание». A repeating reminder moves to its next occurrence; snoozing it makes a one-off copy.
- **Firing**: a message in the chat the reminder was made in (or a «Напоминания» chat of the general project) with a
  card and a link to the context (Jira issue, build, meeting), a system notification, and the notification center
  item `reminder:<id>` with «Открыть чат», «Отложить на 10 мин», «Готово» (`reminder-notifications.js`; fired and not
  marked reminders are restored after a reload through the `notices` IPC).
- **Tab on «Навыки»** (`extension.json` `ui.tabs`, `renderReminderTab` in `reminder-cards.js`): «Навыки» →
  «Напоминания» shows the same list card, read again from `list` whenever the tab is shown; «Новое напоминание…» goes
  to the chat with «Напомни » in the composer. The tab is there only while the app is added (docs/extensions.md §8a).
- **Card** (`reminderCard`): the confirmation shows how Petya understood the time (in words and as an absolute date)
  with «Изменить» (inline text and date/time editor) and the red trash delete with «Отменить»; the list is grouped
  «Сработали / Сегодня / Позже / По событию», each row with a trigger icon, the time or the event and «проверю в HH:MM»,
  the last check error; a strip of today's hours shows where today's reminders fall. Rows refresh from the live state
  (`window.petya.feature('reminders','list')`).
- **The only reminders in Petya.** Petya's core has none of its own (since 0.15; `tests/core-reminders-guard.cjs`).
  Without the app, «напомни в 16:00 позвонить», «напоминай по будням в 9:30 …» get the offer to add it
  (`offer.cjs`, resumed after adding); recurring commands no longer take «напоминай». With the app, near-misses stay
  with Petya: «напомни Ивану про отчёт» (a message to a colleague, polite-reminder skill),
  «напомни, что мы обсуждали вчера», «напомни, как зовут…», «напомни, когда у нас релиз» (a question).

## Moved from Petya's core (0.15)
Before 0.15 Petya's core had its own reminders: learned voice commands with the action «Поставить напоминание»
(`{delay}`, `{message}`), stored in the learning state (`learned-skills.json`, `reminders: [{id, text, due, state,
skill}]`), checked every second, shown as a card «Напоминания» on «Навыки» with «Отменить». They overlapped with this app
(time reminders, one store per company) but had no repeat, no chat, no events and no list in the chat. Now:
- `migrate.cjs` runs once when the app is set up for a company (bundled apps are set up whether or not they are added):
  `learning.take('reminders')` hands the old list over and drops its undo entries; pending reminders become this app's
  time reminders with the same id, text and time (they fire into the «Напоминания» chat; an overdue one fires once as
  «Пропущенное напоминание»), delivered ones become done reminders (the journal sees them), cancelled ones are
  dropped; learned commands with the old action become «Выполнить команду в чате» with «Напомни через {delay}:
  {message}» (`learning.replaceSkill`: same id, growth kept), which this app answers. `when.cjs` reads seconds and
  spans of several parts («через 1 час 20 минут») for them.
- **Choice: migrate on startup and add the app.** When anything still active moved (a pending reminder or a learned
  command), the app is added in that company (`extension_reminders`), because it is local — no network, no downloads,
  nothing to connect — and that is the only way nothing is lost: the reminders keep firing on time, the list is on
  «Навыки» → «Напоминания» and the learned phrases keep working. A notice that only offered the app would leave
  reminders silent until the user acted, and one missed while waiting is lost. A one-time notification says where they
  went (and that the app was added), with «Открыть» to the tab (`notices` → `noteSeen`). Only history (delivered
  reminders) moves quietly and does not add the app. The user can remove the app afterwards like any other.
- The core daily brief («Что у нас сегодня?») no longer lists reminders; the journal shows them (`journal-source`).

## Reminder triggers (`reminder-trigger`)
An app declares `"provides": {"reminder-trigger": "<file>.cjs"}`; the registry is `triggers.cjs` (scanned through
`src/features/app-links.cjs`). A trigger exports `{id, name, icon, match(text) -> params|null, ready(settings),
connect, prepare(services, params, {now}), check(services, params, {now, state}), every?(checks, params, now)}`;
`prepare` may refuse with `TriggerError` `unsupported` / `already` / `not-found`. Checks only read; polling runs one
check at a time, with the trigger's backoff, error backoff (×2 per failure, up to an hour) and one «не могу проверить»
notification on the third failure in a row. An event reminder gives up after 30 days. Built in (in this directory):

| Trigger | API | Poll |
| --- | --- | --- |
| `jira-status` | `GET /rest/api/3/issue/{key}?fields=summary,status` (Petya's Jira connection); done = status category `done`, or a named status | 2 min ×1.5 up to 30 min |
| `slack-presence` | `users.getPresence?user=…` (needs **users:read**; `missing_scope` → explained, time reminder offered); person and Slack ID from «Команда»; already online → waits for away → active | 2 min |
| `calendar-meeting` | Google Calendar `events.list` / Graph `calendarView` through «Календарь»'s account; attendee email from «Команда» or the name in the title; re-read while waiting (moved → follows, cancelled → reported) | ≤ 30 min, then at the moment |
| `ci-build` | «Сборки»: GitHub `GET /repos/{owner}/{repo}/actions/runs`, Unity Build Automation v2; the newest running run, or the next one that finishes | 1 min ×1.3 up to 5 min |

`trigger-ci.cjs` belongs to «Сборки» conceptually and can move to `src/extensions/ci-builds/` with a `provides` entry
there (no code change). Reminders also provide a `journal-source` (`journal-source.cjs`): done/fired reminders for the
day's timeline, open ones as candidates for tomorrow's plan, and the cross-app kind `reminder` (`reminder-link.cjs`):
another app's card button «Напомнить» with `{date, time?, text}` puts «Напомни 1 декабря 2026 в 10:00: …» into the
chat, which this app parses and confirms as usual (a passed date is refused); used by «Договоры в PDF».

### Location triggers (planned: Petya's mobile app)
Location reminders («когда приду домой», «когда уйду с работы», «когда буду у офиса») will come from Petya's mobile
app, as one more `reminder-trigger` provider — the reminders app itself does not change:
- The phone keeps the zones the user named («Дом», «Работа», «Офис на Тверской») with the OS geofencing API (iOS
  region monitoring, Android Geofencing) and sends only zone events `{zone, event: enter|exit, at}` to the paired Petya
  on the desktop; raw coordinates never leave the phone.
- The provider (an extension, e.g. `mobile`) declares `"provides": {"reminder-trigger": "trigger-location.cjs"}`:
  `match(text)` → `{zone, event}` from «когда приду/вернусь домой», «когда уйду с работы»; `ready(settings)` = a phone
  is paired and has at least one zone; `prepare` refuses an unknown zone with `not-found` and the list of zones;
  `check` reads the latest zone events received from the phone (no polling of the phone itself).
- Until then the built-in refusal stays: the reply says Petya does not know where the user is and offers a time
  reminder. When the provider exists, `match` of the refusal must yield to it (the refusal checks that no ready
  trigger matched).

## Verified with stubs vs. live
No real credentials here. Everything is tested with stubs and a fake clock: `node tests/reminders.cjs` (parsing,
routing and near-misses, offers, persistence across a restart, firing into the chat with a notification, missed and
repeating reminders, clarifications, list/move/edit/delete/undo, Jira backoff and errors, Slack without users:read,
presence, calendar meeting move, CI build, the registry). UI: `tests/reminders-ui.cjs` (real backend of the smoke
company, screenshot `petya-reminders.png`); the «Навыки» tab in `tests/extension-places-ui.cjs`
(`petya-places-reminders-tab.png`); the migration in `tests/reminders.cjs`. To verify live: Jira status polling on a real site, Slack users.getPresence
with a users:read token (and the missing_scope answer of a token without it), Google/Outlook event reads, GitHub runs,
system notifications on macOS/Windows.
