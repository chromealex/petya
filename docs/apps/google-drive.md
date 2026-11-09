# Google Drive («Google Диск»)

Category: docs. Directory: `src/extensions/google-drive/`. Connects: Google (shared connection
`src/google-workspace.cjs`, see [google-sheets.md](google-sheets.md#shared-google-connection-for-other-google-apps-srcgoogle-workspacecjs)).
Provides the cross-app kind `document-export` and the index collection `google-drive`.

## What it does

- **Find files** «найди в гугл диске план релиза», «найди презентацию про Китай в гугл диске», «гугл доки про
  онбординг»: one `files.list` with `q` = every name word as a prefix (`name contains`, Russian words cut to their
  stem: «Китае» → `кита`) **or** the words in the full text (`fullText contains`), plus a kind filter from the words
  (документ / таблица / презентация / PDF / папка; «гугл доки» means documents), never trashed files, folders only
  when asked. A title in quotes searches that name. Up to 25 files, My Drive and shared drives. When the user turned
  the Drive collection on (below), up to 5 documents found by meaning in the local index are added, marked
  «по смыслу» with their best piece.
- **Recent files** «последние файлы в Google Drive», «что нового в гугл диске», «открой гугл диск»: 20 newest by
  `modifiedTime`, optionally of one kind.
- **Read a Google Doc**: a pasted `docs.google.com/document/d/…` link (or a Drive link to a Doc, or «прочитай гугл док
  «План релиза»» — by title, a clarification with the titles when several match) → `documents.get`
  (`includeTabsContent=true`, every tab) + `files.get` (owner, modified). The card shows the outline (headings with
  each section's word count as a bar) and the opening lines; the reply lists the top sections.
- **Answer questions about it** — «<link> когда бета-тест?», or a follow-up while a document is open in this chat:
  «по документу: кто релиз-менеджер?», «в документе: …», «что сказано про заморозку». The document is split into
  numbered passages (paragraphs, list items, table rows as «Столбец: значение») with their heading trail; code picks
  the passages that share word stems with the question (all of them when the document is under 14 000 characters);
  the local model answers with word-for-word quotes and passage numbers; **every quote is checked against the text**
  (whitespace and quote marks normalized, «…» allowed between parts, the passage number may be wrong). An answer
  without a checked quote is not shown as an answer: the card shows the closest places instead («точного ответа
  нет»); found=false → «не нашёл»; without a model the matching places are shown.
- **Slides, Drive files, folders** by link: a file card (kind, owner, time) with «Открыть» (the chat's browser).
- **Spreadsheets go to «Google Таблицы»**: a Sheets link returns `null` here, so the Sheets app (or its offer) takes
  it; in a file list a spreadsheet's «Открыть в чате» sends its link to the chat.
- **Save Petya's answer as a new Google Doc** «сохрани это в Google Docs», «запиши это в гугл доки», «создай гугл док
  из этого ответа»: the last Petya answer in this chat (not a Drive card) becomes a confirmation card — editable
  title (first heading or first sentence), a preview of headings, lists and tables, size, where it will go. Only
  «Создать документ» writes: one multipart `files.create` upload of HTML that Drive converts to a Google Doc
  (headings, lists, tables, code stay; all text escaped, only http(s) links). Once per card (`done` is kept in the
  chat message); a write with no answer from Google is marked unknown and never repeated blindly; the notification
  center shows «Создаю…/создан/ошибка» (`google-drive-save`). Writing off → the button answers with «Открыть
  настройки».
- **`document-export`** (cross-app kind): another card hands `{title, text (Markdown), app?}`; the provider keeps it
  in memory for 2 h and sends «Сохрани в Google Документы «…» · #id» to the chat; the same confirmation card follows.
  No card uses it yet; good candidates: «Поиск по всему» answers, meeting summaries, patch notes, standups.
- **Dashboard**: recent files and searches are read-only (`dashboard.accepts`); widget «Недавние файлы Google Диска».
- **Service for other apps** `services.googleDrive`: `ready()`, `who()`, `parseLink`, `search(text, {kind, size})`,
  `document(id)` (outline blocks and text).

Phrases: «найди в гугл диске …», «найди презентацию про … в Google Drive», «последние файлы в гугл диске», «что
нового в гугл диске», «открой гугл диск», a Docs / Slides / Drive link (with or without a question), «прочитай гугл
док «…»», «что в гугл доке «…» про …?», «по документу: …» (with a document open in the chat), «сохрани это в Google
Docs». Near-misses (null, tested): a spreadsheet link or «гугл таблица» (Sheets), «чем забит диск» / «сколько места
на диске» (disk usage), «найди скрипт сохранения», «документы про монетизацию», «найди документ про онбординг» (file
search — no Google name), «найди везде про релиз» (search everything), Google Calendar / Play / Meet / Sheets / Mail
/ Cloud by name, «что такое гугл диск», «сохрани файл на диск», «по документу: …» with no document open in the chat.
The offer fires on the name (Google Drive / гугл диск / Google Docs / гугл доки / гугл документ) or a Docs, Slides or
Drive link. «Grafana»'s offer no longer takes Google links for dashboard links (same `/d/<id>/` shape).

## Setup and what to enable in Google Cloud

Settings («Настройки → Google Диск»): the sign-in path, the account, «Разрешить создавать документы», «Индексировать
Google Документы для поиска по смыслу».

- **Google account** (default, `googleDriveAuth=account`): the OAuth Desktop client already imported for Gmail. Enable
  **Google Drive API** and **Google Docs API** in its Google Cloud project. On the OAuth consent screen add
  `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/documents.readonly` and, for
  creating documents, `https://www.googleapis.com/auth/drive.file`. «Разрешить чтение Диска» asks for both read
  scopes at once (incremental consent, Gmail/Calendar/Sheets scopes are kept); `drive.file` is asked only after
  «Разрешить создавать документы» is on — it reaches only files Petya created, never the rest of the Drive. Both read
  scopes are restricted/sensitive: an app outside Testing needs Google's verification.
- **Service account** (`googleDriveAuth=service`): enable both APIs in its project, load the JSON key (secret
  `googleDriveCredential`; the address is shown with «Скопировать адрес»), share files or folders with it as Viewer.
  It cannot create documents the user would see, so saving is refused with that explanation.

## Search by meaning (index collection)

`collection.cjs` declares `"index-collection"` `google-drive` (`docs/foundations/semantic-index.md`): `list` pages
through Google Docs (`mimeType = document`, newest first, ≤ 500, version = `modifiedTime`), `read` is `documents.get`
→ Markdown with `#` headings (chunked by section), meta `{title, url, owner, modified}`. Off by default: the switch in
«Google Диск» settings calls `semanticIndex.enable`; the model download and the background sync are the index's own
(notification `semantic-index`). Refresh every 60 min. «Стереть индекс Google Документов» (red trash button, asks
first) calls `semanticIndex.wipe('google-drive')`, which deletes its vectors and texts and switches it off; «Стереть
индекс» in «Поиск файлов по смыслу» wipes it too.

«Поиск по всему» has no source registry (its sources are fixed functions in `src/extensions/search-all/sources.cjs`),
so Drive is not one of its sources yet. When it gets one (e.g. a `search-source` kind in `app-links.cjs`), the Drive
source is `services.googleDrive.search(question)` plus `semanticIndex.search('google-drive', …)`.

## Endpoints

- `GET https://www.googleapis.com/drive/v3/files` — `q`, `fields=nextPageToken,files(id,name,mimeType,modifiedTime,
  webViewLink,size,shortcutDetails,owners,lastModifyingUser,driveId)`, `corpora=allDrives`,
  `includeItemsFromAllDrives=true`, `supportsAllDrives=true`, `orderBy=modifiedTime desc` only without `fullText`
  (Drive refuses sorting full-text queries). Shortcuts resolve to their target.
- `GET https://www.googleapis.com/drive/v3/files/{id}` — metadata of one file.
- `GET https://docs.googleapis.com/v1/documents/{id}?includeTabsContent=true` — paragraphs (`namedStyleType`
  TITLE/SUBTITLE/HEADING_1–6), bullets with nesting, tables, child tabs. Parsed by `ws.docText` in
  `src/google-workspace.cjs` (outline blocks with heading trails and Markdown text, capped at 400 000 characters).
- `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` — metadata
  `{name, mimeType:'application/vnd.google-apps.document'}` + `text/html` body.

Errors are told in the user's words (`client.explain`): 401 sign-in, 403 API disabled (names Drive or Docs API) /
missing scope / no access / rate, 404, 400 bad query / not a Google document, 429.

## Verified

Unit (`node tests/google-drive.cjs`) against a local fake Drive + Docs API and token endpoint
(`tests/fake-google-drive.cjs`, which evaluates the `q` language and refuses `orderBy` with `fullText`): link and kind
parsing, the Docs outline (tabs, headings, bullets, tables), passages and quote checking, Markdown → HTML escaping,
routing and near-misses, offer, not added → null, not connected → question with no request, consent scopes (both read
scopes together, `drive.file` alone), recent and search queries, merging index hits, the outline card, answers with
a model (checked quote kept, invented one dropped, invented-only → places, not found), without a model, follow-ups
only with an open document, by title with a clarification, Slides/Drive links, Sheets links → null, saving only on
the card action (writing off → settings, scope missing → settings, once, unknown outcome not repeated, empty chat →
question), `document-export` through the registry (once), the index collection and its switch, service-account token
for both scopes and refusal to create, 403/404 messages. UI (`tests/google-drive-ui.cjs`): screenshots
`petya-google-drive.png` (file list), `petya-google-drive-doc.png` (outline + answer), `petya-google-drive-save.png`
in the temp folder; one `save` call with the edited title.

Needs live checking with real credentials: the consent screen with Drive + Docs scopes on the shared Desktop client
(and verification outside Testing), `corpora=allDrives` on accounts without shared drives and on Workspace domains,
`fullText` matching of Russian word forms (Drive's own stemming), `name contains` prefix behaviour on real titles,
`includeTabsContent` on multi-tab documents, HTML → Google Doc conversion of tables and code blocks, the quality of
answers and quotes with the local model on long documents, and the index sync on a large Drive (rate limits).
