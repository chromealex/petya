# «Сборки» (`ci-builds`, category gamedev)

CI runs in the chat from GitHub Actions and Unity Build Automation.

## Phrases
«почему упала сборка?», «что с билдом на андроид», «последние сборки», «статус CI», «статус CI на ветке develop»,
«перезапусти упавшую сборку» (shows the card; the rerun itself is a button).

## Card
Recent runs (status, commit title, workflow #, branch, duration, age); a history strip per workflow / Unity build
target (last 10 runs as coloured squares, links to the runs); for a failed run the failing job → step and the first
error lines of the log (found by code in `log.cjs`: `##[error]`, compiler errors, `FAIL`, exceptions; noise like
«0 errors» and «exit code 1» is used only as a fallback). Buttons: «Открыть», «Перезапустить…» (confirmation row in the
card, then GitHub `rerun-failed-jobs` — `rerun` for a cancelled run — or a new Unity build; published to the
notification center), «Отдать Программисту» (sends a coding request with the error to the «Программист» extension).

## Sources
- GitHub Actions: `GET /repos/{repo}/actions/runs`, `…/runs/{id}/jobs?filter=latest`, `…/actions/jobs/{id}/logs`
  (302 → signed URL), `POST …/runs/{id}/rerun-failed-jobs`. Repositories: see `docs/apps/github.md` (up to 3).
- Unity Build Automation REST API **v2** (`https://build-automation.services.api.unity.com/v2`), Basic auth with a
  service account `Key ID:Secret` (role Automation User). v1 API keys are not supported: Unity removes v1 on
  21 Dec 2026. Calls: `GET /orgs/{org}/projects/{project}/buildtargets`, `…/buildtargets/{id}/builds?per_page=10`
  (up to 6 enabled targets, filtered by platform), `…/builds/{n}/log?offsetlines=1&linenumbers=false`,
  `POST …/buildtargets/{id}/builds {"clean":false}`. Settings (org, project, key) are in the «Сборки» card; the key is
  the secret `ciUnityKey`.
- `ready` (offers) = app added + (GitHub token, or Slack connected, or Claude / Codex on — the build flows below need
  no GitHub). The CI chat turn also works with Unity only and asks for GitHub itself when neither is connected.

## Slack/Jira build flows (moved from Petya's core)
The app owns the flows that used to live in `src/build-*.cjs`, now `build-watch.cjs`, `build-question.cjs`,
`build-repair.cjs`, `build-repair-sources.cjs`, created per company by `build-flows.cjs`:
- `build-repair.cjs`: «почини/исправь/пофикси билд», «статус исправления», «отмени исправление», logs attached to the
  chat or the composer, topics with a repair source. Reads the log from a Jira issue, a Slack thread or the attached
  file, hands the fix to an agent (Claude / Codex) and, when asked, reports back.
- `build-question.cjs`: «спроси/узнай, что с билдом», «что с этим билдом», and a bare «что с билдом / как там сборка»
  without a CI target: asks the person responsible in Slack and reports the answer.
- `build-watch.cjs`: «следи за билдом 123» in a reviewed Slack thread (the Slack review flow, `src/review-assistant.cjs`,
  gets the watch as `services.ciBuilds.watch`, null while the app is off): polls the thread for the CI bot's result.

They plug in through generic core registries: the chat route `chat-route.cjs` (stage `builds`, asked where the core
used to run them, right before the Slack log review; also the meaning-router entry `build-question` and the
clarification `repair-input`), IPC `repairSelect` / `questionSelect` for the choice buttons, and the company
lifecycle (`src/features/lifecycle.cjs`: reset when the Slack connection or the project changes, cleared with the
context, pruned to the retention). Their rows stay where they were (the company's encrypted `review-memory.json`:
`repairs`, `buildQuestions`, `watches`), so nothing is migrated. A one-time settings migration adds the app for
companies that had Slack or Claude / Codex and never saved the switch, so existing users keep the flows; without the
app these requests get its offer.

## Boundary between the CI turn and the build flows
Extension turns run first, so `route()` steps aside for what the build flows own:
- the repair and question phrases above (a «что с билдом» with a CI target — platform, branch, CI/GitHub/workflow/
  Unity Cloud — is the CI turn's: «что с билдом на андроид»);
- Slack log / review assistant: any request naming Slack/тред/канал, chats opened from a Slack thread (`slackSource`,
  `slackLog`), «следи за билдом», «статус билдов», «сравни с прошлым падением».
- Neighbours: build size («сколько весит билд»), dependencies, local builds («собери билд», «запусти сборку»).
The offer never takes a failure question without a CI name («почему упала сборка?»): it stays with the Slack log review.

«Отдать Программисту» sends «Исправь код проекта, чтобы проходила проверка …» rather than «Исправь ошибку сборки»:
`coder/intent.cjs` hands every request mentioning «сборк/билд/CI/commit/push» to other flows (and «исправь сборку» is
build-repair's), so those words are elided from the handoff text; a test checks `isCoding(handoff)`.

## Limits
Up to 3 repositories × 40 runs, 6 Unity targets × 10 builds; one failure explained per answer; job logs read up to the
last 4 MB; legacy commit statuses are not read. Rerun only for runs shown in a card within the last hour.

## Verification
Stubs only: `node tests/ci-builds.cjs`, `tests/build-question.cjs`, `tests/build-repair.cjs`,
`tests/review-assistant.cjs`, `tests/core-ci-builds-guard.cjs`; UI: `tests/ci-builds-ui.cjs`, `tests/github-settings-ui.cjs` (screenshots
`/tmp/petya-ci-builds.png`, `/tmp/petya-ci-builds-bottom.png`, `/tmp/petya-github-settings.png`). Not verified live:
real GitHub log redirect host, rerun response codes, Unity v2 `builds` / `log` paths and the `links.dashboard_url`
field (assumed from the v1 shape, which v2 mirrors for build targets and start build).
