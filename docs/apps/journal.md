# Journal («Дневник дня»)

Category: personal. No settings card (`settings: false`); added through `extension_journal`. The only setting,
`journalEvening` (`''` = off, the default, or `HH:MM`), is changed from the card or by voice. Files:
`src/extensions/journal/`. No model is used; nothing is posted anywhere.

## What it does
- «Что я сегодня сделал», «итоги дня», «что я вчера сделал» — the day; «итоги недели» — the week (Monday to Sunday);
  «план на завтра» — tomorrow's plan; «запиши в дневник: …» — a private note; «присылай итоги дня в 19:00» /
  «выключи итоги дня» — the evening summary.
- The day is collected from **journal sources** (below): chats where the user asked Petya something (Petya's automatic
  chats and archived ones are not counted), messages Petya sent and tasks it created (confirmed action receipts),
  Jira status changes made by the user, the user's commits in the project repository, meetings Petya recorded,
  reminders done or fired, focus sessions when a focus app provides them. Totals (meetings, tasks, commits, focus
  minutes, chats, messages) are counted from the items' kinds. A failing source is named («Не удалось прочитать:
  Jira») and does not hide the others.
- **Tomorrow's plan**: open items from the sources (Jira tasks due by the end of tomorrow, unfinished reminders) and
  today's unfinished plan are offered under «Перенести на завтра» with checkboxes; the chosen ones are saved for the
  next day and can be ticked off there.
- **Reflection and notes**: a question of the day (rotating) with a private answer, and notes. They are stored only in
  `<company data>/extensions/journal/journal.json`, encrypted with the OS keychain (Electron `safeStorage`) when
  available (mode 0600 otherwise), and never copied into chat messages: the card reads them through
  `window.petya.feature('journal','private',date)`. Deleting a note offers «Отменить».
- **Evening summary** (off by default): on weekdays at the chosen time, once a day, not hours late after sleep, a
  message with the day's card in a «Дневник» chat of the general project and the notification `journal-evening`
  with «Открыть дневник» (`journal-notifications.js`).
- **Morning brief**: `src/features/morning-brief.cjs` got a small generic hook, `addPart(name, part)`; a part returns
  `{text, by?, data?}` and is shown first in the «Утренняя сводка» chat. The journal registers the plan saved for today.
- **Card** (`journalCard`): totals tiles, a week of stacked bars (today outlined, days ahead dimmed) with a legend, the
  day's timeline with an icon per source (links to Jira issues, Slack messages), «Перенести на завтра», the plan, the
  question of the day, notes, and the evening switch. The week card shows the week's totals and main items by day.
- Near-misses that return null and are never offered: «дневник разработки» (a devlog for players — patch notes),
  «журнал логов», «журнал изменений», «итоги встречи», «итоги спринта», «план релиза», «план на спринт», «что я
  сделал не так», «что у меня завтра в календаре».

## Journal sources (`journal-source`)
An app declares `"provides": {"journal-source": "<file>.cjs"}`; the registry is `sources.cjs` (scanned through
`src/features/app-links.cjs`). A source exports `{id, name, icon, ready?(settings), collect(services, {from, to, now})
-> {items:[{at, kind, icon, title, detail?, url?, minutes?}], carry?:[{id, title, detail?, url?, source}]}}`; each source
has 20 s. Built in: `source-chats.cjs` (dialogue state and action receipts), `source-jira.cjs` (`GET /rest/api/3/myself`,
`POST /rest/api/3/search/jql` with `status CHANGED BY currentUser() DURING (…)` and `expand: changelog`, then
`assignee = currentUser() AND statusCategory != Done AND duedate <= "<tomorrow>"`), `source-commits.cjs`
(`git log --all --no-merges --author=<user.email>` in the current project's repository via `gitWorkspace`),
`source-meetings.cjs` (company meeting memory, one item per recording session). «Напоминания» provides its own.
A focus app needs only `{kind:'focus', minutes}` items — the tile «Фокус, мин» appears when such a source exists.

## Verified with stubs vs. live
`node tests/journal.cjs`: routing and near-misses, offers, the day from stubbed chats/receipts/Jira/commits/meetings and
the real reminders service on a fake clock, a failing source, encrypted notes and reflection, carry and the morning
brief part, the evening schedule (off by default, weekdays, once, not late), the week, the registry with a fake focus
app. UI: `tests/journal-ui.cjs` (real journal IPC of the smoke company for notes, reflection, carry and the evening
switch; screenshot `petya-journal.png`). Live checks left: the Jira changelog JQL on a real site, `git log` on a real
repository, meeting memory with real recordings, the evening summary and morning brief over a real day.
