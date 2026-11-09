# Retro («Ретро»)

Category: team. Directory: `src/extensions/retro/`. Needs Jira (the shared connection in «Подключения»); everything
else is used when it is connected.

One card per request: the sprint's **facts**, each with its source, and **drafts** «Хорошо / Плохо / Попробовать»
grounded in them. The card shows velocity bars (this sprint highlighted against the previous ones, dashed average),
tiles (done of taken, carry-over, open bugs, CI failures, incidents), a timeline of the sprint's days with a mark per
dated fact, the three columns (every item lists the facts it rests on — `F1`, `F2`…; a click highlights the fact),
team votes per item, and the facts list with links to Jira queries, CI runs, chat messages, and the names of meetings
and monitoring sources.

## Phrases

Triggers (when added): «подготовь ретро», «подготовь ретроспективу», «собери ретро по спринту 14», «проведём ретро
команды», «ретро спринта», «ретроспектива по прошлому спринту», «что пошло не так в спринте», «что было хорошо в
прошлом спринте», «итоги спринта», «подведи итоги спринта». A sprint is named by number («по спринту 12») or in
quotes («по «GAME Sprint 13»»).

Not triggered (near-misses): «ретро музыка», «ретро-стиль», «включи ретро игры», «ретроград Меркурий», «фото в
стиле ретро», «ретро вечеринка в пятницу», «что такое ретроспектива», «как проводить ретро» (definitions),
«спланируй спринт», «какая у нас скорость» («Планирование спринта»), «что пошло не так» without a sprint, «что
пошло не так с билдом», «почему упала сборка» («Сборки»), «сводка встречи» (Petya's meeting summary), «/retro …»
(a skill).

## Which sprint

The named one; else the active sprint when it ends within three days (or is past its end); else the last closed
sprint. Project and board are chosen as in «Планирование спринта» (the chat's Jira project, the only allowed one, the
working project, or a question; the configured board, the remembered choice, the only scrum board, or a question
remembered per project).

## Facts (code, not the model)

| Kind | Source | How |
| --- | --- | --- |
| velocity | Jira, through `src/extensions/sprint-planning/agile.cjs` and `plan.cjs` | done before the sprint closed (subtasks excluded) vs. taken, against the average of up to five previous closed sprints; good ≥ 95 % of the average, bad < 80 % |
| carry-over | Jira | not-done issues of the sprint (links to them and to the JQL `sprint = ID AND statusCategory != Done`) |
| bugs | Jira | issues of type Bug/Баг/Ошибка/Defect in the sprint, open and closed |
| estimate | Jira | two or more issues taken without an estimate |
| CI | «Сборки» (`ci-builds/sources.cjs`): GitHub Actions runs of the configured repos, Unity Build Automation builds | failures per workflow inside the sprint's days, the latest failed run linked; only when «Сборки» is added and connected |
| incident | monitor sources (`docs/foundations/monitoring.md`) | critical history events and uptime failures in the sprint (`snapshot().history`) |
| decision, complaint, open question | Petya's meeting summaries (company memory, `kind:'summary'`) of the sprint's days | `decisions`; `discussed` points with complaint words; `notDiscussed` |
| decision, complaint | `messenger-source` (`docs/foundations/messengers.md`): every ready source, up to 6 channels each, 200 messages per channel | messages with «решили / договорились / решение:» or complaint words («опять упал», «мешает», «никто не ревьюит», …); bots and short messages skipped; at most six of each, newest first, with the message link and author |

## Drafts

Rules turn facts into items: good facts → «Хорошо», bad facts → «Плохо», and one concrete step per kind of problem
→ «Попробовать» (carry-over → take less and split large issues; CI → a build duty; incidents → a post-mortem; bugs →
time for bugs; unestimated work → estimate at grooming; each complaint and open question → discuss it). With a local
model chosen, the model words the three lists from the numbered facts (no issue texts beyond the fact lines); code
keeps an item only when it cites existing facts, drops «хорошо» resting only on bad facts and «плохо» only on good
ones, and falls back to the rules for a column with nothing usable. The card says which way the drafts were made.

## Votes and actions

- Votes: each item has «Голосовать ▾» with the people of «Команда» (≤ 12); a pick toggles that person's vote. Without
  «Команда» the button is the user's own vote. Votes are stored per retro in
  `<company data>/extensions/retro/cache.json` (the 60 latest retros) through the app's IPC (`vote`, `votes`) and
  restored when the card is drawn again.
- «В задачу» on every «Попробовать» item and «Создать задачи из «Попробовать»» (sorted by votes) go through the
  `task-tracker` link: the tracker's own flow (Jira or Asana) shows the tasks and creates them only after the user
  confirms. Nothing is created from the card itself.
- «Отправить на голосование» goes through `share-message` (Slack, Mattermost, VK Teams): that app asks for the
  channel, shows the exact text and posts only on «Отправить».
- «Обновить» asks again for the same sprint.

## Verified

Unit (`node tests/retro.cjs`): routing and near-misses, not added / not connected, Jira facts over stubbed Jira Cloud
REST (Agile 1.0), CI over stubbed GitHub Actions runs, incidents from a fake monitor source, meeting summaries,
messages of a fake messenger source, rule and model drafts with the checks, a named sprint, the board question,
votes, a Jira failure, and the card without CI / monitoring / messengers. UI (`tests/retro-ui.cjs`, screenshots
`$TMPDIR/petya-retro.png` and `-2.png`). Not verified live: a real Jira site, GitHub, monitoring and messenger
servers, and the local model's wording.
