# Wiki from discussions («Вики из обсуждений»)

Category: docs. Directory: `src/extensions/wiki-author/`. No settings card and no connection of its own: it reads the
messengers and meeting summaries Petya already has and publishes through the connections Petya already has
(Confluence through the shared Atlassian connection and its space, Notion through the Notion connection, Google Docs
through «Google Диск»). Uses `document-export`.

## Phrases

Own: «оформи в вики итоги треда про матчмейкинг», «перенеси в Confluence итоги встречи про релиз 2.3», «задокументируй
в Notion обсуждение про оплату в Китае», «сделай вики-страницу из треда https://…», «запиши в базу знаний итоги
обсуждения про лиги, ответственный — Маша», «оформи в гугл док итоги созвона про бюджет».

Not triggered: «запиши решение: …», «оформи ADR про …» («Архитектурные решения»), «найди в Confluence про …»
(«Документы»), «что в вики про …», «сводка встречи», «отправь в слак итоги», «оформи итоги треда про …» (no wiki
named), «опиши систему лиг в GDD» («Геймдизайн-документ»), «сохрани это в Google Docs» («Google Диск»), «/wiki-author …».

## The discussion

- **A thread** through the `messenger-source` registry ([messengers.md](../foundations/messengers.md)): a pasted
  message link (Slack `…/archives/C…/p…` or `thread_ts`, a Mattermost permalink `/pl/<id>`, Telegram `t.me/c/…`) is
  tried with each ready source's `thread`; otherwise `searchAll` (31 days, Petya's memory sources included) with the
  topic's words, messages grouped by thread and ranked by how many share a concept with the topic. Two equally good
  threads are a strict-choice question. The chosen thread is read whole (`thread`, root first).
- **A meeting** («итоги встречи / созвона про …»): the best-matching meeting summary of the last 120 days; its discussed
  points, decisions and tasks stand in for messages (no links).

## An existing page first

Before drafting it searches the documentation sources of «Поиск по всему» (`search-source` registry: the sources with
the `doc` or `drive` look — Confluence and Notion through «Документы», Google Docs through «Google Диск», which also
merges the Drive collection of the semantic index) and, when it is on, the `google-drive` collection of the semantic
index directly (score ≥ 0.45). Pages whose title shares a concept with the topic are offered: «Про «матчмейкинг» уже
есть страница: «Матчмейкинг» (Confluence). Обновить её вместо новой?» with «Обновить «…»» and «Создать новую
страницу». An update reads the page (Confluence storage, Notion blocks, Google Doc text) and the card shows the diff.

## The draft

Markdown: the title, «Ответственный», «Контекст» (the root message or the model's summary), «Итоги» (messages that
say «решили / договорились / итог / делаем / будем …», not questions; or the meeting's decisions), «Открытые
вопросы», «Цитаты» (verbatim first sentences of different authors, each with a link to its message), «Источник»
(where, link, dates, participants). Every point carries its message number and link.

With a local model: the model writes title, summary, outcomes, open questions and quotes from the numbered messages;
a point naming a message that does not exist is dropped, and a quote is kept only when it is a verbatim part of the
message it names (`messenger-sources.verbatim`). Without the model the draft is built by rules.

**Owner** from «Команда» (`s.people`, [people.md](../foundations/people.md)): a person named in the request
(«ответственный — Маша»), else the author of the latest outcome, else the most active author — the first who is in
«Команда». Nobody → «уточнить — нет в «Команде»».

## Publishing (only on the card's button, IPC `publish`, `publish.cjs`)

- **Confluence** (Cloud REST v2), new: `GET /wiki/api/v2/spaces?keys=<space>` → `POST /wiki/api/v2/pages
  {spaceId, status:'current', title, body:{representation:'storage'}}`; update: `GET /wiki/api/v2/pages/{id}` — the
  version must be the draft's — then `PUT /wiki/api/v2/pages/{id}` with the next version (the page body is replaced by
  the draft the user saw as a diff).
- **Notion** (API version 2025-09-03), new: `POST /v1/pages {parent:{page_id}, properties:{title}, children}` under a
  parent page link typed on the card (the integration must have access to it), more than 100 blocks with
  `PATCH /v1/blocks/{id}/children`; update: the draft is appended as «Обновление от <date>» (`PATCH
  /v1/blocks/{id}/children`) — Notion has no API to replace a page's content.
- **Google Docs**, new: the `document-export` link («Сохранить в Google Документы» → «Google Диск» previews and creates
  the document); update: appended as «Обновление от <date>» with `documents.batchUpdate` and
  `writeControl.requiredRevisionId` (needs the Docs write scope).

Once per draft; a request without an answer is reported as «результат неизвестен».

## Verified

Unit (`node tests/wiki-author.cjs`) over fake HTTP servers (a messenger with search and threads behind the
`messenger-source` registry, Confluence REST v2, the Notion API): routing, not added, no messenger, a thread by topic
with a tie asked, by link, an unknown permalink, the owner (named, outcome author, nobody), the existing Confluence page
offered and updated with the diff and the version guard, a new page in the space, the model's draft with invented
points and quotes dropped, a meeting as the source and a Notion page under a parent. UI (`tests/wiki-author-ui.cjs`,
screenshots `$TMPDIR/petya-wiki-author.png`, `-2.png`, `petya-wiki-author-update.png`).

Needs live checking: Slack and Telegram threads come from Petya's synced memory only (what is not synced is not seen);
Mattermost permalinks against a real server; Confluence storage of the converted page (quotes, links); the Notion
parent page access and block limits on long threads; Google Docs append with the Docs write scope; ranking of
existing pages with real Confluence/Notion search.
