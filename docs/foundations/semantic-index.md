# Semantic index (foundation)

A local index that lets Petya and its apps find things by meaning: files, chats, meeting transcripts, anything an app
declares. Everything stays on the computer: embeddings come from a local Ollama model, the store lives in the
company's data folder, every collection is opt-in, can be paused and wiped.

Code: `src/semantic-index/` (store, chunkers, ignore rules, embedder, queue, Petya's own collections) and the feature
`src/features/semantic-index.cjs` (service `s.semanticIndex`, IPC `semanticIndex`). First consumer: the app
«Поиск файлов по смыслу» (`src/extensions/file-search`, `docs/apps/file-search.md`).

## Model

| Model (Ollama tag) | Download | Dimensions stored | Notes |
| --- | --- | --- | --- |
| `qwen3-embedding:0.6b` (default) | 639 MB (Q8_0, as listed by the Ollama registry, 596M parameters, 32K context) | 512 of 1024 | Multilingual (100+ languages, Russian included), Matryoshka-trained, so the first 512 dimensions are kept and renormalized. Queries get the retrieval instruction `Instruct: … Query: …`, documents are embedded as is. |
| `bge-m3:567m` | ≈1.2 GB | 1024 | Alternative for an Ollama that cannot run qwen3-embedding; setting `semanticIndexModel`. |

The model is never downloaded by adding an app. It is pulled when the user turns a collection on (settings switch or
the app card's «Скачать модель и включить»), or presses «Скачать модель». The download reuses the chat model's stages
(`src/semantic-index/embedder.cjs` → `prepare`): start Ollama through Petya's installer when it is not running, check
free space against the registry manifest (`checkModelSpace`), `POST /api/pull` with streamed progress, then one test
embedding. Progress goes to the notification center as `semantic-index-model` (cancellable). Changing the model makes
every collection start empty (vectors of different models are not comparable); the owner refills it.

Embedding calls: `POST /api/embed {model, input:[…], truncate:true, keep_alive:'5m', options:{num_thread:cores/2}}` in
batches of 16. Only the local Ollama URL from Petya's settings is used; nothing is sent elsewhere.

## Store

Per company, `<company data>/semantic-index/<collection>/` (`<userData>` for the default company, `<userData>/companies/<id>` for others), no native dependencies (Petya ships no SQLite):

- `meta.json` — `{format, model, dim, gen}`, written last and atomically.
- `vectors.<gen>.f32` — unit-length Float32 rows; `sketch.<gen>.bin` — sign bits of every row (the prefilter);
  `texts.<gen>.bin` — UTF-8 chunk texts read only for hits; `log.<gen>.ndjson` — item records, replayed on open.
- Writes append in the order vectors → sketch → texts → log, so a crash leaves only unreferenced bytes. On open a torn
  vector row is cut off, broken or dangling log records are dropped, a short sketch is rebuilt, unreadable meta or another
  model starts the collection empty (`stats().recovered` says why). Dead rows (removed/replaced items) are compacted into
  the next generation once they exceed 30% (and 1000 rows); meta switches generations last.
- Search: metadata prefilter (`filter`), then brute force. Up to 20 000 rows every row is scored exactly (vectors cached in
  memory); above that the Hamming distance on the sign sketch picks `max(400, 40·k)` candidates, which are rescored by
  exact cosine from the vector file.

Limits (measured on this machine, 512 dims, Node 22): 200 000 chunks ≈ 490 MB on disk, open 0.1 s, ~195 MB RSS,
search 25–35 ms (random vectors, worst case for the sketch). Caps per collection: 20 000 items, 200 000 chunks,
400 chunks per item; beyond 200k chunks a collection stops with a clear error — split it or exclude folders.

## Chunking (`src/semantic-index/chunk.cjs`)

- `code` — top-level declarations (JS/TS, C#, Java/Kotlin, Swift, Go, Rust, Python, Lua, C++, SQL…) with their leading
  comments, small ones merged up to ~1200 characters, long ones in line windows with overlap; `loc.line`.
- `markdown` — sections under headings, `loc.heading` is the path «A › B»; long sections split by paragraphs; code fences
  are not headings.
- `chat` — `messages:[{who,text,at}]` in windows of 6 messages overlapping by 2; `loc.from/to` message indexes.
- `text` — paragraphs packed to ~1200 characters; `[Страница N]`, `[Слайд N]`, `[Лист N]` markers keep pages, slides and
  sheets apart (`loc.page/slide/sheet`). PDFs come from Petya's `pdf-reader.cjs`.
- Ready-made `chunks:[string|{text,loc}]` are taken as they are.

Before chunking, credential-shaped text (private keys, AWS/GitHub/Slack/OpenAI/Google keys, JWTs, `password=…`) is
replaced with «[скрыто]» (`ignore.redact`). The item's `title` is prepended to every piece for embedding.

## Ignore rules (`src/semantic-index/ignore.cjs`)

For collections that walk folders: `Ignorer(root)` applies built-in folder names (VCS, `node_modules`, `vendor`, `Pods`,
`Library`, `Temp`, `obj`, `build`/`Build(s)`, `dist`, `out`, `target`, `DerivedData`, `.gradle`, IDE folders, caches…),
secret file names (`.env*` except `.example/.sample/.template`, keys and certificates, keystores, provisioning,
`id_rsa*`, `.netrc/.npmrc`, `credentials*`, `secrets*`, service-account JSON, `google-services.json`,
`GoogleService-Info.plist`) and every `.gitignore` from the root down (negation, folder-only, anchored, `**`).
`isBinary` (NUL in the first 8 KB) filters binaries.

## Contract for apps

Declare a collection in `extension.json`:

```json
"provides": { "index-collection": "collection.cjs" }
```

`collection.cjs` exports:

```js
{
  id: 'files',                 // default: the extension id; unique across Petya
  name: 'Файлы',
  description: '…',
  collects: 'What exactly is read — shown next to the opt-in switch',   // required
  type: 'text',                // default chunker: 'code' | 'markdown' | 'text' | 'chat'
  refresh: 30,                 // minutes between background syncs; 0 = only on request
  ready(settings) { return true },                        // e.g. folders chosen; «app added» is checked for you
  async list(services, {signal, gate}) { return [{id, version, meta}] },   // automatic collections
  async read(services, entry, {signal}) { return {text | messages | chunks, type?, title?, meta?} | null }
}
```

`list` must be cheap (ids and versions such as `mtime:size`); `read` is called only for new or changed versions.
An unchanged content hash only records the new version, without embedding again. Items that disappear from `list` are
removed. Call `await gate()` in long loops: it yields, and it waits while the index is paused. `meta` is kept with the
item (≤ 2 KB of strings/numbers/booleans: `path`, `title`, `type`, `mtime`, …) and returned with hits.

A collection without `list/read` is filled by its app:

```js
await s.semanticIndex.add('notes', [{id, version?, text|messages|chunks, type?, title?, meta?}]); // resolves when indexed
await s.semanticIndex.remove('notes', ['id1']);
```

Search (main process):

```js
const r = await s.semanticIndex.search('files' | ['chats','meetings'] | '*', 'query', {k: 8, filter, perItem: 1, minScore: 0});
// r = {hits: [{collection, id, score, cosine, chunk, text, loc, meta, version, ranges}], ready, collections, off, status, error?, code?}
```

- Only enabled collections are searched (`off` lists the asked ones that are off). With nothing enabled the call returns
  at once without touching the model.
- `filter`: `{type|types, pathPrefix, ids, meta:{key:value}}` or `(meta, id) => bool` — applied before scoring.
- `hits` are the best piece per item (`perItem`), sorted by `score` = cosine + a small lexical bonus (≤ 0.06 for query
  words found in the piece, title or path); `ranges` are `[start, end)` of query words in `text` for highlighting.
- `ready:false` with `code:'model'` (model not downloaded) or `'ollama'` (Ollama not running) is a state to show, not an
  exception.

Other calls: `sync(id)`, `collections()` (with `enabled`, `items`, `chunks`, `bytes`, `lastSync`, `error`),
`enable(id, on)` (the user's opt-in; starts the model download or the first sync), `status()`, `prepareModel()`,
`cancelModel()`, `pause()`, `resume()`, `wipe(id?)`.

Renderer IPC `window.petya.feature('semanticIndex', …)`: `collections`, `status`, `enable`, `sync`, `prepareModel`,
`cancelModel`, `pause`, `resume`, `wipe`, `progress` (notification snapshots to restore after a reload).

## Background work and notifications

One queue per company: jobs run one at a time, yield between items and between embedding batches (20 ms pause), keep
Ollama to half of the cores, and wait while the computer is on battery or the index is paused (`semanticIndexPaused`
survives restarts). Automatic collections sync 20 s after start and then every `refresh` minutes; a no-op refresh shows
nothing. Real work shows one card `semantic-index` with «N из M» and the current file, updated in place
(`Пауза`/`Продолжить` actions are attached by the file-search renderer script; the card shows without them too), then
«готово». A stopped Ollama is waited out quietly; other errors are reported once. Switching company closes the queue
(before-quit hook of the company lifecycle).

## Privacy

- Off by default, per collection (`semanticIndexCollections`, JSON `{id:true}`); the switch shows `collects`.
- Everything stays in the company's data folder; nothing is uploaded. Secrets are skipped by name and redacted by content.
- «Стереть индекс» deletes all vectors and texts (or one collection's) and switches the collections off; the files
  themselves are not touched. Turning a collection off keeps its data until it is wiped (so turning it back on is fast).

## Petya's own collections (off by default)

`src/semantic-index/collections.cjs`: `chats` (texts of user and Petya messages of every chat of the company, no
attachments, refresh 15 min) and `meetings` (transcripts of recorded meetings — speech and microphone, not summaries
or letters, refresh 30 min). Their switches are in the «Поиск файлов по смыслу» settings under «Другие коллекции».

How to use them:

- **«Поиск по всему»** (`src/extensions/search-all`) already uses the index for files: its `files` source also asks
  `sources.indexedFiles(s, question)` — `s.semanticIndex.search('files', question, {k:10, filter:{pathPrefix: chat
  project folders}})` — and puts those files (meta «… · по смыслу», the index's best piece as text) before the word
  matches; a file found both ways is kept once. With no index, the collection off or the model missing it returns
  nothing and the word search answers alone. Its optional re-ranker (`embed.cjs`) also picks up `qwen3-embedding`
  once it is installed. To add chats and meetings there later: `search(['chats','meetings'], question, {k})` and map
  `chats` hits to the topic (`id` is the topic id, `loc.from/to` the message indexes) and `meetings` hits to the
  session (`id` is the meeting session id).
- **Mentor / past conversations**: `search(['chats','meetings'], question, {k:5, filter:(meta)=>meta.projectId===id})`
  and quote `text` with its chat title (`meta.title`) as the source. Not wired yet.
- Any app: check `s.semanticIndex?.enabled(id)` first; `search` answers `{hits:[]}` at once when nothing is on.

## Tests

`node tests/semantic-index.cjs` — store (add/replace/remove/touch, prefilter, sketch candidates on a 300-item
collection, compaction and generations), corruption recovery (torn log line, partial vector row, dangling record, missing
sketch, unreadable meta, model change), chunkers, ignore rules and redaction, the index contract (opt-in, incremental
sync, hash-based skip, removal, `*` search, filters, pause/resume, background tick, wipe, missing model, chunk limit),
the Ollama embedder and the model download with streamed progress (stubbed fetch), and the feature with Petya's chats
and meetings. Fake embeddings throughout; no model and no network. The real model has not been run in this
environment: ranking quality with `qwen3-embedding:0.6b` on Russian text is to be checked live.
