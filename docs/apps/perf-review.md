# «Перформанс-ревью» (`perf-review`)

Materials for a colleague's performance review over a period, from facts only. Category `team`, code
`src/extensions/perf-review/`.

## What it does

«собери материалы для ревью Олега за полгода», «подготовь перформанс-ревью Маши за квартал» (period: полгода by
default, квартал, год, месяц, «N месяцев/недель»). The person must be in «Команда»; an unknown or missing name is asked.

Facts (`facts.cjs`), each with a date, a source label and a link where the service has one:

| Kind | Source | Request |
| --- | --- | --- |
| tasks done, incidents handled | Jira (Petya's connection, the chosen projects), the person's Jira account | `POST /rest/api/3/search/jql` `assignee = … AND statusCategory = Done AND resolved >= …`; an incident is an issue whose type or label says incident / инцидент / postmortem / outage |
| PRs authored, reviews of others' PRs | GitHub (the shared token, the configured repositories, ≤ 3), the login on the «Команда» card | `GET /search/issues` `repo:… type:pr author:… created:>=…` and `reviewed-by:… -author:… updated:>=…` |
| meeting tasks and decisions | Petya's meeting summaries of the period (company memory) | tasks whose `who` is the person, decisions naming them |
| 1:1 notes and agreed follow-ups | «Встречи 1:1» records (`docs/foundations/people.md`) | their follow-ups (done / open / overdue) and the notes of the period |

The draft (`draft.cjs`) has three sections — Результаты, Код и ревью, Работа с командой. The local model words points
that must cite fact numbers; code drops a point that cites nothing or a fact of another section, a number none of its
facts contains, or a capitalised name that is neither the person's nor in its facts. Sections left empty are counted
from the facts by rules; without a model the whole draft is. Coverage gaps are listed as they are («нет данных о
задачах Jira: в карточке «Команды» нет аккаунта Jira», «нет данных об инцидентах: … мониторинг не хранит, кто их
разбирал»); with nothing connected and no facts the answer is a question, never an invented review.

The card: monthly bars stacked by kind, the draft with fact chips (pressing one opens and marks the fact), the gaps, the
facts by kind with links, «Скопировать черновик» and «Сохранить в Google Docs» (`document-export`, Markdown with the
facts and gaps).

## Privacy

Nothing is stored and nothing is sent. 1:1 notes are read only in a turn where the user asked about this person in this
chat and reach only that turn's local model; reply texts carry counts. No dashboard widget (personal data repeated
by itself).

## Phrases and near-misses

Not ours: «сделай код-ревью», «ревью кода», «ревью PR #42», «какие PR ждут моего ревью» (Код-ревью, Pull requests),
«отзывы в App Store», «подготовь 1:1 с Олегом», «что такое перформанс-ревью»; «ревью Пети за полгода» when Петя is not
in «Команда».

## Tests

`node tests/perf-review.cjs` — routing, people questions, facts from stubbed Jira, GitHub search, meeting summaries and
1:1 records, rules and checked model drafts, gaps, a failing Jira kept apart, nothing connected. UI:
`tests/perf-review-ui.cjs` (screenshot `petya-perf-review.png`).

Needs a live check: GitHub search qualifiers `reviewed-by:` on private repositories with a fine-grained token (search
needs `Pull requests: read`), Jira `resolved` on sites with custom workflows, incident labels as teams really use them.
