# Patch notes app (`src/extensions/patch-notes`)

«Патчноуты» writes player-facing release notes from a release's real changes:

- Jira issues of a version or a sprint;
- commits between two tags of the project's git repository;
- pull requests merged on GitHub in that period.

Internal changes are switched off by configurable labels, components and commit types. The local model writes the
notes per language and tone. Every line must cite the ids of the changes it describes, and the card shows them on
hover. A line citing nothing real (an invented feature) or a change that is off is dropped. Code formats each
destination and keeps its limit. A changelog for the team is built by code from all changes.

## Phrases

| Request | Card opens on |
|---|---|
| «напиши патчноут к версии 1.5» | App Store |
| «что нового для стора», «что нового в версии 1.5 для Google Play» | App Store / Google Play |
| «чейнджлог между v1.4 и v1.5», «release notes к версии 2.0» | Для команды |
| «анонс обновления для игроков» | Discord / Telegram |
| «патчноут за спринт 12 на английском и немецком», «весёлый патчноут к 1.5» | languages and tone from the request |

When no version, sprint or tags are named, Petya asks through the shared question panel. The options are Jira
versions and the latest pair of git tags. The answer resumes the same request.

These phrases are not handled by the app: «заметки встречи», «сводка встречи», «что нового в Slack / почте / Jira»,
«переведи …», «что такое патчноут», «сделай скилл …», and any request starting with «/».

## Boundary with the skill library

Petya's built-in skills `release-notes`, `patch-notes-players` and `changelog-from-commits`
(`src/skill-library/work.cjs`) shape a free answer from text the user writes in the message:
«Напиши патчноут для игроков: исправили зависание магазина, добавили ивент», or «Сделай changelog по коммитам:
fix login crash; add shop screen».

This app answers only when the request points at a source of changes and lists none itself. A request with an
inline list after a colon returns `null`, both in `intent()` and in the offer's `avoid`, so the skills keep
these requests (see the «Скиллы: релизы» cases in `src/live-cases.cjs`). «/release-notes …» always stays a skill.

## Sources (read-only)

- **Jira** (connected per `workload.sources`, projects from `jiraProjects`):
  - versions: `GET /rest/api/3/project/{key}/versions`;
  - a version: `POST /rest/api/3/search/jql` with `fixVersion = "<name>"`; «1.5» matches «1.5», «v1.5» and
    «1.5.0»;
  - a sprint: `sprint in openSprints()` for the current one; otherwise the board is read with
    `GET /rest/agile/1.0/board?projectKeyOrId=…` and its sprints with `…/board/{id}/sprint?state=active,closed`,
    matched by number;
  - at most 3 pages are read, following `nextPageToken`.

  Issues not in a done status category are listed but switched off («не готово»). Sub-tasks are internal.
- **Git** (the current project's repository, `gitWorkspace.discover()`):
  - `git tag --list --sort=-creatordate`;
  - the version's tag and the previous version tag, or both named tags;
  - `git log --no-merges -n 400 from..to`.
- **GitHub** (the shared «GitHub» token, `githubRepos` or the project's remote):
  - `GET /repos/{repo}/compare/{from}...{to}`, used for commits when there is no local repository, and for the
    period;
  - `GET /search/issues?q=repo:… is:pr is:merged merged:<from>..<to>` for merged PRs.

A commit or PR naming a Jira key in the list (`GAME-15 fix …`), or a commit naming a PR (`(#41)`), joins that
item as an extra reference instead of repeating it. A failing source is reported in the card and the others
still count.

Internal changes:

- Jira or GitHub labels listed in `patchNotesInternalLabels` (default
  `internal, tech-debt, techdebt, refactoring, no-release-notes, ci, qa-only`);
- Jira components listed in `patchNotesInternalComponents`;
- conventional commit types `chore/ci/build/test/refactor/docs/style`;
- merge and version-bump commits.

They are shown switched off with the reason and stay in the team changelog. Groups are Новое / Улучшения /
Исправления, taken from the issue type, PR labels, `feat/fix/perf` prefixes, then keywords.

## Texts and limits

Limits (checked in November 2026):

- **App Store** «What's New in This Version»: 4000 characters, per Apple's App Store Connect help, Platform
  version information.
- **Google Play** release notes: 500 characters per language. The Play Developer API rejects longer notes with
  «Limit is 500 characters».
- **Discord / Telegram** post: 2000, Discord's message limit, which also fits Telegram's 4096.

Characters are counted as code points. When a text is too long, whole lines go from the end (fixes first).
Nothing is cut mid-line, and the card shows «не влезло строк: N». Google Play uses each line's `short` form
without headings.

Languages and tone:

- **Languages** come from the request («на английском и немецком», «ru/en») through the localization app's
  `langs.cjs`, otherwise from `patchNotesLanguages` (default `ru, en`). At most 8.
- **Tone** comes from the request (весёлый, официальный, краткий, эпичный, дружелюбный) or `patchNotesTone`.

Without a model, the changes' own titles are used once, untranslated, and the card says so.

## Card

The card has:

- the changes with switches;
- language tabs and destination tabs (App Store / Google Play / Discord · Telegram / Для команды);
- a character counter with a bar against the limit;
- the text, each line naming its sources on hover;
- actions «Скопировать», «Отправить в канал» (`k.links('share-message')`, shown only when a provider is
  connected; the message app's own flow previews and confirms) and «Перегенерировать в другом тоне» (tone menu,
  `patchNotes.regenerate`).

A switch recounts the texts without the model (`patchNotes.compose`). A change switched on that no line mentions
yet asks for «Перегенерировать».

## Verified

Everything is tested with stubs. No real Jira, GitHub or git remote credentials exist here.

- `node tests/patch-notes.cjs` covers:
  - routing and the skills boundary, and near-misses;
  - classification and internal reasons;
  - Jira + local git + GitHub merged by key and PR;
  - model lines with an invented and an unfinished change dropped, and only included changes sent to the model;
  - exact App Store / Google Play / post texts and trimming by whole lines;
  - the changelog;
  - toggles without the model and regeneration in another tone;
  - the model-free path and the version question with real options;
  - a failing source.
- `tests/patch-notes-ui.cjs` renders the card in the real window and checks the switches, tabs, counter and cut,
  sources on hover, safe text and the recount on toggle. It saves `petya-patch-notes.png` to the temp folder.

To verify live: Jira Cloud `search/jql` paging, sprint lookup on a real board, the GitHub search date range, and
Google Play's limit on the real Console.
