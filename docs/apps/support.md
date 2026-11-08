# Player support (`support`)

«Поддержка игроков» shows the player support desk in the chat: open tickets against the SLA, what players complain
about, and a reply draft grounded in the ticket and the knowledge base, sent only after confirmation. Category:
`comms`. Code: `src/extensions/support/`.

## Sources (source-agnostic)

The app knows no help desk. Sources are extensions that declare a `support-source` in `extension.json`
(`"provides": {"support-source": "<file>.cjs"}`), read through `src/features/app-links.cjs` `scan` (the kind is listed
in its `REGISTRIES`) by `src/extensions/support/sources.cjs`. A source exports `ready`, `hint`, `tickets`, `ticket`,
`comments`, `reply` and optionally `articles` and `macros`, with tickets normalized to
`{id, subject, text, status, priority, created, updated, requester, tags, url, sla}` (see the header of
`sources.cjs`). Tickets of every connected source are shown together; a reply to a ticket number asks which desk when
more than one is connected.

- **Zendesk** (`zendesk.cjs`, the first source). Auth: agent email + API token, `Basic base64("{email}/token:{token}")`.
  - `GET /api/v2/search.json?query=type:ticket status<solved` and `…query=type:ticket created>{date}` (`sort_by=created_at`,
    `per_page=100`, up to 3 pages each, `include=tickets(users,slas)` for requester names and SLA targets); pagination
    links are followed only on the same `{subdomain}.zendesk.com` origin.
  - `GET /api/v2/tickets/{id}.json?include=users,slas`, `GET /api/v2/tickets/{id}/comments.json?include=users`.
  - `GET /api/v2/help_center/articles/search.json?query={subject}&per_page=5` — knowledge base articles for the draft.
  - `GET /api/v2/macros/active.json` — the only place a refund or compensation may come from.
  - Reply: `PUT /api/v2/tickets/{id}.json` with `{ticket:{comment:{body, public:true}}}`.
- Not implemented yet (endpoints to confirm against the vendors' docs when they are added):
- **Helpshift** (later): Helpshift REST API v1 (`https://api.helpshift.com/v1/{domain}/issues`, Basic auth with the API
  key) — issues with state and tags, messages, `POST …/issues/{id}/messages` for a reply; FAQ search for grounding.
- **Freshdesk** (later): `https://{domain}.freshdesk.com/api/v2/search/tickets?query="status:2"`, `GET /tickets/{id}/conversations`,
  `POST /tickets/{id}/reply`, solution articles search, canned responses as the macro equivalent; Basic auth with the
  API key.

## What it does

- Code counts: open (new / open / pending / hold), overdue against the SLA, new today (local midnight), urgent+high,
  tickets per day (created) stacked by their current status. Wait = since creation for a new ticket, since the last
  update otherwise. SLA: the earliest active Zendesk SLA target (`slas.policy_metrics[].breach_at`); without a policy,
  the «Цель SLA, часов» setting (24 by default). Only new and open tickets tick (pending waits for the player, hold
  for a third party).
- Topics asked by name («про оплату», «вход», «вылеты», «прогресс», «читеры», «реклама») filter the tickets by words.
- The local model only groups problems (at most 5); quotes are kept only when they are verbatim parts of a fetched
  subject or description. Without a model the problems are counted by topic words and quoted with the real sentence
  that contains the word.
- Reply («ответь на тикет 1234»): the ticket, its comments (internal notes marked), Help Center articles for the
  subject and active macros go to the model, which drafts in the player's language. Code then removes sentences that
  promise a refund, compensation or free items unless an active macro offers it (the card shows what was removed), and
  links the knowledge base: the article the model used, or the best match when the draft has no link.
- Card: tiles, the per-day chart, problems with counts and quotes and «Создать баг» (`k.links('task-tracker')`, only
  connected trackers), the open-ticket list (overdue first, then priority) with priority and status chips, the wait vs
  SLA bar and «Ответить». The reply card: ticket chips, the thread, articles, the removed-promise note, an editor with
  exactly the text to send, «Отправить», «Создать баг».
- Sending: only «Отправить» in the reply card posts, exactly the editor text, as a public comment. The card must be
  one Petya saved in this chat for that ticket and source; a sent card never sends again; duplicate clicks are refused.
  The result is a toast and a notification-center entry.

## Phrases

Trigger (when added): «что жалуются в поддержку», «что в поддержке», «тикеты про оплату за неделю», «ответь на тикет
1234», «сколько тикетов просрочено», «обращения игроков за сегодня», «что в Zendesk».

Near-misses that return null: «поддержка Unity», «как написать в поддержку Unity» (docs), «техподдержка Пети»,
«отзывы в сторах» (store-reviews), «поддержи меня», «поддерживает ли Unity формат webp», «создай тикет в Jira»,
«тикеты спринта в джире», «что такое Zendesk».

## Setup

«Настройки → Поддержка игроков»: Zendesk subdomain (`mystudio` from `mystudio.zendesk.com`), the agent's email and an
API token (Admin Center → Apps and integrations → APIs → Zendesk API → enable token access, add a token; stored as a
secret), and the default SLA target in hours. The agent needs access to the tickets and the right to post public
comments. Zendesk API tokens have no icon; Petya's icon cannot be set on the Zendesk side (AGENTS.md) — there is no
app registration for token access.

## Limits

- Zendesk search returns at most 1000 results per query; the app reads at most 300 open and 300 recent tickets.
- Wait time without an SLA policy is approximate (Zendesk's ticket list has no «last public reply» time).
- Requester names come from the sideloaded users; tickets of suspended users may show no name.

## Verified

Everything is tested with stubbed HTTP (`tests/support.cjs`) and rendered cards in the real Electron chat with
screenshots (`tests/support-ui.cjs` → `petya-support*.png` in the temp folder). No real Zendesk account was available:
the `include=tickets(users,slas)` sideload on search, the SLA metric shape and Help Center search with agent
credentials still need a live check.
