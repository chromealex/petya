# Search everywhere («Поиск по всему»)

Category: docs. Directory: `src/extensions/search-all/`. No settings, no connection of its own: it searches what
Petya is already connected to.

One question searches every source in parallel, each with its own time limit (8 s remote, 4.5 s files), so a slow or
failing source marks itself on the card and the rest is shown.

## Search sources (`search-source`)

The memory is read first; every other source is a **search source** in one registry,
`src/extensions/search-all/registry.cjs` (kind `search-source` in `REGISTRIES` of `src/features/app-links.cjs`).
Apps declare theirs in `extension.json`:

```json
"provides": { "search-source": "search-source.cjs" }
```

```js
module.exports={
  id: 'google-drive', label: 'Google Диск',   // the card row
  order: 35,                                  // card position (lower first, default 1000)
  icon: 'drive', color: '#a8d5b0',            // card look: chat|doc|task|mail|meet|file|book|note|drive
  in: 'в Google Диске',                       // «Ответь по найденному в Google Диске» from the card's tab
  names: /гугл диск…/iu,                      // how a follow-up names it
  parts: [{id, label}],                       // optional: one request, several rows (Confluence + Notion)
  ready: (settings, services) => bool | [part ids],  // connected now
  off: 'Google Диск не подключён.',           // or {partId: text}
  timeout: 'remote' | 'files',                // 8 s / 4.5 s
  async search(services, {topic, terms, own, words}) { return {items, note?, state?: 'off'|'limited', link?}; }
};
```

A source counts only while its app is added (`extension_<id>` is `'true'`; for core service modules — Slack, Jira,
Confluence — the module is not switched off), so a removed app has no row at all; an added app that is not connected
shows an «не подключено» chip with its `off` text. A row the memory also fills (Slack, Jira, Confluence, Notion, mail)
stays «частично» when its service fails. A broken source of an installed extension is reported and skipped; a broken
bundled one is a bug. The app's own sources (mail, files, the messenger bridge) are passed to the same registry as
`core` and read through `deps` (tests stub them there); a core source may export `each(services)` to expand into
several (one per messenger).

| Source | Declared by | Reads |
| --- | --- | --- |
| Stored context (`s.memory`, not a registry source) | core | Slack threads (per message, with message permalinks), Telegram chats, mail, Jira/Confluence/Notion items the user saved, recorded meeting speech (sound and microphone, with speaker), other materials. A cheap stem pattern filters first. |
| `slack` | Slack (`src/extensions/slack/search-source.cjs`) | `search.messages` with the connected token. Only tokens allowed to search (a user token with `search:read`) can; `not_allowed_token_type`/`missing_scope` → «частично: искал в сохранённой переписке». The same message from both is one result. |
| `docs` → rows `confluence`, `notion` | «Документы» (`src/extensions/docs/search-source.cjs`) | The shared docs search (`s.workspace.searchDocs`), one request for both rows. |
| `google-drive` | «Google Диск» (`src/extensions/google-drive/search-source.cjs`) | `files.list` by name and full text through the app's service (`s.googleDrive.search`, folders skipped); Drive returns no snippets, so up to three Google Docs found by their text alone are read (`documents.get`, the app's cache) for ranking and the snippet; documents found by meaning when the Drive collection of the local index is on. |
| `jira` | Jira (`src/extensions/jira/search-source.cjs`) | `POST /rest/api/3/search/jql`, `text ~ "…"` (Russian words with a trailing wildcard), the projects chosen in Jira settings. |
| `mail` | core | Gmail `messages.list?q={words} newer_than:2y` for each Google account (through the existing `mailAccounts.search` client), Outlook `GET /me/messages?$search="a OR b"` through the existing Outlook client. |
| `files` | core | A breadth-first walk of the chat project's folders: text extensions only, skips `node_modules`, `.git`, `Library`, `Temp`, build/vendor folders, files over 512 KB and binary files; at most 4000 files, 40 MB, 60 matches and ~3.5 s; the card says when a limit stopped it. «Показать в папке» (ipc `reveal`, only inside the project's folders). When «Поиск файлов по смыслу» has its local index on, the files it finds by meaning in the same folders come first («… · по смыслу», `sources.indexedFiles`, see `docs/foundations/semantic-index.md`). |
| `glossary` | «Глоссарий» (`src/extensions/glossary/search-source.cjs`) | Accepted terms of the project's glossary (`<company>/extensions/glossary/glossary.json`). |
| messengers | core bridge over `messenger-source` | Every ready messenger source that has `search` and does not read Petya's memory (Mattermost, VK Teams; [docs/foundations/messengers.md](../foundations/messengers.md)), with the user's words, each under its own name and time limit; a failing messenger marks only itself. Slack and Telegram sources are memory-only and already covered above. |

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
Nothing connected at all (no stored context and no ready search source) → a question saying what to connect.

## Card
Header with the query and the result count; a spread bar of where results came from; source tabs with counts («Все»,
Slack, Confluence, …) that filter the rows; rows with a generic source icon, title (link), who/where, relative time,
snippet with highlights; «Показать в папке» for files; chips for sources that are off, failed, timed out or partial
(the reason as a tooltip); «Искал ещё: …» and «порядок уточнён по смыслу (model)»; «Ответить по найденному», «Искать
другое».

## Verified
With stubs only: `node tests/search-all.cjs` (stubbed memory, Slack API allowed and not allowed, docs, Jira, Gmail,
Outlook, a real temp project folder, glossary file, a hanging and a failing source, an embedding model, model answers
with invalid citations; the declared search sources, Google Drive not added / not connected / connected / failing,
a follow-up naming Drive, switched-off apps losing their rows), `node tests/messenger-sources.cjs` (the messenger
bridge). UI: `tests/search-all-ui.cjs` (screenshots `petya-search-all.png`,
`petya-search-all-answer.png`). Not verified live: Slack `search.messages` with a real user token, Outlook `$search`
with Cyrillic, Gmail query relevance, Jira `text ~` on Cyrillic, real embedding models.
