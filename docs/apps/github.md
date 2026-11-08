# GitHub connection (`src/extensions/github/`)

Shared credential adapter for the «Сборки» (`ci-builds`) and «Pull requests» (`pull-requests`) apps. It has no chat
turn, no cards and no offer of its own.

- **Settings card «GitHub»**: one fine-grained personal access token (stored as the secret `githubToken`, never sent
  back to the renderer) and default repositories `owner/repo, owner/other` (`githubRepos`, normalized and validated on
  save). «Проверить» calls `GET /user` and checks that each default repository is reachable.
- **Repositories used by the apps**: the default list; when it is empty, the `origin` remote of the current project's
  git folder (via `gitWorkspace`) if it points to github.com; otherwise the app asks in the shared question panel.
- **Token permissions** (fine-grained, for the selected repositories): Actions — read and write (rerun), Pull requests —
  read and write (comments), Contents — read, Metadata — read. Review-request search (`review-requested:@me`) needs the
  token to be able to see the repositories.
- **Client** (`client.cjs`): base `https://api.github.com`, headers `Authorization: Bearer`, `Accept:
  application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`. JSON reads go through `s.request` (cancellation,
  request progress). Writes use `fetch` (empty 201 bodies are a success). Job logs: the API answers 302 with a signed
  URL, which is fetched without the token; huge logs keep the last 4 MB. 401/403/404/422/rate limits become readable
  Russian messages.
- The app cards («Сборки», «Pull requests») show the GitHub state and a «Настроить GitHub» button that adds and reveals
  this card (`extensionHost.open('github')`).

Verified with stubs only (`tests/ci-builds.cjs`, `tests/pull-requests.cjs`, `tests/github-settings-ui.cjs`); no real
token was available.
