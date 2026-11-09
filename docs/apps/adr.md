# Architecture decisions («Архитектурные решения»)

Category: dev. Directory: `src/extensions/adr/`. No service needed: decisions are Markdown files in the chat
project's folder, `docs/adr/NNNN-slug.md`. Adding the app is enough.

## Phrases

| Request | What happens |
| --- | --- |
| «запиши решение: переходим на Addressables для загрузки уровней», «зафиксируй решение — UDP для сети» | a draft ADR whose decision is the user's words |
| «оформи ADR про переход на Addressables», «напиши ADR о хранении сохранений», «оформи архитектурное решение про кэш» | a draft ADR on that topic (the decision is taken from a matching meeting decision when there is one) |
| «какие решения принимали про сеть», «какие архитектурные решения у нас есть по сохранениям», «найди ADR про сеть» | search over `docs/adr` |
| «покажи ADR», «список архитектурных решений», «какие архитектурные решения у нас есть» | the latest decisions |
| «противоречит ли это решению про сеть», «противоречит ли переход на TCP принятым решениям», «противоречит ли это ADR 1», «противоречит ли решениям: будем грузить всё из Resources» | a check against the related decisions; «это» is the user's previous message in the chat, otherwise a question asks what to check |

Not triggered: «запиши решение уравнения», «реши уравнение», «какие решения приняли на встрече» / «по итогам
встречи», «что решили на встрече» (Petya's meeting summary), «прими решение за меня», «помоги решить задачу»,
«какое решение лучше», «противоречит ли это закону», «курс ADR Яндекса», «/adr …» (a skill).

## Where the files are

The chat's project folders (project settings): the one that already has `docs/adr`, else the only git repository,
else the only folder; several candidates → a question with the folders. No folder → a question saying to link one.
Existing ADRs are read in Nygard and MADR styles, Russian or English headings («Контекст» / «Context and Problem
Statement», «Решение» / «Decision Outcome», «Альтернативы» / «Considered Options», «Последствия» / «Consequences»),
`Статус:` / `Status:` and `Дата:` / `Date:` lines (also as list items). Status words map to accepted / proposed /
superseded / rejected.

## Drafting

Evidence, each shown on the card under «Откуда взят контекст» and listed in the file's «Источники»:
- this chat: the last 16 messages, those sharing a word stem with the request (up to 4);
- meeting summaries of the last 120 days: decisions and discussed points sharing a stem (up to 5);
- the semantic index (`docs/foundations/semantic-index.md`), when the user turned collections on:
  `search(['chats','meetings','files'], …)`, hits with score ≥ 0.35, ADR files themselves excluded (up to 4).

Without a model the draft is assembled by code: title from the topic or the first clause of the statement, the
decision from the statement (or a matching meeting decision), context from the evidence, alternatives from evidence
sentences with «вместо / альтернатива / рассматривали / или оставить», consequences left as «—» for the user. With a
local model, the model writes title, context, decision, alternatives and consequences from the same numbered evidence
(«ничего не выдумывай»); an answer without a decision is ignored. Similar existing decisions (by stems of the request
and the chat / meeting evidence) are shown.

## The confirmation card and writing

The card shows **the exact file**: folder, `docs/adr/NNNN-slug.md` (next free number, slug transliterated), and the
full Markdown in an editor; a strip of the four sections lights up as each gets content. Nothing is written by the
chat turn. «Сохранить в проект» calls the app's IPC `save(draftId, text)`, which writes exactly the editor's text to
the path fixed when the draft was made (the renderer cannot choose the path): the folder must still exist, the path
must be `docs/adr/<NNNN>-<slug>.md` inside it, `docs/adr` must not be a symlink, the number must still be free (else
an error asks to draft again) and the file is created with `wx` (never overwritten). A card drawn again shows
«сохранено». Drafts are kept per company in `<company data>/extensions/adr/cache.json` (the 50 latest).

Other destinations, each only on a press:
- «Сохранить в Google Документы» — the `document-export` link («Google Диск» previews and creates the document);
- «Создать страницу в Confluence» — only when Confluence is connected (the shared Atlassian connection, module on)
  and a space is chosen there (`confluenceSpace`): `GET /wiki/api/v2/spaces?keys=KEY` →
  `POST /wiki/api/v2/pages {spaceId, status:'current', title:'NNNN. Title', body:{representation:'storage'}}`
  (Markdown converted to storage XHTML, escaped; the H1 becomes the page title). One page per draft; a request
  without an answer is reported as «результат неизвестен», never retried.

## Search and the check

Search scores stems (a word without its last two letters, at least three letters: «сеть» finds «сетевой»): title ×3,
decision ×2, the rest ×1; with the index on, ADR files found by meaning are added («по смыслу»). The card shows all
decisions as a strip by number (found ones lit, colour by status) and the found ones with the sentence that matched.

The check finds up to three related decisions (an explicit number, else stems of the target and the statement). The
model gives a verdict per decision with a quote; the verdict counts only when the quote is **verbatim** in the ADR
(whitespace, Markdown marks and «ё» normalized, ≥ 8 characters) — otherwise the decision's text is shown with «сравните
сами». Superseded and rejected decisions never make «противоречит». Without a model: the related decisions and their
decision text, no verdict.

## Verified

Unit (`node tests/adr.cjs`) over a fixture repository with three ADRs: routing and near-misses, not added, no
folder, rule and model drafts with chat / meeting / index evidence, the save checks (exact text, no overwrite, taken
number, bad ids), search, list, the check with and without the model (verbatim and invented quotes, superseded
decisions), the question for «это» without a previous message, and the Confluence page over stubbed REST v2. UI
(`tests/adr-ui.cjs`, screenshots `$TMPDIR/petya-adr.png`, `-2.png`, `petya-adr-search.png`, `petya-adr-check.png`).
Not verified live: Confluence Cloud page creation (storage conversion as Confluence renders it), the semantic index
with the real embedding model, and the local model's drafts.
