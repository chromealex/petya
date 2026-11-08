# Search everywhere («Поиск по всему»)

Category: docs. Directory: `src/extensions/search-all/`. No settings, no connection of its own: it searches what
Petya is already connected to.

One question searches every source in parallel, each with its own time limit (8 s remote, 4.5 s files), so a slow or
failing source marks itself on the card and the rest is shown.

## Sources (read-only)
- **Stored context** (`s.memory`): Slack threads (per message, with message permalinks), Telegram chats, mail,
  Jira/Confluence/Notion items the user saved, recorded meeting speech (sound and microphone, with speaker), other
  materials. A cheap stem pattern filters first.
- **Slack search** — `search.messages` with the connected token (OAuth credential or token through `s.request`).
  Only tokens allowed to search (a user token with `search:read`) can; `not_allowed_token_type`/`missing_scope` →
  the card says «частично: искал в сохранённой переписке». The same message from both is one result.
- **Confluence / Notion** — the shared docs search (`s.workspace.searchDocs`, the «Документы» path).
- **Jira** — `POST /rest/api/3/search/jql`, `text ~ "…"` (Russian words with a trailing wildcard), the projects
  chosen in Jira settings.
- **Mail** — Gmail `messages.list?q={words} newer_than:2y` for each Google account (through the existing
  `mailAccounts.search` client), Outlook `GET /me/messages?$search="a OR b"` through the existing Outlook client.
- **Project files** — a breadth-first walk of the chat project's folders: text extensions only, skips
  `node_modules`, `.git`, `Library`, `Temp`, build/vendor folders, files over 512 KB and binary files; at most 4000
  files, 40 MB, 60 matches and ~3.5 s; the card says when a limit stopped it. «Показать в папке» (ipc `reveal`,
  only inside the project's folders).
- **Glossary** — accepted terms of the project's glossary (`<company>/extensions/glossary/glossary.json`).

## Ranking
`query.cjs` strips the trigger («найди везде», «поиск по всему», «где обсуждали …», «про/насчёт»), keeps numbers like
«2.3», and stems words with a light Russian/English suffix stripper (оплату/оплата/оплаты → «оплат»; Китае/Китай/Китая
→ «кита»), plus up to 6 extra words from the local model (synonyms, English names; weight 0.6, 6 s limit, optional).
`rank.cjs`: BM25 (k1 1.2, b 0.75; title words count twice) over all collected items, × (0.4 + 0.6 × share of the
user's words covered) × recency (+50% today, decaying over ~a month). At most two results per thread or meeting, 60
in all. Snippets are the densest window of matches with highlight offsets (no HTML).
**Embeddings (optional)**: when an embedding model is already installed in Ollama (`/api/tags` name matching
nomic-embed, mxbai-embed, bge, e5, minilm, arctic, …), the top 30 are embedded with `/api/embed` and re-ordered by
65% BM25 + 35% cosine. Nothing is downloaded.

## «Ответь по найденному»
Uses the last search card in the chat (persisted in the message, so it works after a restart), optionally only the
sources named («… в Slack»; the card's open tab sends that). The model gets up to 12 numbered excerpts and must cite
them as [n]. Code removes citations to numbers that do not exist; an answer with no valid citation (or `found:false`)
is reported as «В найденном нет прямого ответа». The answer card lists the cited items with links.

## Phrases
Own: «найди везде про матчмейкинг», «где обсуждали оплату в Китае», «поиск по всему: лиги», «поищи везде насчёт релиза
2.3», «где мы говорили о бонусах за рефералов», «ответь по найденному», «подытожь результаты поиска».
Near-misses (null, no offer): «найди файл config.json», «найди везде файл …» (files), «найди в интернете …» (web
search), «найди в таблице …» (Google Sheets), «найди человека …», «кто знает про …» (who-knows), «найди в Confluence
про …» (docs), «что обсуждали на встрече» (meetings), «найди задачу про оплату» (jira).
Nothing connected at all (no stored context, services or project folder) → a question saying what to connect.

## Card
Header with the query and the result count; a spread bar of where results came from; source tabs with counts («Все»,
Slack, Confluence, …) that filter the rows; rows with a generic source icon, title (link), who/where, relative time,
snippet with highlights; «Показать в папке» for files; chips for sources that are off, failed, timed out or partial
(the reason as a tooltip); «Искал ещё: …» and «порядок уточнён по смыслу (model)»; «Ответить по найденному», «Искать
другое».

## Verified
With stubs only: `node tests/search-all.cjs` (stubbed memory, Slack API allowed and not allowed, docs, Jira, Gmail,
Outlook, a real temp project folder, glossary file, a hanging and a failing source, an embedding model, model answers
with invalid citations). UI: `tests/search-all-ui.cjs` (screenshots `petya-search-all.png`,
`petya-search-all-answer.png`). Not verified live: Slack `search.messages` with a real user token, Outlook `$search`
with Cyrillic, Gmail query relevance, Jira `text ~` on Cyrillic, real embedding models.
