# «Поиск файлов по смыслу» (file-search)

Finds the user's own files by what they are about, not by name: «где презентация про Китай с графиком LTV?»,
«найди скрипт, который сохраняет прогресс», «документы про монетизацию», «в каком файле считается урон?».
Category «Компьютер и файлы». Built on the semantic index foundation (`docs/foundations/semantic-index.md`): it
declares the index collection `files` (`collection.cjs`) and answers in the chat from it.

## What it reads

The company's project folders (every project's local folders, switch «Папки проектов компании», on by default) and
folders added in the app settings. Indexed: code, Markdown, plain text/CSV/JSON/YAML/XML/HTML, PDF (Petya's PDF
reader, first 30 pages), Word (main text), PowerPoint (slide text, speaker notes and the titles/series of charts on
each slide — so «презентация с графиком LTV» is found), Excel (sheet names and shared strings). Skipped: hidden
folders, `node_modules`, `Library`, build outputs and other built-in folders, `.gitignore`d paths, secrets by name,
binaries, Unity serialized assets, lockfiles and minified bundles; text files over 1 MB and documents over 30 MB.
Credential-looking text is replaced with «[скрыто]» before indexing.

## Flow

1. Adding the app downloads nothing and reads nothing. The first request answers with a card «Включить поиск по
   смыслу?»: the folders, what is read, and «Скачать модель и включить (639 МБ)» (or «Включить индекс» when the model is
   already there), «Добавить папку», «Настройки». Only that button (or the settings switch) turns the collection on.
2. The model downloads with progress in the notification center, then the folders are indexed in the background
   («N из M», «Пауза»/«Продолжить»). Re-indexing is incremental (mtime + size, then content hash) every 30 minutes and
   right after folders change.
3. A search answers with up to 8 files: type badge (extension, coloured by kind), name, location («слайд 7»,
   «стр. 3», «строка 42», «§ Монетизация › Азия»), the folder (home as «~», long paths shortened in the middle), the
   best matching piece with the query's words highlighted, a similarity bar (relative to the best hit, exact cosine in
   the tooltip), the modification time, and «Открыть», «Показать в Finder/Проводнике», «Спросить по этому файлу».
   The kind of file the request names («презентация», «скрипт», «таблица») gives a small boost, not a filter.
   While the index is still building, the card shows its progress.
4. «Спросить по этому файлу» attaches the file to the current chat (≤ 10 MB, Petya's attachment readers) and puts
   «Что в файле «…» про «…»?» into the composer for the user to finish and send.

Actions only work for files inside the indexed folders. Nothing is written, moved or deleted.

«Поиск по всему» uses the same index for its «Файлы проекта» source (files found by meaning in the chat project's
folders come before word matches). A search can be a dashboard widget (`dashboard.accepts` = the same routing; it
only reads).

## Settings

Switch «Индексировать папки» (what is read is written under it), «Папки проектов компании», added folders with
«Убрать», «Добавить папку», the model state and «Скачать модель», index size, «Пауза»/«Продолжить», «Обновить сейчас»,
and «Стереть индекс» (red trash button, asks first; deletes all vectors and texts and switches collections off).
Below: Petya's own optional collections «Чаты Пети» and «Встречи» (off by default) with what each reads — used by
«поиск по всему» and the mentor (see the foundation doc).

Settings keys: `fileSearchFolders` (JSON list of absolute paths), `fileSearchProject` (`true`/`false`); the index's own:
`semanticIndexCollections`, `semanticIndexModel`, `semanticIndexPaused`.

## Phrases and near-misses

Claimed: a search verb («найди», «поищи», «где», «покажи», «в каком файле», «есть ли у меня…») with a kind of file
(файл, документ, презентация/през(у), слайд, скрипт, исходник, класс, функция, таблица, PDF, заметки, конспект,
конфиг, README, «по смыслу»), or «документы/файлы/презентации/заметки про …».

Not claimed (tested): «найди в интернете …» (web search), «поиск по всему …» (search-all), «найди задачу в Jira …»,
bugs and tickets, Confluence/Notion/Drive pages, «в чате/в переписке», Slack/Telegram/mail, «какие файлы занимают
больше всего места» and «чем забит диск» (disk-usage), «сожми видео», «переведи документ в pdf» (converter), «напиши
скрипт …», «создай файл …» (coder), «найди коммит …», «документация по Unity API», «найди время для встречи».

Known overlap: «Метрики игры» also reacts to «монетизация». The offer for «документы про монетизацию» goes to this app
(«документы про …» counts as naming it), and with both apps added the chat asks this app first (extension order), but
«Метрики игры» would claim the phrase on its own; its `avoid` could add «документ|файл|презентац».

## Verified

Unit (`node tests/file-search.cjs`): routing and near-misses, not added → null, opt-in and no-folder cards, model
missing and Ollama down states, the folder walk with ignore rules, PowerPoint (with chart), Word, Excel and PDF text
(PDF reader stubbed), the full path through the semantic index with fake embeddings (sync → search → incremental
re-index of an edited file and removal of a deleted one), guarded open/reveal/attach, folder settings, wipe, and the
offer. UI (`tests/file-search-ui.cjs`): result card, building state, opt-in card and settings card with screenshots
(`petya-file-search.png`, `petya-file-search-setup.png`, `petya-file-search-settings.png` in the temp folder).

Not verified live: the real `qwen3-embedding:0.6b` download and its ranking on real Russian documents, real PDFs
through the Electron PDF reader inside the index, `shell.openPath`/`showItemInFolder` on macOS and Windows, indexing
speed and CPU load on a large project.
