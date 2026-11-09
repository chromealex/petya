# People records (foundation)

One local record per colleague of «Команда» — absences, 1:1 notes, agreed follow-ups, an anniversary — for apps that
answer «кто в отпуске», «когда Маша вернётся», «подготовь 1:1 с Олегом», «что я обещал Маше». Core feature
`src/features/people.cjs` (one line in `src/features.cjs`), implementation in `src/people/`. Consumers: «Отсутствия»
(`docs/apps/absences.md`), «Встречи 1:1» (`docs/apps/one-on-one.md`), the capacity of «Планирование спринта»
(`docs/apps/sprint-planning.md`), «Онбординг новичка» (members, absences) and «Перформанс-ревью» (1:1 notes and
follow-ups of the person asked about).

## The team list is «Команда»
There is no second list. `members()` is `team.members(settings)` with a `key` per person: the Jira account id, else the
email, else the name (the same key sprint planning already used). A record is found by its key or by the other
identities it was saved with (name, email), so adding a Jira account to a card later re-keys the record instead of
orphaning it. Someone outside «Команда» has no record: apps say so and suggest adding the person there.

Names in phrases (`src/people/text.cjs`): `member(word)` matches a name, alias or Jira name in any case («Маши»,
«с Олегом», «Марии»); two people that fit equally are `candidates()` and the apps ask, never guess. `mentioned(text)`
finds the colleague(s) named anywhere in a phrase. The same module parses a typed absence (`parseNote`): «Маша в
отпуске с 10 по 20», «Олег на больничном до 20-го», «Ваня взял отгул в пятницу», «не будет 3.12»; hours («не будет 5
минут», «до 18:00») and dates-less statements are not absences. Sprint planning re-exports it.

## Privacy
- **Opt-in by action**: nothing is collected in the background. A record is written only when the user pressed
  «Сохранить» on a card (an absence typed in the chat, the outcome of a 1:1). Calendar events and other sources are
  read when an app asks and never stored; `peopleCalendar` (`'true'`, the switch in «Отсутствия» settings) turns the
  calendar off as a source.
- **Local**: `<company data>/people/people.json` (folder 0700, file 0600), encrypted with Electron `safeStorage` when
  available (`status().encrypted`); without the keychain an encrypted file reads as empty, never as an error. Per
  company (the company's data folder). Nothing is sent anywhere.
- **Private notes**: 1:1 notes and follow-ups are returned only by `notes()` / `followups()`. Only «Встречи 1:1» and
  «Перформанс-ревью» (`docs/apps/perf-review.md`) call them, in a turn where the user asked about that person in that
  chat; they are not part of `team.context()` (the model's team reference), «Команда», other apps' prompts or requests
  to Claude/Codex. «Онбординг новичка» reads only members and absences. The 1:1 app's reply texts carry counts, not
  note text; its local model call (agenda questions) happens only in a prep turn the user asked for.
- **Wipe**: `wipe('notes')` deletes notes and follow-ups (absences stay; «Встречи 1:1» settings), `wipe()` deletes the
  folder («Отсутствия» settings), `forget(member)` one record. Both settings buttons ask first.

## Record shape
```
{key, name, email, anniversary:'YYYY-MM-DD'|'',
 absences:[{id, from, to, kind:'vacation'|'sick'|'dayoff'|'away', note, source:'chat', at, draft?}],   // ≤ 200, older than a year dropped
 notes:[{id, date, text, at, draft?}],                                                                 // ≤ 300, text ≤ 4000
 followups:[{id, text, owner:'me'|'them', due:'YYYY-MM-DD'|'', done, doneAt, at, noteId}]}             // ≤ 500, text ≤ 300
```
Dates are whole local days, inclusive. An absence is at most 120 days; the same days of one person are stored once.
Birthdays are not duplicated: `dates()` takes them from the «Команда» card (typed there or filled from a profile) and
anniversaries from the record, only when the user entered them.

## API (`s.people`)
| Call | Result |
| --- | --- |
| `members()`, `member(key)`, `find(text)` | team members with `key`; one by key/name/email; `{member}` / `{many}` / `null` from a phrase |
| `absences({from, to?, key?, fetcher?})` | `{rows:[{id, member, name, from, to, kind, note, source, sourceName?, title?, removable}], notes:[…], from, to}` — stored plus every ready source for `[from, to]` (two weeks without `to`); a failing source is a line in `notes`, not an error |
| `stored({from, to, key})` | typed absences only (sync) |
| `addAbsence(member, {from, to, kind, note, draft})`, `removeAbsence(key, id)`, `restoreAbsence(key, row)` | the row (`existed:true` for a duplicate) |
| `notes(member, {limit})`, `addNote(member, {text, date, followups, draft})` | newest first; `{note, followups}` |
| `followups({member?, owner?, open=true})`, `setFollowup(key, id, done)` | open first by due date; the updated follow-up |
| `setAnniversary(member, date)`, `dates()` | |
| `draft(id)` | whether a card's draft was saved (a card drawn again shows «сохранено») |
| `status()` | `{people, absences, notes, followups, encrypted, calendar, sources}` |
| `wipe('all'\|'notes')`, `forget(member)` | |

Renderer IPC: `window.petya.feature('people', 'status' | 'wipe', 'all'|'notes')`. The apps write through their own IPC
(the confirmation buttons), which checks the app is added and the draft belongs to the current company.

## Sources (`people-source`)
Absences from other systems plug in as `"provides": {"people-source": "<file>.cjs"}` (a REGISTRIES kind in
`src/features/app-links.cjs`). The file exports `{id, name?, ready(settings), async absences(services, {from, to,
members, fetcher}) → [{member | email | name, from, to, kind?, title?}]}` (`to` exclusive). Rows are matched to
«Команда» by key, then email, then name; unknown people and invalid dates are dropped; only sources of added apps that
are `ready` run; a throwing source is reported in `notes`.

- **Calendar** (`src/extensions/calendar/people-source.cjs`, the first source): events of the chosen account in the
  period that are out-of-office (Google `eventType: "outOfOffice"`, Outlook `showAs: "oof"` — exposed by the calendar
  client as `meta.ooo`) or whose title says «Отпуск / Vacation / OOO / больничный / day off / отгул»; declined ones are
  skipped. Whose: a «Команда» name in the title, else the organizer's / only attendee's e-mail, else the account owner
  for their own event. All-day events end the day before their exclusive end.
- **HR systems** (not implemented; endpoints to be checked against the vendors' current docs when built): BambooHR
  («who's out», `/api/gateway.php/{company}/v1/time_off/whos_out`), Personio (`/v1/company/time-offs`), HiBob
  («who's out», `/v1/timeoff/whosout`) would each be an app with its own token and a `people-source.cjs` mapping
  employees by work e-mail.

## Tests
`node tests/people.cjs` — fake clock and fake keychain: keys from «Команда», typed absences (limits, duplicates,
remove/restore), sources merged (by key, e-mail, name; unknown people and bad dates dropped), a failing source apart,
the calendar switch, 1:1 notes and follow-ups, re-keying when a Jira account is added, drafts, encryption at rest (no
names or note words in the file), file modes, the team context without notes, wipe of notes and of everything, the
phrase parser and the calendar source over a stubbed Google Calendar. Sprint planning with the foundation: a section of
`tests/sprint-planning.cjs`. Not verified live: Google `outOfOffice` / Outlook `oof` events from real calendars and
`safeStorage` on macOS/Windows.
