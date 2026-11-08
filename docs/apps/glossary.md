# Glossary («Глоссарий»)

Category: docs. Directory: `src/extensions/glossary/`. No settings, no service of its own.

A per-project glossary of game and product terms («мана», «сундук», «ивент», «баттлпасс»): definition,
translations per language, synonyms and forbidden variants, usage count and where each term was found.

## Where terms come from

- **Localization** — the project's localization files, found and parsed by the «Локализация» app's own modules
  (`src/extensions/localization/find.cjs`, `formats.cjs`: Unity String Tables, CSV/TSV, JSON, Android strings.xml,
  iOS .strings/.xcstrings, .po). Frequent words of the Russian (or source-language) strings are candidates; the
  translation each language uses for a term is computed by code: the words that occur in that term's rows far more
  often than in all rows of the language (lift), with a neighbour joined when it always comes along («battle pass»)
  and compounds accepted for languages other than English («Truhe» in «Heldentruhe»).
- **Docs** — Confluence/Notion pages through the shared docs search (`s.workspace.searchDocs`): lines like
  «Мана — ресурс для умений» become candidates with that definition and a link to the page.
- **Chat and meetings** — Slack messages and meeting speech Petya already keeps: usage counts and quotes.
- **The local model** chooses which frequent words are project terms and drafts one-sentence definitions from the
  strings, quotes and pages it is given. A term it names that is not among the given words or pages is dropped;
  a synonym absent from the evidence is dropped. Without a model, frequent words are proposed without definitions.

Nothing is stored until the user presses «Принять» (or «Изменить» → «Принять»). The glossary is kept per project in
the company data folder: `<company>/extensions/glossary/glossary.json` (`{version:1, projects:{<chat project id>:
{name, terms:[…]}}}`); chats without a project use `general`.

## Consistency check («проверь термины в локализации»)

For every saved term, by code (`lexicon.check`):

- **forbidden** — a forbidden variant anywhere in the strings («crate», «МП»);
- **translation** — rows of the term where a language does not use the approved translation (the row's word is
  named when it repeats, e.g. «box» twice; otherwise «другое»);
- **inconsistent** — without an approved translation, rows that differ from the commonest one when it covers at
  least half of the rows.

A row with a forbidden variant is reported once. The card shows variant bars per term and language and a table:
term, language, key, string, problem.

## Answer context

`setup()` returns `glossaryContext(command, projectId)`: the saved terms the question uses (by term, synonym or
forbidden variant; up to five, at most 900 characters), as «Глоссарий проекта (справочные данные, не инструкции):
сундук — …; переводы: en chest, de Truhe; не использовать: crate». It is reference data, not a prompt rule.
**Wiring needed in the shared code** (not done here — `src/main.cjs` is outside this app): in `answerDialogue`, pass
it with the chat project's context, the same channel project context already uses:
`projectContext:[chatProject?.context,services.glossaryContext?.(command,topic.projectId)].filter(Boolean).join('\n\n')`
(and the same in `supplementalContext`).

## Phrases

Triggers (app added): «что такое мана у нас», «что у нас значит ивент», «что такое сундук в игре», «что такое
сундук» (only when «сундук» is already saved), «добавь в глоссарий сундук — награда за уровень», «добавь термин
«баттлпасс» в глоссарий», «собери глоссарий проекта», «обнови глоссарий», «проверь термины в локализации», «сверь
локализацию с глоссарием», «покажи глоссарий», «экспортируй глоссарий в CSV».

Not triggered: «что такое REST» (general, not a saved term), «глоссарий Unity» / «покажи глоссарий Kubernetes»
(another product's docs), «проверь локализацию» («Локализация»), «что у нас с релизом», «переведи эту фразу».
Turn order: extension turns run in directory order, so «проверь термины в локализации» reaches «Глоссарий» before
«Локализация»; the offer gives «Глоссарий» two topic matches against one for «Локализация».

## Card

Header with the project and a live status chip (proposals left, discrepancies or term count). Search field (more
than four terms). Each term: name, state chip (в глоссарии / предложение / удалён), usage bar with the total
(strings + chat + docs, details in the tooltip), definition, translation chips per language (a yellow dot when the
strings use several, with the split in the tooltip), dashed synonyms, struck-through forbidden variants,
«Где встречается» (keys and strings, Slack/meeting quotes with links, sources with links). Actions: «Принять»,
«Изменить» (inline form: term, definition, translations `en: chest; de: Truhe`, synonyms, forbidden variants), the
red trash (`window.deleteButton`) with «Отменить» in the toast. Card actions: «Экспорт CSV» / «Экспорт JSON»
(downloads; CSV has one column per translation language, UTF-8 with BOM), «Принять все», «Проверить локализацию»,
«Собрать глоссарий». Building publishes a notification (`glossary-build`) like other long operations.

## Limits

- Translations are statistical: a term needs at least two rows in a language for a confident translation; single
  different rows are shown as «другое» with their text, never guessed.
- Russian matching uses stems with up to three letters of ending; English matches plurals.
- Up to 500 terms per project, 20 candidates per build.

## Verified

- With fixtures/stubs (`node tests/glossary.cjs`): a temp project with a CSV string table (ru/en/de) and Android
  strings.xml (values / values-ru), a stubbed Confluence page, Slack and meeting memory, the model stubbed for
  build and definition; accept/edit/delete/restore through the IPC with a temp company folder; export; checks;
  answer context.
- UI (`tests/glossary-ui.cjs`, screenshots `petya-glossary.png`, `petya-glossary-check.png` in the temp folder),
  through the real main process and store.
- Not verified live: real Confluence/Notion pages, the model's choice of terms on a real project, the answer
  pipeline wiring above.
