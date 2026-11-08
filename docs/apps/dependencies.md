# Dependencies («Зависимости»)

Category: dev. Local plus public APIs (PyPI, OSV) without credentials; no settings (`settings: false`).

## What it does
For the current project's folders (from `gitWorkspace.discover()`: selected repo, project folders, repositories; manifests
up to two levels deep, `node_modules`/`Library`/… skipped):
- **npm** — `package.json` + `package-lock.json`: `npm outdated --json --long` and `npm audit --json`, run with `execFile`
  (no shell, 90 s timeout, chat stop aborts). On Windows npm is run as `node.exe node_modules/npm/bin/npm-cli.js` found
  beside `npm.cmd` on PATH. Without a lockfile (or when audit fails) vulnerabilities come from OSV for installed versions.
- **pip** — `requirements*.txt`, `pyproject.toml` (`[project].dependencies`, Poetry): latest/wanted from
  `https://pypi.org/pypi/<name>/json` (pre-releases and fully yanked releases ignored, wanted = highest allowed by the
  specifier), vulnerabilities via OSV `POST https://api.osv.dev/v1/querybatch` (pinned `==` versions only) and
  `GET /v1/vulns/{id}` for details. Severity: `database_specific.severity`, else a CVSS v3 base score from the vector.
- **Unity Package Manager** — `Packages/manifest.json` + `packages-lock.json`: packages listed (built-in modules hidden),
  git/file packages and preview versions flagged; latest versions are not available offline, the card says so.
- **Gradle** (`build.gradle(.kts)`, `gradle/libs.versions.toml`) and **CocoaPods** (`Podfile.lock`): list only.

Update kind: patch/minor/major from current to latest (a 0.x minor bump counts as major).

## Card
Summary chips (outdated, major updates, vulnerabilities by severity), a stacked patch/minor/major bar, ecosystem status
(проверено / нет сети / ошибка / только список), notes, and a table: package, current → wanted → latest, update-kind chip,
advisory badges linking to GitHub Advisories or osv.dev, ecosystem. Actions: «Обновить безопасные (patch/minor) в ветке»
sends «Как программист, обнови зависимости … в отдельной ветке и прогони тесты» to the chat (handled by the coder
extension; this app never modifies files), «Показать уязвимости» filter, «Открыть advisory» (most severe), «Проверить снова».

## Phrases
«какие пакеты устарели», «есть ли уязвимости в зависимостях» (opens filtered), «npm audit», «что обновить в проекте»,
«проверь зависимости юнити» (Unity only, no network). Near-misses: «зависимости между задачами» (Jira), «эмоциональная
зависимость», «от чего зависит дедлайн»; change commands («обнови зависимости», «как программист …») go to the coder.
No project folder → a question to connect one; no manifests → a question as well.

## Errors
Network failures (ENOTFOUND, timeouts, `fetch failed`, npm's `{error:{code}}` JSON) mark the ecosystem «нет сети» and keep
locally read packages; a missing npm binary is reported in the npm row.

## Verified
Everything is tested with stubs (`node tests/dependencies.cjs`: npm runner, PyPI and OSV responses; UI
`tests/dependencies-ui.cjs` with a screenshot). Not verified live: real npm on macOS/Windows PATHs, PyPI/OSV responses
from this network, large monorepos.
