# Documentation freshness («Свежесть документации»)

Category: docs. Directory: `src/extensions/doc-freshness/`. Needs the chat project's folder with a git repository;
Confluence and Google Docs are read when those connections exist. Adding the app is enough.

Finds documents that mention **file paths, code symbols, settings or versions** that no longer exist in the code or
changed after the document's last edit. Every finding pairs **the document's line** with **the git change** (commit,
date, author, subject, what changed). The check runs on request; a weekly check is available and **off by default**.

## Phrases

Triggers (when added): «проверь свежесть документации», «какая документация устарела?», «найди устаревшую
документацию», «найди устаревшие места в README», «проверь актуальность доков», «что в документации устарело»,
«проверь документацию на актуальность», «найди устаревшие страницы в Confluence» (only Confluence), «…в гугл доках»
(only Google Docs), «включи / выключи еженедельную проверку документации», «проверяй документацию каждую неделю».

Not triggered: «какие пакеты устарели», «устаревшие зависимости» («Зависимости»), «найди устаревшие API в коде»,
«обнови документацию», «напиши документацию к модулю» (the Programmer / skills), «найди документацию по Unity»,
«свежие новости», «что такое устаревшая документация», «проверь документ на ошибки», «/doc-freshness …».

## Documents

| Source | What | Edited |
| --- | --- | --- |
| project | tracked `*.md` / `*.markdown` of the repository (≤ 300, ≤ 300 KB each), without `docs/adr/` (decisions are history), changelogs, licences, `node_modules`, `vendor`, `Library`, embedded packages | the last commit touching the file; now when it has uncommitted changes |
| Confluence | the 25 most recently modified pages of the space chosen in the Atlassian connection (`GET /wiki/rest/api/content/search?cql=space = "KEY" AND type = page ORDER BY lastmodified DESC&expand=body.storage,version`); storage `<code>` becomes code spans, code macros are skipped | `version.when` |
| Google Docs | the 25 most recently modified Docs of the «Google Диск» connection (Drive `files.list`, Docs `documents.get`) | `modifiedTime` |

## References and checks (code, `scan.cjs`)

Fenced code blocks are skipped (examples are not claims). Per line:
- **paths** — in code spans (with a known extension or a slash), in prose (`dir/file.ext`) and relative Markdown links,
  resolved from the repository root and from the document's folder; a bare file name matches any tracked file with that
  name;
- **symbols** — code spans like `NetClient.Connect()`, `LoadLevel()`, `PlayerController` (the last identifier, ≥ 4
  characters, with a capital, an underscore or `()`; keywords skipped);
- **settings** — `SCREAMING_SNAKE`, `--flags`, `dotted.keys` in code spans, with a claimed value when the line says
  `= 8`, `: 8`, «по умолчанию 8»;
- **versions** — «Unity 2022.3» (against `ProjectSettings/ProjectVersion.txt`), «Node 18» (`.nvmrc` or
  `package.json` engines), and dependencies of `package.json` / `Packages/manifest.json` named with a version.

Findings (severity 3 → 1):
- path gone: `git log -1 --diff-filter=D -- path`, then that commit with rename detection (`git show -M --name-status`)
  → **переименовано** (old → new, with the corrected line) or **файл удалён**; a path never in git is not a finding;
- symbol / setting nowhere in code (`git grep -w -F`, Markdown and `docs/` excluded): the latest commit touching the
  word (`git log -G'(^|[^A-Za-z0-9_])word([^A-Za-z0-9_]|$)'`) → **удалено из кода** with the removed line, or
  **переименовано** when that commit added the same line with another identifier (`Connect` → `ConnectAsync`);
- setting value differs from the code's `KEY = value` → **значение изменилось** (commit that changed the line);
- version differs from the manifest → **версия изменилась** («2022.3» matches «2022.3.10f1»; commit of the manifest);
- the file or code with the symbol changed after the document's edit (`git log --since=<edit> -- path` / `-G`) →
  **код изменился после правки** (severity 1).

Documents are ordered by the sum of severities, then by how far the code moved on after the edit. At most 60
references per document and 400 git queries per check. Links to commits when `origin` is on GitHub.

## Card and actions

A bar of findings by kind; documents with a staleness meter, the edit time and «код ушёл вперёд на N дней»; per finding
the document's line (the reference highlighted) next to the commit. Actions per finding:
- «Создать задачу» — the `task-tracker` link (Jira / Asana preview and create after confirmation);
- «Предложить правку» — when the fix is exact (a rename, a value, a version) the card shows the line `−`/`+`; for a
  project document «Применить правку» calls the app's IPC `applyEdit(checkId, findingId)`, which writes only that line
  and only if it is still what the check saw (the path and the new line come from the stored check, never from the
  renderer); the toast has «Отменить» (the same check in reverse). For Confluence / Google Docs it offers «Скопировать
  строку» only. Without an exact fix, a project document goes to «Программист» through `code-fix` (own branch, diff for
  review). Nothing is changed silently.

## Weekly check

Settings → «Свежесть документации» → «Проверять раз в неделю…» (`docFreshnessWeekly`, default `false`), or «включи
еженедельную проверку документации» in the chat. When on, an hourly timer runs the check at most once in seven days
over the Markdown of up to three projects (no network) and publishes one notification `doc-freshness:weekly`
(«attention» when something is outdated). It never edits. The timer stops on `teardown`.

## Verified

Unit (`node tests/doc-freshness.cjs`) over a real fixture git repository with dated commits: routing, references,
every kind of finding with its commit, ADR / changelog skipping, ordering, `applyEdit` and undo (refused when the line
changed), an uncommitted document, Confluence and Google Docs over stubbed services, the weekly check, several
repositories and a broken one. UI (`tests/doc-freshness-ui.cjs`, a real check of a fixture repository; screenshots
`$TMPDIR/petya-doc-freshness.png`, `-2.png`, `-diff.png`). Not verified live: large repositories (timing of the git
queries), real Confluence storage pages and Google Docs, and the Programmer hand-off.
