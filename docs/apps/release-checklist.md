# Release checklist («Релизный чек-лист»)

Category: gamedev. Directory: `src/extensions/release-checklist/`. No account of its own: it asks the apps that are
added and connected.

Answers «is release X ready?» with one card: a per-project checklist whose automatic items are checked by other apps
and whose manual items the user ticks per release.

## Phrases

«готов ли релиз 1.5», «чек-лист релиза», «релизный чек-лист для 2.0», «что мешает выпустить версию 2.0», «можно ли
выпускать 1.5», «статус релиза 1.5». Without a version Petya asks through the shared question panel (options: versions
checked before) and resumes the same request.

Not this app: «напиши патчноут к версии 1.5» (Патчноуты), «новые крэши после релиза» (Крэши), «плохие отзывы после
обновления» (Отзывы), «когда релиз?», «чек-лист переезда», «готов ли отчёт», «статус CI» (Сборки).

## Template

Settings → «Релизный чек-лист»: the release branch pattern (`releaseChecklistBranch`, default `release/{version}`) and,
per project, the items: title, group, and either «Вручную» or one of the checks any app provides. «Вернуть
стандартный» restores the default for a mobile game:

| Group | Item | Check (provider app) |
|---|---|---|
| Сборка | CI зелёный на релизной ветке | `ci.green` (Сборки) |
| Сборка | Номера версии и сборки согласованы | `versions.consistent` (this app) |
| Сборка | Размер билда без резкого роста и замечаний | `build.size` (Размер билда) |
| Качество | Нет новых крэшей, crash-free не хуже прошлой версии | `crashes.release` (Крэши) |
| Качество | Нет открытых блокирующих багов в версии | `jira.blockers` (Jira) |
| Качество | Смоук-тест на реальных устройствах пройден | manual |
| Стор и игроки | Оценки после прошлой версии не просели | `reviews.trend` (Отзывы в сторах) |
| Стор и игроки | Патчноут готов на всех языках и в лимитах сторов | `patchnotes.ready` (Патчноуты) |
| Стор и игроки | Скриншоты и описание в сторах обновлены | manual |
| Контент | Нет непереведённых строк | `loc.missing` (Локализация) |
| Код | Нет уязвимых зависимостей | `deps.vulnerable` (Зависимости) |
| Запуск | Сервер и удалённые конфиги готовы; поэтапная раскатка; поддержка предупреждена | manual |

Templates, manual ticks and the last statuses are stored per company in
`<company data>/extensions/release-checklist/state.json` (mode 600), per project and release (the latest 30 releases).

## The `release-check` contract

A kind in `REGISTRIES` of `src/features/app-links.cjs`; the registry is `checks.cjs` in this directory. An app
declares `"provides": {"release-check": "release-check.cjs"}` and exports
`{checks:[{id, title, group?}], ready(settings), hint?(settings), async run(services, release)}` →
`[{id, status:'ok'|'problem'|'unknown', summary, evidence?:[{text, url?}], action?:{label, ask}}]`, where
`release = {version, previous, branch, roots, now, project}`. The checklist names no app: an item names a check id.

Statuses on the card: **ок**, **проблема**, **не проверено** (no data yet, not configured, an error, a 90 s timeout —
the reason is shown), **нет приложения** (the provider's app is not added; it and apps added but not connected are
offered through the shared offer card, and accepting re-runs the request), **не отмечено** (manual).

Providers (all read-only, implemented in their apps):

- **Сборки** — the latest run per workflow / Unity build target on the release branch (GitHub Actions runs with
  `branch=`, Unity Build Automation builds by `scmBranch`): any failure → problem, running → not checked.
- **Крэши** — every connected crash source: the release by name, issues new since its date with ≥ 10 events, crash-free
  sessions against the previous version (a drop of 0.5 pp or more is a problem).
- **Отзывы в сторах** — per game (up to 3) the app's own «после обновления» read: average of the latest version vs
  the one before; a drop of 0.3★ or an average under 3.5★ with ≥ 10 reviews is a problem.
- **Патчноуты** — the newest patch-notes card of the version in the chats: every language of `patchNotesLanguages`
  present, App Store / Google Play texts within limits with no dropped lines. No card → not checked with «Написать
  патчноут».
- **Локализация** — the app's code checks on the project folders: missing, empty, broken placeholders.
- **Размер билда** — the two newest APK/AAB/IPA of one kind in the project folders: growth over 10% or 20 MB, or debug
  symbols in the build → problem; other warnings listed.
- **Зависимости** — a dependencies card from the last 24 h, else `npm audit` (with a lockfile) and OSV for pinned
  npm/pip versions: critical/high → problem.
- **Jira** — open issues (`statusCategory != Done`) of the matching fixVersion(s) through `POST /rest/api/3/search/jql`;
  bugs with a Blocker/Highest/Critical priority (or Russian names) or a `blocker` / `release-blocker` label are blockers.
- **Этот app** (`versions.cjs`) — `ProjectSettings/ProjectSettings.asset` (`bundleVersion`, `AndroidBundleVersionCode`,
  `buildNumber.iPhone`), `build.gradle(.kts)` (`versionName`, `versionCode`), `Info.plist`
  (`CFBundleShortVersionString`, `CFBundleVersion`, `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)` resolved
  from `project.pbxproj`): every version equals the release (1.5 = 1.5.0) and each platform's build number agrees.

## Card

Progress ring (ready of all), counters, branch and check time; items grouped as in the template with a status icon,
the app that checked it, the verdict, evidence links and a follow-up button (e.g. «Почему упала» asks «Сборки»).
Manual items are checkboxes (saved at once, every card of that release updates). Actions: «Перепроверить»,
«Отправить в …» (`share-message`, the status text) and «Создать задачи по проблемам» (`task-tracker`, one task per
problem) — those apps preview and confirm themselves. User-written titles and groups are not translated.

## Verified

With stubs only (no real GitHub, Unity, Sentry, App Store, Google Play, Jira or OSV access here):
`node tests/release-checklist.cjs` (routing and near-misses, version question, every status incl. errors and timeouts,
offers, ticks per release on disk, template editor, every provider with stubbed services and temporary Unity /
Gradle / Xcode / localization / APK fixtures) and `tests/release-checklist-ui.cjs` (card and settings in the real
window; screenshots `petya-release-checklist*.png` in the temp folder).

To verify live: GitHub `actions/runs?branch=` on a real release branch, Sentry release health for two versions, Jira
priority names on a real site, `npm audit` timing on a large project.
