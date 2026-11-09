# Notion (`src/extensions/notion`)

The Notion service module (`"setting": "module_notion"`, `"service": "notion"`, quick start 30 in «С чего начать»).
It used to be part of Petya's core (`src/notion.cjs`, the card in `src/ui/index.html` and `src/ui/connections.js`, the
check in `src/connections.cjs`, the source in `src/workspace.cjs`); the settings keys are the same (`notionToken`,
`notionCredential`, `module_notion`), so a saved connection keeps working and nothing is migrated.

| File | What |
|---|---|
| `client.cjs` | Notion API `2025-09-03`: `POST /v1/search` (pages by title, two pages of 50 per term, up to four terms), `GET /v1/blocks/{id}/children` (text in order, headings as `#`, list items as `-`, nested blocks; a preview of 8 calls / 18 000 characters, the whole page up to 400 calls / 1.5 M characters). Calls are spaced 350 ms apart. |
| `doc-source.cjs` | Notion as a documentation source of the task decomposition (`doc-source`, `src/features/doc-sources.cjs`): `search` → docs with the start of each page (`more` when there is more), `full` reads the chosen page whole, `note` «Notion: поиск по названиям страниц…», `watch` the Notion settings. One client per request function, so calls stay spaced. |
| `connection-check.cjs` | `connection-check` (`src/features/connection-checks.cjs`): the card saves only `notionToken` and checks one page search; the guide link is `https://www.notion.so/my-integrations`. |
| `settings.js` | The card in «Настройки» → «Сервисы» (after Slack): «Подключить Notion» through Petya's OAuth broker (`src/service-oauth.cjs`, shared with Slack and Asana), the manual token with step-by-step help, «Сохранить и проверить». Built with Petya's shared service card (`window.addConnectionCard`). |
| `feature.cjs` | Settings: defaults, secrets, `publicFlags` (`hasNotionOAuth`, `hasNotionToken`), `validate` (a token typed while the browser sign-in is saved is refused). |

Other apps use Notion through this folder: «Вики-автор» publishes with `client.cjs` (the same client as the
decomposition when it runs in Petya), «Поиск по всему» and «Онбординг» read the documentation through the workspace.

Requests to `api.notion.com` go through Petya's client, which signs them with the broker credential when there is one
(`src/main.cjs` `request`), otherwise the token is sent by the client.

Tests: `tests/notion.cjs` (search, nested text, truncation, unreadable pages, the source next to Confluence, the plan),
`tests/decompose-large.cjs` (a long page read in full), `tests/connections.cjs` (the check), `tests/core-notion-guard.cjs`
(the core names no Notion outside the service-module tables and word lists), the card in `tests/smoke.cjs`. Notion is
verified with stubbed responses; a live workspace is not.
