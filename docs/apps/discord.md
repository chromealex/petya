# Discord (`discord`)

«Discord» shows what players say on the game's Discord server and lets the user answer or post an announcement after
an explicit confirmation. Category: `comms`. Code: `src/extensions/discord/`.

## What it does

- REST only, no gateway connection: Discord API v10 with a bot token (`Authorization: Bot <token>`).
  - `GET /channels/{id}/messages?limit=100&before=…` — recent messages of each chosen channel (at most 2 pages per
    channel, stops at the start of the window).
  - `GET /guilds/{guild}/threads/active` — active threads and forum posts of the chosen channels (at most 8, by last
    activity), each read with one `GET /channels/{thread}/messages` page. A forum channel is read only through its
    posts.
  - `GET /channels/{id}/messages/pins?limit=50` (falls back to the older `GET /channels/{id}/pins` on 404) — pinned
    messages, the only source for FAQ answers.
  - Settings use `GET /users/@me/guilds` and `GET /guilds/{guild}/channels` (text, announcement and forum channels).
- Code counts: player messages per channel and per day (bots and system messages excluded), unread per channel since
  the last digest (the newest message id per channel is kept in the `discordSeen` setting), bug reports per day by
  words. «Что нового» reads each channel since its last digest (3 days when there is none, at most 14); a named period
  («за неделю», «за 3 дня») reads that period.
- The local model (`app-kit.modelJSON`) only
  - groups messages into at most 6 themes with a kind (bug / question / feedback / praise / other) and a sentiment;
    quotes are kept only when they are verbatim parts of a fetched message; a theme without a checkable quote shows
    its first real message as a link, never invented text;
  - finds frequent questions and drafts an answer **only from the pinned messages**: the model must return the number
    of the pinned message it used; an answer without a real pinned message is dropped («В закреплённых сообщениях
    ответа нет»).
- Without a model: activity, unread counts, bug reports and questions grouped by shared words (real messages only),
  mood by words (marked as such).
- If most player messages come back with empty text and no attachments, the bot lacks the MESSAGE CONTENT intent: the
  card and the answer say how to switch it on, and nothing is analysed.
- Card: channel chips with unread counts (a chip asks «что нового в дискорде в #канал»), messages per day with the
  bug-report part marked, a mood meter (−1…1), themes with quotes and `discord.com/channels/…` message links, a bug
  theme or bug message → `k.links('task-tracker')` (only connected trackers are shown), FAQ with the draft, its pinned
  source and «Ответить в Discord», actions «Только баги» / «Частые вопросы» / «Сводка за неделю».

## Sending (only after confirmation)

- «Отправь в Discord в #announcements: текст» prepares a compose card with the channel chip and the exact text in an
  editor; only «Отправить» posts it (`POST /channels/{id}/messages` with `allowed_mentions: {parse: []}`, so
  `@everyone` or user tags in a draft never ping anyone). Messages over 2000 characters cannot be sent.
- A channel is never guessed (AGENTS.md «Slack context»): an explicitly named channel is used; otherwise the shared
  question panel asks with the chosen sendable channels (forums excluded) as options; an unknown channel name is asked
  too. Missing text is asked with an inline input.
- «Ответить в Discord» on a FAQ item replies in the question's own channel or thread to its latest message
  (`message_reference`). Only channels still chosen in settings and cards Petya saved in this chat are accepted; a sent
  card is never sent twice; duplicate clicks are refused.
- `share-message` provider (`share-message.cjs`, declared in `provides`): patch notes or announcements from other
  apps' cards become «Отправь в Discord: …» in the chat, i.e. the same flow (channel asked, card, «Отправить»).

## Phrases

Trigger (when added): «что нового в дискорде», «что пишут в Discord за неделю», «частые вопросы игроков», «баги из
дискорда», «баги из дискорда в #bug-reports», «отправь в дискорд: …», «напиши в дискорд в #announcements, что …».

Near-misses that return null: «дискорд не работает», «discord не запускается», «установи дискорд», «Discord Nitro»,
«как подключить discord.js», «напиши бота для дискорда на discord.py», «что нового в слаке», «что пишут в телеграме»,
«частые вопросы в поддержке», «что такое discord».

## Setup

1. Discord Developer Portal → New Application. Set Petya's icon (`assets/app-icon.png`) as the application icon
   (General Information) — required by AGENTS.md; Petya cannot set it for you.
2. Bot → Reset Token, paste it into «Настройки → Discord». On the same page switch on **Message Content Intent**
   (Privileged Gateway Intents). Message content is privileged for every bot: without it the API (REST included)
   returns empty `content` for other users' messages, except DMs, messages that mention the bot and its own messages.
   Bots in fewer than 100 servers switch it on themselves; verified bots need Discord's approval.
3. OAuth2 → URL Generator: scope `bot`, permissions View Channels, Read Message History, and for replies Send Messages
   and Send Messages in Threads (permissions integer `274877975552`). Open the URL and add the bot to the game server.
   No gateway intents other than Message Content are needed (no gateway connection at all).
4. In settings choose the server and tick up to 25 channels to read. Posting is possible only into ticked text or
   announcement channels.

The token is stored as a secret (`secrets: ['discordToken']`).

## Limits

- No live events: the digest is a snapshot read on request; unread counts are Petya's own marks, not the user's
  Discord read state (bots have none).
- At most 200 messages per channel, 8 active threads, 6 channels of pins per request; archived threads are not read.
- Rate limits (HTTP 429) are reported with the wait time; nothing retries automatically.

## Verified

Everything is tested with stubbed HTTP (`tests/discord.cjs`) and a rendered card in the real Electron chat with a
screenshot (`tests/discord-ui.cjs` → `petya-discord*.png` in the temp folder). No real bot token was available:
the endpoints, the pins response shape (`{items:[{pinned_at,message}],has_more}`) and the MESSAGE CONTENT behaviour over
REST still need a live check.
