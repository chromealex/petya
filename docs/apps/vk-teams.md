# VK Teams (`vk-teams`)

«VK Teams» shows what is written in the VK Teams work chats where Petya's bot is, summarizes a thread, searches the
received messages, and sends a message or a reply after an explicit confirmation. Category `comms`. Code:
`src/extensions/vk-teams/`. It is a `messenger-source` and a `share-message` provider
(docs/foundations/messengers.md).

## The bot sees only its chats, from the moment it joined

The VK Teams Bot API has **no message history**: a bot receives events (`newMessage`, `editedMessage`,
`deleteMessage`, members joining/leaving, …) from a queue with `events/get`, and only for chats it is a member of and
private chats people started with it. So Petya keeps what the bot receives on this computer:
`<company data>/extensions/vk-teams/events.json` (folder 0700, file 0600; 31 days, at most 5000 messages; edits replace
the text, deletes remove the message; files are counted, not stored). The settings card and the digest say so; a
digest whose period starts before the earliest stored message notes the date. «Забыть полученные сообщения» (red trash,
asks first) deletes the file.

The queue is read on demand (at most every 30 s when a card asks) and every 5 minutes while the app is added and
connected (`setup` timer, stopped in `teardown`), so events are not lost between requests. A sync failure is
announced once in the notification center (`vk-teams-sync`), the recovery once too; a failing service with stored
messages still answers from them with a note. A new token (another bot) starts a new store. Do not connect the same bot
to another program: whoever asks the queue first takes the events.

## What it does

- **Digest** («что нового в VK Teams», «что писали в чате «Релизы» в вк тимс за неделю»): all chats of the bot or the
  named one (an unknown name is asked with the bot's chats as options). Counts per chat and per day, who wrote,
  threads, themes with checked verbatim quotes (model) or the latest messages (no model). The bot's own messages are
  not counted.
- **Thread summary** («перескажи тред #<msgId> в VK Teams», «перескажи тред про оплату в VK Teams»): a thread is a
  message and the replies to it (a reply to a reply belongs to the same root; a message with `parent_topic` belongs to
  that thread). Choosing among several threads, the summary with checked quotes and «Ответить в тред» work as in
  «Mattermost»; the reply is `messages/sendText` with `replyMsgId` = the root.
- **Search** («найди в VK Teams про сборку»): all words (light stems) in the received messages of the last 31 days.
- **Sending** («отправь в VK Teams в чат «Релизы»: текст», share-message from other cards): a chat named in the
  request among the bot's chats, otherwise the shared question panel with those chats; the compose card shows the chat
  and the exact text with the outgoing review; only «Отправить» sends (plain text, no parse mode). Once per card.

VK Teams messages have no web links, so quotes show author, chat and time without «↗».

## Phrases

Names: «VK Teams», «ВК Тимс», «вк teams», «вктимс», «Myteam» (the former name). Not this app: «ВКонтакте», «ВК» alone
(posts, groups, ads — marketing), «тимс» / Microsoft Teams («Microsoft Teams» keeps «тимс» and avoids «VK Teams»),
Slack, Telegram, Discord and Mattermost requests, building a bot («напиши бота для vk teams», @metabot questions), «vk
teams не работает», «установи vk teams», definitions, searches everywhere («Поиск по всему»).

## Setup

1. In VK Teams open **@metabot** → `/newbot`, set the name and the login, copy the token. Set Petya's icon with
   `/setuserpic` (`assets/app-icon.png`) — required by AGENTS.md; Petya cannot set it itself.
2. Settings → VK Teams: the token; for an on-premises VK Teams the Bot API address (`https://<server>/bot/v1`; empty =
   the cloud `https://api.internal.myteam.mail.ru/bot/v1`). «Сохранить и получить сообщения» reads the queue and lists
   the chats the bot has seen.
3. Add the bot to the work chats Petya should read. In private chats the bot receives only what is written to it, and
   it can write to a person only after that person wrote to it.

The token is a secret (`secrets: ['vkTeamsToken']`); the Bot API takes it as the `token` query parameter.

## API (VK Teams Bot API)

Reference: <https://teams.vk.com/botapi/> (could not be fetched from this environment; the calls were cross-checked
with the VK Teams team's official Go client <https://pkg.go.dev/github.com/mail-ru-im/bot-golang> (`GetEvents(lastEventID,
pollTime)`, `NewTextMessage(chatID, text)`, `GetChatInfo`, threads) and the event schema with the typed client
<https://docs.rs/crate/vkteams-bot/latest/source/src/api/types.rs>). Every call is `GET <api>/<method>?token=…`, every
answer JSON with `ok`.

| Call | Used for |
| --- | --- |
| `self/get` | the bot's id and nick (own messages, settings) |
| `events/get?lastEventId=&pollTime=0` | the queue after the last event id; batches until empty (20 rounds at most per sync) |
| `messages/sendText?chatId=&text=&replyMsgId=` | sending (only from a card) |

Events used: `newMessage` / `editedMessage` `{msgId, chat:{chatId, type:'private'|'group'|'channel', title}, from:
{userId, firstName, lastName}, text, timestamp, parts:[{type:'reply', payload:{message:{msgId}}}, {type:'file', …}],
parent_topic?}`, `deleteMessage` `{msgId, chat}`, `newChatMembers`, `leftChatMembers`, `pinnedMessage`,
`unpinnedMessage` (the chat becomes known).

## Verified

With a fake Bot API on localhost: `node tests/vk-teams.cjs` — routing and near-misses, the event store (new, edited,
deleted, reply threads, own messages, file mode), syncing after the last event id, a new token, the digest with
checked quotes and the since-joined note, threads, search, sending once with `replyMsgId`, failures with stored
messages, share-message, the messenger source, validation, the offers (ВКонтакте, Microsoft Teams). Cards:
`tests/vk-teams-ui.cjs` → `petya-vk-teams*.png`. Not verified live: a real bot's event payloads (especially
`parent_topic` for threads, `deleteMessage` naming, chat titles of private chats), how long VK Teams keeps unread events
in the queue, `pollTime=0`, the error texts of an invalid token or a chat the bot left, the on-premises address.
