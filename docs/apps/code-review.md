# Code review («Код-ревью»)

Category: dev. Directory: `src/extensions/code-review/`. No settings. Local review needs a chat project with a git
folder; a GitHub PR review needs «Pull requests» added and GitHub connected (shared `githubToken`).

Reviews the user's changes before a PR, or a GitHub PR. Code does everything that can be checked; the local model
only adds comments, and a comment is kept only when code can verify it.

## Phrases

Local changes: «проверь мои изменения», «ревью ветки перед PR», «посмотри diff», «глянь мой дифф», «сделай
код-ревью», «поревьюй мой код», «проверь мои правки перед пушем», «проверь незакоммиченные изменения»; a base branch:
«сделай ревью изменений относительно develop», «проверь мои изменения против release/1.4», «проверь ветку перед
мержем в main».

GitHub PR: «сделай ревью PR 123», «отревьюй PR #12», «код-ревью пулл-реквеста acme/game#12», «найди баги в PR 42»,
a PR link with «ревью».

Not triggered (tested): «что такое код-ревью», «как правильно проводить код-ревью?», «зачем нужно код-ревью» (concept
questions go to the model); «отзывы в App Store», «сделай ревью отзывов в Google Play» (store-reviews);
«перфоманс-ревью», «performance review для Маши», «ревью сотрудника», «годовое ревью» (people); «какие PR ждут моего
ревью», «мне на ревью что-нибудь есть?», «что в PR 123», «резюме PR 12» (pull-requests); «покажи diff», «покажи дифф»,
«проверь изменения в гите» (git); «сделай код-ревью: function …» with pasted code (skills); «задачи на ревью в Jira».

«посмотри diff» is claimed by this app when it is added (a review); «покажи diff» stays the git diff. When the app is
not added, both go to git as before.

## What is reviewed

- **Local** (`diff.cjs`): the repository of the chat's project (`s.gitWorkspace`; several → a question). Base branch:
  the one named, else `origin/HEAD`, else `main` / `master` / `develop` (local or `origin/`). On a feature branch:
  the working tree (committed, uncommitted and untracked files) against `git merge-base HEAD <base>`; on the base
  branch itself: uncommitted changes only. A named branch that does not exist → a question with the local branches.
- **GitHub PR**: `GET /repos/{owner}/{repo}/pulls/{n}` (head SHA, branches) and
  `GET /repos/{owner}/{repo}/pulls/{n}/files?per_page=100&page=1..3` (each file's `patch`). The repository comes from
  the request, «Pull requests» default repositories or the project's git remote; several → a question. Without
  «Pull requests» connected the answer is the offer card for it (or a question).
- **Skipped with a reason** (listed in the card, not reviewed): lock files (package-lock, yarn.lock, pnpm-lock,
  Cargo.lock, go.sum, Podfile.lock, …), vendored code (`node_modules/`, `vendor/`, `third_party/`, `Pods/`, Unity
  `Library/`), generated (`dist/`, `build/`, `*.min.js`, `*.map`, `*.g.cs`, `*.meta`, `*_pb2.py`, `*.pb.go`, …),
  binary files, deleted files, files GitHub sends without a patch.
- **Caps**: 40 files, 600 changed lines per file (the rest marked truncated), 3000 changed lines in total, 24 model
  calls (chunks of ~220 changed lines). Untracked files over 200 KB count as binary.

## Checks by code (`checks.cjs`)

On added lines only: secrets (AWS, GitHub, Slack, Google, Stripe and API keys, private keys, JWT, `password = "…"`
literals that are not placeholders or environment reads) → blocker/security, and the value is masked everywhere it is
shown; key files added (`.env`, `*.pem`, `id_rsa`, `credentials.json`, …) → blocker; debug leftovers (`debugger`,
`pdb.set_trace()`/`breakpoint()`, `binding.pry`, `var_dump`/`dd` → warning; `console.log`, `print(`,
`System.out.println` → nit; not in test files); `TODO/FIXME/XXX/HACK` in a comment without an issue reference →
nit; a file with more than 800 added lines → warning; a binary over 1 MB → warning (Git LFS); a changed source file
(≥ 5 added lines) without a changed test of the same name → warning when such a test exists in the repository
(«тест не обновлён»), nit when there is none.

## The model (`review.cjs`)

Per file (and per chunk), the hunks with new-file line numbers go to `kit.modelJSON` with a strict schema:
`{comments: [{line, quote, severity: blocker|warning|nit, category: bug|security|perf|style|test, comment, suggestion?}]}`
(max 8 per call, temperature 0.1). Code keeps a comment only when `line` is an **added** line whose text contains
`quote` (≥ 4 characters, whitespace-insensitive); a quote found within ±3 added lines moves the comment there;
everything else is dropped and counted («Отброшено …»). One comment per line and category; code checks win over the
model. Without a chosen model only the code checks run, and the reply says so.

## Card

`codeReview` → `renderCodeReview` (`review-cards.js`): status (есть блокеры / есть замечания / можно в PR), severity
chips that filter, files with +/−, a stacked bar of comments per file and counts (click scrolls to its comments),
skipped files with the reason, comments grouped by file with the severity, category, line, «проверка» for code
checks, the code excerpt (±2 lines, the line marked, light keyword/string/number/comment highlighting) and the
suggestion as a −/+ diff.

Actions: «Исправить» (`k.links('code-fix')`, the visible comments with file:line, severity and suggestion — only when
«Программист» is added); «Оставить комментарии в PR…» (PR reviews only) opens a confirmation row («Комментариев: N.
Отправить их в owner/repo#N одним ревью от вашего имени?») and «Отправить» posts **one** review:
`POST /repos/{owner}/{repo}/pulls/{n}/reviews` with `commit_id` (the reviewed head), `event: "COMMENT"`, line comments
`{path, line, side: "RIGHT", body}` (suggestions as GitHub ```` ```suggestion ```` blocks) and file-level comments in
the review body. The main process accepts only reviews it made itself in this company within 6 hours, once per
review; progress and the result go to the notification center (`code-review`). «Скрыть нит-пики» is remembered.

## Verified

Stubs only: `node tests/code-review.cjs` (a fixture git repository in a temp folder with a feature branch,
uncommitted and untracked files; a stubbed model; stubbed GitHub reads and the review write), and the Electron card
test `tests/code-review-ui.cjs` (screenshot `petya-code-review.png` / `-bottom.png` in the temp folder).

Needs live checking: a real local model's comment quality and how many it drops; GitHub accepting `line`/`side`
comments on large diffs (lines outside the diff hunks are refused by GitHub with 422 — all ours are added lines);
fine-grained token permission «Pull requests: read and write» for the review write.
