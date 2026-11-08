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
- `ready` (offers) = app added + GitHub token. The chat turn also works with Unity only.

## Boundary with Petya's existing build flows
Extension turns run before `build-repair` / `build-question` / Slack log reading in `converse.cjs`, so `route()` steps
aside for what those own:
- `build-repair.cjs`: «почини/исправь/пофикси билд», «статус исправления», «отмени исправление», logs attached to the
  chat or the composer, topics with a repair source.
- `build-question.cjs`: «спроси/узнай, что с билдом», «что с этим билдом», and a bare «что с билдом / как там сборка»
  without a CI target (platform, branch, CI/GitHub/workflow/Unity Cloud). With a target («что с билдом на андроид») the
  request is answered here.
- Slack log / review assistant: any request naming Slack/тред/канал, chats opened from a Slack thread (`slackSource`,
  `slackLog`), «следи за билдом», «статус билдов», «сравни с прошлым падением».
- Neighbours: build size («сколько весит билд»), dependencies, local builds («собери билд», «запусти сборку»).
The offer is stricter still: a failure question without a CI name («почему упала сборка?») never gets an offer,
it stays with the Slack flow for users without this app.

«Отдать Программисту» sends «Исправь код проекта, чтобы проходила проверка …» rather than «Исправь ошибку сборки»:
`coder/intent.cjs` hands every request mentioning «сборк/билд/CI/commit/push» to other flows (and «исправь сборку» is
build-repair's), so those words are elided from the handoff text; a test checks `isCoding(handoff)`.

## Limits
Up to 3 repositories × 40 runs, 6 Unity targets × 10 builds; one failure explained per answer; job logs read up to the
last 4 MB; legacy commit statuses are not read. Rerun only for runs shown in a card within the last hour.

## Verification
Stubs only: `node tests/ci-builds.cjs`; UI: `tests/ci-builds-ui.cjs`, `tests/github-settings-ui.cjs` (screenshots
`/tmp/petya-ci-builds.png`, `/tmp/petya-ci-builds-bottom.png`, `/tmp/petya-github-settings.png`). Not verified live:
real GitHub log redirect host, rerun response codes, Unity v2 `builds` / `log` paths and the `links.dashboard_url`
field (assumed from the v1 shape, which v2 mirrors for build targets and start build).
