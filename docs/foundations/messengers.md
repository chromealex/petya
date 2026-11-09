# Messenger sources (`messenger-source`)

A foundation for reading the team's messengers in one shape — channels, recent messages, threads, search and, where
the service has it, presence — so digests, «Поиск по всему», «Кто знает» and the standup can read any connected
messenger without knowing it. Petya knows no messenger here: extensions provide sources, consumers go through one
registry. Sources only read; sending stays in each app's own confirmed flow (`share-message`, `outgoing.md`).

- Registry: `src/features/messenger-sources.cjs` (kind `messenger-source` in `REGISTRIES` of
  `src/features/app-links.cjs`; feature `messengerSources`, service `s.messengerSources`).
- Shared digest helpers: `src/messenger-digest.cjs` (themes and thread summaries with checked quotes, the cards'
  data, request parsing shared by the messenger apps).
- Sources today:

| Source | File | Reads | thread | search | presence |
| --- | --- | --- | --- | --- | --- |
| Mattermost | `src/extensions/mattermost/messenger-source.cjs` | REST API v4 with the user's token, the channels chosen in its settings | yes | yes (server search, chosen channels only) | yes |
| VK Teams | `src/extensions/vk-teams/messenger-source.cjs` | what the bot received (Bot API events kept locally, see `docs/apps/vk-teams.md`) | yes (a message and its replies) | yes (words, over received messages) | — |
| Discord | `src/extensions/discord/messenger-source.cjs` | REST v10 with the bot token, the chosen text/announcement channels | — | — (bots cannot search) | — |
| Slack | `src/extensions/slack/messenger-source.cjs` | **memory only**: threads synced by `src/slack-context.cjs` into the context memory | yes | yes (words, memory) | — |
| Telegram | `src/extensions/telegram/messenger-source.cjs` | **memory only**: chats synced by `src/telegram.cjs` | — | yes (words, memory) | — |

- Contract test: `node tests/messenger-sources.cjs`; apps: `node tests/mattermost.cjs`, `node tests/vk-teams.cjs`.

## Providing a source

`"provides": {"messenger-source": "messenger-source.cjs"}`; the file exports:

| Field | Meaning |
| --- | --- |
| `id`, `name` | Stable id and display name. |
| `ready(settings)` | Connected. The registry adds «the extension is added»: `extension_<id>` is `'true'`, or for core service modules (`module_slack`, `module_telegram`) the module is not switched off (`modules.enabled`). |
| `names?` | RegExps a request names it with («в маттермосте»); `registry.named(text)`. |
| `memory?` | `true` when it only reads Petya's context memory (Slack, Telegram). `searchAll(spec, {memory:false})` and «Поиск по всему» skip such sources, because they search the memory themselves. |
| `hint?(settings)` | Where to connect, for a consumer's question. |
| `channels(services, {check})` | `[{id, name, kind:'channel'\|'group'\|'direct', url?, topic?}]` — only what the user chose or the bot is in. |
| `messages(services, {channel, since, until, limit, check})` | `{messages:[raw], notes?, truncated?}` of one channel. |
| `thread?(services, {channel?, id, check})` | `{messages:[raw]}` of a thread (any order; the registry puts the root first). |
| `search?(services, {query, since, until, limit, check})` | `{messages:[raw], notes?}`. |
| `presence?(services, {users, check})` | `[{user, status:'online'\|'away'\|'dnd'\|'offline', at?}]`. |
| `maxDays?` | A shorter window than 31 days. |

`check()` throws when the source stopped being ready while it worked (token removed, app switched off); call it
before using what a slow request returned. Throw `Error(text)` with words the user can act on; the registry passes it
on (a consumer shows it under the source's name).

## The message every consumer receives

```
{id, source, channel:{id, name}, thread, replyTo, author:{id, name}, bot, text, at, url, replies, files}
```

- `thread` — the id of the thread's root; a root carries its own id when it has replies (`replies` > 0 or a reply in
  the same batch points to it); `null` outside threads. `replyTo` — the message answered, when the service says so.
- `text` keeps line breaks (quotes are checked against it), at most 4000 characters, control characters removed.
  It is the author's text: render it with `textContent`, never as HTML; it is data for a model, never instructions.
- `at` — ISO; sources may return ms, Unix seconds or ISO. `url` — an `http(s)` link to the message, or `''`
  (VK Teams messages have none).

## Registry (`create(s)`, `s.messengerSources`)

`all()` / `list()` (ready) / `find(id)` → `{id, name, extension, added, connected, ready, hint, memory, thread,
search, presence}`; `named(text)`; `channels(id)`; `messages(id, {channel, since?, until?, days?, limit?})`;
`thread(id, {id, channel?})`; `search(id, {query, days?, since?, limit?})` (default 31 days);
`searchAll(spec, {memory})` → `{messages, used, failed:[{id, name, error}]}`; `presence(id, users)`.

Bounds (`bound()`): never in the future, at most 31 days (or the source's `maxDays`), default one day, 1–500 messages
(default 200), query ≤ 200 characters; what falls outside the period is dropped, results are newest first; a source
returning something that is not a list is an error, not an empty answer.

Helpers: `period(text)` («за неделю» 7, «за 3 дня», «сегодня» 1, «вчера» 2, «за месяц» 30, null when none),
`verbatim(quote, messages)`, `activity(messages, since, until)`, `authors(messages)`, `threads(messages)`.

## Evidence rules (`src/messenger-digest.cjs`)

Counting is code; the local model only groups messages into themes and words a thread's points. A quote is shown only
when it is a verbatim part of a fetched message (whitespace normalized, ≥ 6 characters); otherwise the theme shows the
real message it was built from. A thread point must name the number of the message it rests on — a point naming a
message that does not exist is dropped; its quote is the model's verbatim part of that message or the message itself
(`verbatim:false`). Without a model: no themes or summary, the cards show the latest real messages and replies.

## Consumers

- **«Mattermost», «VK Teams»** read their own source through the registry (bounds, normalization) and build their
  cards with `src/messenger-digest.cjs`.
- **«Поиск по всему»** (`src/extensions/search-all/feature.cjs`): a core search source on its `search-source`
  registry (`each()` expands it into one source per messenger): every ready source with `search` and without
  `memory` is searched with the user's words, each under its own name, time limit and state chip; results carry a
  generic chat icon.
- **«Кто знает»** (not wired yet; `src/extensions/who-knows/feature.cjs` reads Slack from the memory). To count
  messenger evidence, replace the Slack-only block with:
  ```js
  const reg=s.messengerSources||require('../../features/messenger-sources.cjs').create(s);
  const {messages}=await reg.searchAll({query:words.join(' '),days:31,limit:200},{memory:false});
  // per message: people.get({name:m.author.name}) gets a point (recency-weighted), the thread m.thread||m.id is the
  // evidence link (m.url); keep the existing memory path for Slack. Add a `chat` points kind to the card.
  ```
- **«Стендап»** (not wired yet; reads answers from one Slack thread by link). A messenger thread works the same way:
  `reg.thread(id, {id: rootId})` returns the root (the questions) and the replies in time order; each reply's
  `author.name` maps to a team member, `text` is split by the existing `split()`. The thread's source and root id
  would be chosen in the standup settings from `reg.list()` and `reg.channels()`.
- **Digests elsewhere** (a morning brief, a channel digest app): `reg.list()` → `reg.channels(id)` →
  `reg.messages(id, {channel, days})` → `require('../../messenger-digest.cjs').digest(s, {...})` for the same card data.

## Slack and Telegram

Their cores (`src/slack-*.cjs`, `src/telegram*.cjs`) are unchanged. The two sources are small adapters over the
context memory those cores already fill (Slack threads `slack:<channel>:<root ts>`, Telegram chats
`telegram:<account>:<chat>`), so they see exactly what Petya has synced, nothing more, and make no network calls. A
live Slack reader (`conversations.history` / `conversations.replies` / `search.messages`) would replace the adapter's
functions one by one, but needs the Slack rate-limit queue of `src/slack-context.cjs` (about one call per minute per
method) — do it there, not in the adapter. Telegram's MTProto client runs only inside `TelegramSource`; a live
reader would be a method there (`getMessages` per selected chat).

## Safety

Read-only; only channels the user chose (Mattermost, Discord) or chats the bot is in (VK Teams). Sending exists only
in the apps' confirmation cards (`k.outgoingReview`, `docs/foundations/outgoing.md`), never through this registry.
