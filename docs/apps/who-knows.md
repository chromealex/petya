# Who knows («Кто знает»)

Category: team. Directory: `src/extensions/who-knows/`. No settings, no service of its own.

Answers «who in the team knows this subject» with a ranked list of people and the evidence behind every point.
Sources, all read-only:

- **Code** — the git history of the project's repositories (the folders attached to the chat's project, found by
  the shared `GitWorkspace`): tracked files whose path matches the subject (`ls-files`; files matching more subject
  words win, «UI магазина» prefers `UI/ShopWindow.cs` to any UI file), files that use a code identifier
  (`git grep -l -F`), then `git log --no-merges --numstat` over those files for the last three years, plus commits
  whose message names the subject (`--grep`, fixed strings). `%aN`/`%aE` respect `.mailmap`.
- **Jira** — issues that mention the subject (`POST /rest/api/3/search/jql`, `text ~ "…"` with a trailing wildcard
  for Russian stems, limited to the projects chosen in Jira settings, updated in the last two years): assignee,
  reporter and commenters (`fields=comment`). Through the shared Jira connection (`s.workspace.api`).
- **Slack** — messages Petya already keeps in its context memory (`src/extensions/slack/sync.cjs`); no new API calls or scopes.
- **Meetings** — recorded meeting speech with a speaker name (`meeting-talk.cjs`); the user's own microphone is not
  counted.
- **Messengers** (optional) — every connected `messenger-source` that can search and does not read Petya's memory
  (Mattermost, VK Teams; [messengers.md](../foundations/messengers.md)): the subject is searched over 31 days (≤ 200
  messages, 8 s per messenger); a message whose text matches the subject's words gives its author (by name, matched to
  «Команда») a point; bots are skipped. Each messenger is its own chip on the card («ошибка» with the reason when it
  fails). With no messenger connected nothing changes: no chip, no `chat` part, the same score.

People are matched to «Команда» by email (also emails of linked accounts), Jira account ID, Slack user ID and by
name in either alphabet (`team-match.cjs`); identities that match nobody stay as separate people marked
«не в «Команде»».

## Score (shown on the card under «Как считаются баллы»)

- Code: per commit in the subject's files `1 + lg(1 + changed lines)`; a commit found only by its message counts 1.
- Jira: assignee 3, reporter 1, each comment 1 (up to 3 per issue).
- Slack and meetings: 1 per message or speech segment (up to 3 per thread or meeting).
- Messengers: 1 per message on the subject (up to 3 per thread); the thread is the evidence link.
- Every point is multiplied by recency: half the weight every 120 days.

The total is the sum of the parts as the card shows them (each part rounded to 0.1 first); the card shows the split as a stacked bar. «Кто последний трогал …» ranks by
the latest commit instead and names it in the reply.

The local model only turns the subject into extra search words (English names as code writes them); its words are
filtered to safe characters and never add a person by themselves. Without a model, a small built-in dictionary of
game-development words (сеть → net/network, магазин → shop/store/iap, инвентарь → inventory, …) and the words of the
subject are used.

## Phrases

Triggers (app added): «Кто разбирается в сетевом коде?», «к кому идти по магазину», «кого спросить про
матчмейкинг», «кто у нас лучше всех знает про сохранения», «кто знает, как устроены сохранения», «кто занимается
сетевым кодом», «кто писал PlayerController», «кто делал UI магазина», «кто последний трогал инвентарь», «кто
последним менял Assets/Scripts/Net/Client.cs».

Not triggered: «кто ты», «кто знает, когда релиз» / «кто знает где ключи» (a fact, not a person), «знаешь ли ты…»,
«кто написал Войну и мир» (perfective «написал/сделал/автор» needs code or a game system as the object), «кто
работает завтра», «кто тестировщик» (roles stay with Petya's team answers), «заполни команду».

## Card

Sources strip (Git repo, Jira projects, Slack, meetings: count, «ничего», «нет» or «ошибка» with the reason as a
tooltip; Git and Jira link to the repository and the JQL search). Per person: rank, avatar (team photo or
initials), name and role, score, stacked score bar by source with numbers, «Основания» (collapsed): files (link to
the file at HEAD on GitHub/GitLab/Bitbucket, otherwise «Показать в папке» through the app's `reveal` IPC, limited to
the project's repositories), commits (links), Jira issues (links, roles), Slack messages (permalinks), meetings
(title, date, quote). Actions for people in «Команда»: «Написать в Slack» (`k.links('share-message')` — the Slack
flow asks for the channel and shows the text before sending) and «Пригласить на встречу» when the calendar app is
added (puts «Поставь встречу с … по теме «…»» into the composer for the time). Card actions: «Кто последним
трогал», «Спросить про другую тему».

When none of the sources is available the reply is a question saying what to connect.

## Limits

- Up to three repositories per project, 250 matched files, 600 commits by files and 200 by message, three years.
- Jira text search depends on Jira's own indexing; Russian stems use a trailing wildcard.
- Slack and meetings only cover what Petya already stored (context retention days).
- Meetings without speaker names cannot credit anyone.

## Verified

- With stubs/fixtures (`node tests/who-knows.cjs`): a real git repository created in a temp folder (authors, dates,
  renames, a Cyrillic author name, an identifier used in another file, a GitHub remote), a stubbed Jira search
  (`s.workspace.api`), Slack and meeting memory items, team matching, scores, ranking, last-touch mode, Jira failure,
  model words, no sources → question; messengers stubbed through the registry (points, evidence, a failing one, a
  memory-only one skipped, only a messenger connected, none connected → unchanged card).
- UI (`tests/who-knows-ui.cjs`, screenshots `petya-who-knows.png`, `petya-who-knows-list.png`,
  `petya-who-knows-chat.png` in the temp folder).
- Not verified live: Jira Cloud `search/jql` with real data and `text ~` on Cyrillic, Slack share flow end to end,
  calendar flow from the composer.
