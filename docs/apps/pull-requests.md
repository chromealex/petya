# «Pull requests» (`pull-requests`, category dev)

GitHub pull requests in the chat, through the shared GitHub connection (`docs/apps/github.md`).

## Phrases
«какие PR ждут моего ревью», «что мне поревьюить», «мои пулл-реквесты», «открытые PR в owner/repo», «что в PR 123»,
«резюме пулл-реквеста» (asks which PR), «резюме PR owner/repo#12», a `github.com/…/pull/N` link.
Near-misses left to others: Jira «задачи на ревью», list follow-ups «какие из них на ревью», store reviews
(App Store / Google Play), «переведи … pull request», «сделай код-ревью» of pasted code, «что такое pull request».

## Data
- Lists: `GET /search/issues?q=is:open is:pr archived:false review-requested:@me | author:@me | repo:…` (sorted by
  update), then for up to 8 PRs: `GET /repos/{r}/pulls/{n}` (size), `GET /repos/{r}/commits/{sha}/check-runs`
  (failure > pending > success), `GET /repos/{r}/pulls/{n}/reviews` (latest review per reviewer; requested reviewers →
  «ждёт ревью»).
- One PR: the same plus `GET /repos/{r}/pulls/{n}/files?per_page=100`. The summary («резюме», «что в», «о чём») is
  written by the local model from the title, description, file list and a diff capped at 12 000 characters
  (3 000 per file); the diff is not stored in the chat. Without a model the card is shown without a summary and the
  answer says how to get one.
- Repository for a bare number: the only default repo, a choice among several (shared question panel), or a typed
  `owner/repo`.

## Card
List: author avatar (team photo when known), title link, `repo#n`, author, age, draft mark, a +/− bar scaled across the
list, checks chip, review chip, «Открыть», «Резюме». One PR: review state, checks chip and list (failed first),
summary bullets and a risk line, a files-changed bar chart (8 shown, the rest under «Ещё файлы»), «Открыть»,
«Резюме», «Оставить комментарий…». The comment box sends only after «Отправить» in a confirmation row
(`POST /repos/{r}/issues/{n}/comments` as the token owner), only for a PR shown in a card in the last 6 hours, with a
notification.

## Verification
Stubs only: `node tests/pull-requests.cjs`; UI: `tests/pull-requests-ui.cjs` (screenshots
`/tmp/petya-pull-requests.png`, `/tmp/petya-pull-requests-bottom.png`). Not verified live: search permissions of a
fine-grained token for `review-requested:@me` across organizations, check-runs of forks, the summary quality on a
real local model.
