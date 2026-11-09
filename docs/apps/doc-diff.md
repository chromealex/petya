# What changed in a document («Что изменилось в документе»)

Category: docs. Directory: `src/extensions/doc-diff/`. No settings and no connection of its own: Markdown history comes
from the chat project's git repository, Confluence through the shared Atlassian connection, Google Docs through
«Google Диск» (its read-only scopes). Read-only; available to dashboards.

`diff.cjs` here is also the shared text helper of «Геймдизайн-документ» and «Вики из обсуждений» (sections, word diff,
storage ↔ Markdown, the Russian ↔ English game words).

## Phrases

Own: «что поменяли в GDD за неделю», «сравни спеку лиг с прошлой версией», «что изменилось в README за 3 дня», «какие
правки в документе «Экономика» за месяц», «кто менял спеку матчмейкинга», «что изменилось в docs/leagues.md», «что
поменяли на странице лиг в Confluence за неделю», «что поменяли в https://docs.google.com/document/d/… за неделю».
A period («за неделю», «за 3 дня», «за месяц») compares the version before it with the newest; without one — the last
change («с прошлой версией»).

Not triggered: «что изменилось в коде» and anything about code, commits, branches (Petya's git), «что поменялось в
балансе / конфигах» («Конфиги и баланс»), «что нового в гугл диске» («Google Диск»), «проверь свежесть
документации» («Свежесть документации»), ADR questions, tasks, sprints, chats, meetings, «сравни размер этих двух apk»,
«/doc-diff …».

## Which document (`find.cjs`)

A pasted Google Docs link or Confluence page link; a `.md` path; otherwise the name: «GDD» means files / pages named
gdd / game design / геймдизайн / диздок; other words are matched by concept (Russian and English game words, so «спека
лиг» finds `docs/specs/leagues.md`) against the project repositories' tracked Markdown (`git ls-files`), the
Confluence space's page titles (`GET /wiki/rest/api/content/search` with `title ~`) and Google Docs names (`files.list`
through «Google Диск»). Equally good candidates are a strict-choice question; nothing found is a question asking for a
link or a path.

## Versions (`history.cjs`)

- **git**: `git log --since --until -- <file>` (period) or `-1` (previous); each version `git show <sha>:<file>`; the
  base is `<oldest>^`; uncommitted edits are the newest version («Несохранённые правки»). Commit links on GitHub.
- **Confluence** (Cloud REST v2): `GET /wiki/api/v2/pages/{id}?body-format=storage` (current version),
  `GET /wiki/api/v2/pages/{id}/versions?sort=-modified-date` (number, author, date, message),
  `GET /wiki/api/v2/pages/{id}?body-format=storage&version=N` for older bodies, `POST /wiki/api/v2/users-bulk` for the
  authors' names. Storage is converted to Markdown with headings.
- **Google Docs** (Drive API v3, `drive.readonly`): `files.get`,
  `files/{id}/revisions?fields=revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress),exportLinks)`, and
  each revision's export link (`text/markdown` when offered, else `text/plain`; only Google hosts, with the read token).

At most 12 versions per comparison (the latest; the card says so).

## The comparison

Both texts are split into sections by headings; sections are matched by their heading path and compared with a word
diff (common prefix and suffix trimmed, LCS over word tokens; long unchanged runs shortened to «…»). Added, removed and
changed sections are the **hunks**, numbered. Who and when: each consecutive pair of versions is compared the same way,
and a hunk lists the authors of the versions that touched its section and the latest time.

## The summary is grounded in the hunks

With a local model, the model gets the numbered hunks (removed and added words) and returns up to five points, each
citing hunk numbers. Code keeps a point only when (`diff.grounded`): it cites existing hunks, every number in it is
among the changed words of those hunks, and most of its content words (at least one) appear in those sections (words
that only say «добавлен / удалён / изменён» do not count). Dropped points are counted on the card. Without the model, or
when nothing survives, the summary is «Изменён / Добавлен / Удалён раздел «…»» per hunk.

## Card

The document and source, the period, a timeline of the versions (dots by time, authors), added / removed words, the
summary whose points jump to their hunks, and each changed section with its status, who and when, and the inline word
diff (removed words struck out, added highlighted). «Открыть документ», «Сравнить за месяц».

## Verified

Unit (`node tests/doc-diff.cjs`) over a fixture git repository with dated commits by two authors and fake HTTP servers
(Confluence versions and users, Drive revisions and export links): routing and near-misses, the offer, period, previous
version and uncommitted edits, who/when per section, the model summary with invented points dropped, a tie asked,
nothing found, Confluence and Google histories, a service error. UI (`tests/doc-diff-ui.cjs`, screenshot
`$TMPDIR/petya-doc-diff.png`).

Needs live checking: Google revision export links (Google may merge revisions and may not offer `text/markdown` for
every revision), Confluence v2 `version=` bodies and `users-bulk` with OAuth, very long histories, renamed Markdown files
(history does not follow renames), and the local model's summaries.
