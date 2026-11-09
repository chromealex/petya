# Mattermost (`mattermost`)

«Mattermost» shows what the team discussed in the chosen Mattermost channels, summarizes a thread, searches, and posts
a message or a thread reply after an explicit confirmation. Category `comms`. Code: `src/extensions/mattermost/`.
It is a `messenger-source` and a `share-message` provider (docs/foundations/messengers.md).

## What it does

- **Digest** («что нового в Mattermost», «что обсуждали в канале dev в маттермосте за неделю», «mattermost за
  сегодня»): posts of the chosen channels (or the one named: `~dev`, «в канале dev»; an unknown name is asked with the
  chosen channels as options) for the named period (default one day, at most 31). Code counts messages per channel
  and per day, who wrote (with their status: online / away / do not disturb / offline), threads active in the window
  (most replies first, «Пересказать»). The local model groups messages into at most 6 themes; each quote is checked
  to be a verbatim part of a post, otherwise the theme shows the real post. Without a model: the latest posts.
  System posts (joins, header changes), deleted posts and bots are not counted.
- **Thread summary** («перескажи тред <permalink> в Mattermost», «перескажи тред про релиз в Mattermost»): a permalink
  of this server (`<server>/<team>/pl/<post id>`, a reply's link opens its root thread), or threads with replies of
  the last 7 days whose root contains the words — one is summarized at once, several are offered as choices. The
  model writes 1–2 sentences and up to 6 points (decision / question / task / point), each tied to a real post with a
  checked quote. The card shows the root, points, the last replies, «Ответить в тред» (editor with
  `k.outgoingReview`, posts `root_id`) and the thread to the task tracker (`k.links('task-tracker')`).
- **Search** («найди в Mattermost сообщения про оплату», «где обсуждали оплату в маттермосте»): the server's search in
  the teams of the chosen channels, results only from chosen channels, words marked.
- **Sending** («отправь в Mattermost в ~dev: текст», «напиши в маттермост, что …», share-message from other cards):
  a channel named in the request among the chosen ones, otherwise the shared question panel with the chosen channels
  (never the first or last by default); missing text is asked inline. The compose card shows the channel chip and the
  exact text in an editor with the outgoing review; only «Отправить» posts. A card posts once; duplicate clicks are
  refused; a channel unticked since then is refused.

## Phrases

Trigger (when added): the examples above, «что пишут в маттермосте», «Mattermost за неделю».

Near-misses that return null: «что нового в слаке», «что пишут в телеграме», «что нового в дискорде», «что нового в
VK Teams», «напиши плагин для mattermost», «webhook в mattermost», «mattermost не работает», «установи / разверни
mattermost», «что такое mattermost», «как настроить mattermost», «найди везде про оплату в маттермосте» and «ответь по
найденному …» («Поиск по всему»), a request that names another messenger too.

## Setup

1. In Mattermost: avatar → Profile → Security → Personal Access Tokens → Create Token. If the item is missing, a
   system admin enables personal access tokens (System Console → Integrations → Integration Management → Enable
   Personal Access Tokens) and allows them for the account (System Console → Users → … → Manage Roles).
2. Settings → Mattermost: the server address (`https://…`; `http` only for `localhost`), the token, «Сохранить и
   загрузить каналы», then tick up to 25 channels (public and private channels of the user's teams; direct messages
   are not offered).
3. The token acts as the user: Petya sees only what the user sees and posts as the user. A personal token is not an
   integration with its own profile, so there is no icon to set on the service side (AGENTS.md «Petya's icon»): the
   posts carry the user's own avatar.

The token is a secret (`secrets: ['mattermostToken']`).

## API (Mattermost REST API v4)

Reference: <https://api.mattermost.com/> (API v4), personal access tokens:
<https://developers.mattermost.com/integrate/reference/personal-access-token/>. Auth: `Authorization: Bearer <token>`.

| Call | Used for |
| --- | --- |
| `GET /api/v4/users/me` | settings: whose token it is |
| `GET /api/v4/users/me/teams`, `GET /api/v4/users/me/teams/{team_id}/channels` | settings: teams and channels (types `O`, `P`) |
| `GET /api/v4/channels/{channel_id}/posts?page=&per_page=200` | digest: posts newest first, at most 3 pages, stops at the window's start |
| `GET /api/v4/posts/{post_id}`, `GET /api/v4/posts/{post_id}/thread` | thread by link (a reply's `root_id`), the thread's posts |
| `POST /api/v4/teams/{team_id}/posts/search` `{terms, is_or_search:false, include_deleted_channels:false, time_zone_offset:0, page:0, per_page}` | search |
| `POST /api/v4/users/ids` | names of authors |
| `POST /api/v4/users/status/ids` | statuses of authors |
| `POST /api/v4/posts` `{channel_id, message, root_id?}` | sending (only from a card) |

Answers are `PostList` `{order, posts}`; links are permalinks `<server>/<team name>/pl/<post id>`. Errors: 401 token,
403 access, 404 address/channel, 413 too long, 429 rate limit (with the wait), 501 feature off on the server. The
maximum post length is 16383 characters (older servers: 4000 — the server's 413/400 is shown).

## Limits

- Up to 600 posts per channel per digest; at most 25 chosen channels; search covers teams of chosen channels (at most
  5) and shows only chosen channels' results.
- Collapsed reply threads, reactions, files' content and edits history are not read.

## Verified

With a fake Mattermost server on localhost (real v4 paths, Bearer token, PostList answers): `node tests/mattermost.cjs`
— routing, the digest with names, statuses, threads and checked quotes, named/unknown channels, thread by link and
choice, search limited to chosen channels, sending only from the card once, thread replies, share-message, the
messenger source, errors, validation, the offer. Cards: `tests/mattermost-ui.cjs` → `petya-mattermost*.png` in the
temp folder. Not verified live: a real server's answers (pagination of `posts`, search syntax and ranking, statuses of
bots), the exact error ids of recent server versions, and very old servers (4000-character limit).
