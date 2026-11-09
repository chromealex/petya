# Sprint planning («Планирование спринта»)

Category: team. Directory: `src/extensions/sprint-planning/`. Needs Jira (the shared connection in «Подключения»).

One card per request: velocity of the last 3–6 closed sprints (bars, committed outline, dashed average line),
the next sprint's capacity against carry-over + already planned + proposed scope (semicircle gauge), people lanes
with load bars (carry-over, already in the sprint, proposed, capacity mark, «−N дней», «перегруз»), absences
(chips; chat notes have a red trash button), the proposed backlog issues with include/exclude switches that
recompute the gauge, lanes and status on the card, carry-over and «уже в спринте» lists, a 3-line rationale from
the local model (optional) and warnings.

Actions: «Перенести в Jira…» (sends a prepared chat request, see below), «Отправить план в Slack»
(`k.links('share-message')` → «Попроси команду …»: the Slack flow picks the channel from the project context or
asks with options, shows the text and sends only after «Отправить»), «Пересчитать».

## Phrases

Triggers (when added): «спланируй спринт», «что влезет в следующий спринт», «план на следующий спринт», «что
успеем в этом спринте», «какая у нас скорость», «velocity команды», «скорость команды», «кто перегружен в
спринте», «загрузка в следующем спринте». Absence notes: «Маша в отпуске 23–27», «Олег на больничном с 30 ноября
по 2 декабря», «Ваня не будет 3.12» — only for a person of «Команда» (case forms such as «Маши» are matched), only
with dates; stored per Jira project in `<company data>/extensions/sprint-planning/cache.json`.

Not triggered: «спринт в беге», «бег на 100 метров спринтом», «планы на выходные», «план работ по задаче …»
(task-runner), «загрузка команды», «кто перегружен», «кто сколько задач», «сколько задач у Маши», «какая скорость
интернета», «что такое velocity», «какие задачи в спринте», «итоги спринта», «ретро спринта» (those go to «Ретро», `docs/apps/retro.md`). When the app is added it answers
«спланируй спринт» instead of the generic «sprint-plan» writing skill (extension turns run first); «/sprint-plan …»
still runs the skill.

**Boundary with «Загрузка команды»** (`src/workload.cjs`, Petya's core): open tasks per person right now stay
there («загрузка команды», «кто перегружен», «кто свободен»). This app answers only when the sprint is named
(«кто перегружен в спринте») or for sprint scope and velocity. Extension turns run before the workload handler, so
the word «спринт» is what moves a question here.

## How it is computed (code, not the model)

- Project: the chat's Jira project (topic / project memory binding), the only allowed project, or the working
  project; otherwise a question with the allowed projects. Board: the configured board, the remembered choice, the
  only scrum board, or a question (remembered per project).
- Estimation: `GET /rest/agile/1.0/board/{id}/configuration` → `estimation.field` (story points or another number
  field; time estimates are read as hours). Without one the board is planned by issue count.
- Velocity: for each closed sprint (`/board/{id}/sprint?state=closed`, last 6 by completion), issues of the sprint
  (`/board/{id}/sprint/{sid}/issue`) that are done and resolved before the sprint was completed (+6 h grace);
  subtasks are not counted. Average over the sprints shown.
- Next sprint: the first future sprint; without one, the first working day after the active sprint with the usual
  length in working days (the plan is shown, moving is disabled).
- Capacity: average velocity × (next sprint working days ÷ usual working days), split by each person's share of
  completed work in those sprints (a person without history gets the median share), × available days ÷ working
  days. People: «Команда» members with a Jira account; without any, the people who completed issues in the history.
- Absences: chat notes for the project + calendar events (the calendar app, if added and with calendar access)
  whose title says «Отпуск / Vacation / OOO / больничный / day off / отгул», matched to a person by a name in the
  title or by organizer/attendee e-mail; whole local days.
- With the people records foundation loaded (`s.people`, `docs/foundations/people.md`), the absences of the sprint's
  days come from it instead of the calendar read above: what was typed in «Отсутствия», the calendar app's people
  source and any HR source; the project's chat notes are added (the same days of one person are counted once) and
  shown as «отсутствия» on the card. If the foundation fails, the calendar is read here as before. When «Отсутствия»
  is added, «Маша в отпуске 23–27» goes to it (a confirmation card) rather than to a project note.
- Carry-over: unfinished issues of the active sprint (they keep their assignee and count first); issues already in
  the next sprint count too.
- Proposal: the ranked backlog (`/board/{id}/backlog`, `statusCategory != Done`, rank order) taken greedily:
  an item enters when the team has room and its assignee has room; an unassigned item goes to the person with the
  most room left (shown as «→ Имя»). Items without an estimate are never guessed («без оценки»). Up to six skipped
  items are shown unticked with the reason (не влезает / нет ёмкости / без оценки).
- The model gets only the computed numbers (no issue texts) and writes 3 short lines; without a model the card is
  complete without them.

## Applying the plan (never directly)

«Перенести в Jira…» sends `Перенеси в спринт «<sprint>» (доска <id>, <KEY>): KEY-1 → Имя; KEY-2` to the chat. This
app then validates the sprint (active or future on that board), the names («Команда» with a Jira account), reads a
snapshot of each issue and stages the change in the existing Jira history flow (`src/history.cjs`: preview,
snapshot checks before every write, history entry with undo). The shared question panel asks «Перенести / Отмена»;
only «Перенести» calls `workspace.actions.apply` (assignee `PUT /rest/api/3/issue/{key}`, sprint
`POST /rest/agile/1.0/sprint/{id}/issue`). Up to 30 issues at a time. A changed issue stops the write; unknown
outcomes are reported, never retried.

## Limits

- Velocity is «done before the sprint closed», not Jira's velocity report (`greenhopper` is private API).
- An in-progress carry-over issue counts with its full estimate (remaining estimate is not read).
- Calendar absences are read from the user's own calendar only (colleagues' shared OOO events must be visible there).
- Hours estimation is supported but not tuned (capacity is still velocity-based).

## Verified

Unit (`node tests/sprint-planning.cjs`) and UI (`tests/sprint-planning-ui.cjs`, screenshot
`$TMPDIR/petya-sprint-planning.png` and `-2.png`) with stubbed Jira Cloud REST, Google Calendar and the local model,
including the history-flow write with a stubbed Jira. Not verified against a live Jira site: no credentials here.
