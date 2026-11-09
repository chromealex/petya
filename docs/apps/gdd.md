# Game design document («Геймдизайн-документ»)

Category: gamedev. Directory: `src/extensions/gdd/`. No settings card and no connection of its own: the GDD is
Markdown in the chat project's folder, or a Confluence page / Google Doc reached through the connections Petya already
has (the shared Atlassian connection, «Google Диск»). Adding the app is enough.

## Phrases

| Request | What happens |
| --- | --- |
| «опиши систему лиг в GDD», «распиши в GDD механику сундуков», «добавь в геймдизайн-документ раздел про кланы» | a draft of that section from this chat, meeting summaries, Jira epics and the configs |
| «обнови раздел экономики по текущим конфигам», «обнови раздел про магазин в GDD по конфигам» | the same, from the configs only (no chat, meetings or Jira) |
| «чего не хватает в GDD», «каких разделов нет в GDD», «какие системы не описаны в GDD» | systems found in configs and code folders that have no GDD section |
| «GDD лежит в docs/gdd.md», «наш GDD — https://…» | remembers where this project's GDD is |

Not triggered (other apps or nothing): «что поменяли в GDD за неделю» («Что изменилось в документе»), «проверь
свежесть документации» / «обнови документацию» («Свежесть документации»), «запиши решение: …», «оформи ADR про …»
(«Архитектурные решения»), «сверь баланс с конфигами» («Конфиги и баланс»), «что такое GDD», «напиши GDD», «составь
шаблон GDD», «обнови раздел экономики» (no GDD and no configs named), «оформи в вики итоги треда …» («Вики из
обсуждений»), «/gdd …» (a skill).

## Where the GDD is (`target.cjs`)

1. The binding remembered for the chat's project (`<company data>/extensions/gdd/cache.json`, «GDD лежит в …» or an
   earlier answer).
2. Markdown in the project folders (depth 5, build and vendor folders skipped) named `gdd`, `game-design…`,
   `геймдизайн…`, `диздок…` (or such a folder's file).
3. Confluence pages whose title says GDD / геймдизайн / Game Design in the connected space
   (`GET /wiki/rest/api/content/search?cql=…`), and Google Docs named GDD (`files.list` through «Google Диск»).

One candidate is used, several are a strict-choice question, none is a question asking for a path or a link (the
answer is checked and remembered). The section is the heading whose words share a concept with the topic (Russian and
English game words: «лиги» ↔ `League`, «экономика» ↔ `economy`/`price`/`cost`); otherwise a new section is appended.

## Sources (`evidence.cjs`)

- **Configs** through the reader of «Конфиги и баланс» (`src/extensions/config-balance/files.cjs`: Unity
  ScriptableObject `.asset`, JSON, CSV — each value keeps its line). A config set about the topic (its class, folder or
  file name) gives every numeric field; any other set gives only fields named like the topic (`price`, `cost` for the
  economy). Each value is a fact `file:line`. They are listed in a regenerated «Параметры из конфигов» table.
- **This chat**: the last 16 messages sharing a concept with the topic (up to 4), cited as `[чат «…»]`.
- **Meeting summaries** of the last 120 days: decisions and discussed points (up to 5), `[встреча «…»]`.
- **Jira epics**: `POST /rest/api/3/search/jql` with `issuetype = Epic AND (text ~ "…")` in the connected projects
  (up to 5), cited by the issue key.

## Every number is checked (`check` in `feature.cjs`)

The draft keeps the old section's prose, adds the source lines and the config table. Then code checks each number
(headings' numbering, list numbering, dates and the citations themselves are not claims): it is backed when a citation
of its own sentence (or one standing after the whole line) is a config fact with that value or a source whose text has
that number. An unbacked number that equals exactly one config value of something its clause names (the object's id,
name or display name, or the field) gets that `[file:line]`; any other number is marked «(уточнить)». With a local model
the model writes the prose from the numbered facts and sources and the same check runs on its text (a wrong citation is
marked too). The card's editor re-runs the check on every edit (IPC `preview`).

## The confirmation card and writing

The card shows the destination (file / Confluence / Google Doc), how many numbers are cited and how many are
«уточнить», the section's word diff against the GDD, the editable text, the config values with `file:line` and the
sources. Nothing is written by the chat turn. «Записать в GDD» (IPC `apply`) writes exactly the editor's text, once:

- **Markdown**: the file's hash must be what the draft read; only the section's lines are replaced (or the section is
  appended); symlinks are refused.
- **Confluence** (REST v2): `GET /wiki/api/v2/pages/{id}?body-format=storage` — the version must be the draft's; only
  the section's part of the storage body (from its heading to the next heading of the same or a higher level) is
  replaced with storage XHTML converted from the Markdown; `PUT /wiki/api/v2/pages/{id}` with `version.number + 1`.
- **Google Docs** (Docs API v1): `documents.get`, then `documents.batchUpdate` with
  `writeControl.requiredRevisionId` = the draft's revision: `deleteContentRange` of the section's body and
  `insertText` of the new text (table rows as «a · b» lines); a new section is inserted at the end with
  `updateParagraphStyle` `HEADING_2`. Needs the Docs write scope (`https://www.googleapis.com/auth/documents`); without it
  the card offers «Разрешить правку Google Документов» (incremental consent of the shared Google sign-in).

A request without an answer is reported as «результат неизвестен», never retried.

## Gaps

Systems: config sets (the ScriptableObject class without `Config`/`Settings`/…, JSON/CSV file names) and script
folders under `Assets/Scripts`, `Scripts`, `src`, `Source` with at least two source files (generic folders like
`Core`, `UI`, `Utils` skipped), one per stem. Each is «есть раздел» (a heading shares a concept), «только
упоминается» (a section body does) or «нет раздела». The card has a coverage bar and «Описать в GDD» per missing
system. Read-only: available to dashboards.

## Verified

Unit (`node tests/gdd.cjs`) over a fixture project (the config-balance fixture plus leagues, script folders and a
Markdown GDD) and fake HTTP servers for Jira, Confluence and Google Docs: routing and near-misses, not added, the GDD
found / asked / remembered, the rule draft with backed, auto-cited and «уточнить» numbers, the model's draft checked the
same way, configs-only updates, apply into Markdown (exact text, once, refused after a change), the Confluence section
replacement with the next version and the version guard, the Google batchUpdate with the revision guard and the error
without write permission, and the gaps. UI (`tests/gdd-ui.cjs`, screenshots `$TMPDIR/petya-gdd.png`, `-2.png`,
`petya-gdd-gaps.png`).

Needs live checking: Confluence storage of real GDD pages (macros inside a replaced section are replaced with it;
layouts and panels), Google Docs with several tabs (only the first tab is read and written), tables and lists written
to Google Docs as plain lines, the Docs write consent flow, Jira epic search with Cyrillic, real Unity configs, and the
local model's prose.
