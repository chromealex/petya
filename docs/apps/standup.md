# Standup («Стендап»)

Category: team. Directory: `src/extensions/standup/`. Needs Jira or Slack (shared connections); git is used when the
chat project has local folders with a repository.

An async standup for the lead. For each person of «Команда»: «вчера / сегодня / блокеры» from their own answer in a
chosen Slack thread, or a draft from their Jira activity and commits since the last standup. The card: tiles
(answered, blockers, without answer), an answers bar (answered in the thread / draft from Jira and git / no answer),
one row per person (avatar, role, «ответ в треде» / «черновик», «нет ответа» or «нет активности», blocker count)
with three columns, blockers as alert-tone chips, issue keys as links, an unstructured answer as a quote.

Actions: «Отправить сводку в Slack» and «Спросить в треде» (`k.links('share-message')` → «Попроси команду …»; the
Slack flow uses the project's confirmed channel or asks, shows channel/thread/text and sends only after
«Отправить»; the thread question includes the thread link), «Создать задачи по блокерам»
(`k.links('task-tracker')`, the tracker's batch flow confirms), «Обновить».

## Phrases

Triggers (when added): «собери стендап», «стендап», «покажи сводку стендапа», «кто не ответил на стендап», «что
вчера делала команда», «что сделала команда вчера», «у кого блокеры», «какие блокеры у команды», «настрой стендап
на 10:30», «стендап по будням в 9:45», «настрой стендап на пн, ср, пт в 9:45 в треде https://…slack.com/archives/…»,
«каждый день в 10 собирай стендап», «выключи стендап», «не собирай стендап».

Not triggered: «стенд-ап комедия», «стендап-комик в клубе», «сходим на стендап шоу», «встань», «сводка встречи»
(meetings), «во сколько стендап», «перенеси стендап на 11», «запиши стендап» (calendar / meeting recording), «что
такое стендап», «как проводить дейли», «что вчера делала Маша в Jira».

## Sources (read-only)

- Jira, project as in sprint planning (chat binding, the only one, the working project, or a question, remembered
  per chat project):
  `POST /rest/api/3/search/jql` with `updated >= -Nm`, `expand=changelog`, fields `comment`, `worklog` — status
  transitions, comments and worklogs by each person since the last standup (filtered by timestamp in code);
  `POST /rest/api/3/search/jql` with `assignee in (…) AND statusCategory != Done` — «сегодня» = issues in progress,
  blockers = the «Flagged» field (found via `GET /rest/api/3/field`, cached), a status like Blocked / On hold,
  priority Blocker, an unresolved «is blocked by» link, a `blocked*` label.
- Git: `git log --all --no-merges --since=…` in the chat project's folders that contain `.git` (up to 4), matched
  to people by e-mail or name.
- Slack: `GET conversations.replies` of the thread (link in the request or saved by «настрой стендап … в треде …»).
  Replies after the root and after the last standup; bots ignored. «Вчера: … Сегодня: … Блокеры: …» markers are
  parsed by code; an answer without markers is split by the local model if one is chosen, otherwise shown as a quote.
  People outside «Команда» who answered are shown with their Slack name. Needs `channels:history` / `groups:history`.
- In thread mode «нет ответа» = no reply in the thread (a Jira draft is still shown); without a thread «нет
  активности» = nothing in Jira or git.

«Since the last standup»: the previous run of this chat project (asking again the same day keeps the same period),
or the previous working day at the standup time (10:00 when no schedule).

## Schedule

«настрой стендап на 10:30» stores time, weekdays (default Mon–Fri) and optionally the thread per chat project in
`<company data>/extensions/standup/cache.json`. A timer (every minute, not in smoke tests) prepares the summary once
a day on the chosen days, within 3 hours after the time: a message with the card in the chat «Стендап · <project>»
of that project, a notification-center item (`standup:<project id>`, «attention» when there are blockers) and a
system notification. The schedule never posts to Slack.

## Limits

- Jira search returns up to 100 updated issues per page (2 pages); comment/worklog lists inside search results may be
  truncated by Jira for very active issues.
- The schedule runs only while Petya is running; a missed day is not caught up after 3 hours.
- Changelog authors are matched by Jira account id, so people need a Jira account in «Команда».

## Verified

Unit (`node tests/standup.cjs`) and UI (`tests/standup-ui.cjs`, screenshots `$TMPDIR/petya-standup.png` and
`-2.png`) with stubbed Jira, Slack, git and the model. Not verified against live Jira/Slack: no credentials here.
