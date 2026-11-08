# API client («API-клиент»)

Category: dev. Local only (requests go from this computer). Settings card: environments.

## What it does
HTTP requests from the chat with a response card:
- «дерни GET https://api.example.com/v1/users/42», «отправь POST на /login с телом {…}», headers as «с заголовком X-Trace: 1»
  or «Name: value» lines, a pasted `curl` command (`-X -H -d/--data-raw/--json -u -b -G -I --url`; `-k` is ignored with a note (TLS is always verified),
  file uploads and output options are listed as skipped);
- «проверь, отвечает ли staging», «какой статус у health-check прода»: GET to the environment's health path (default `/health`);
- «какие эндпоинты в openapi проекта»: finds `openapi|swagger|api(-docs).{json,yaml,yml}` in the project folders (depth 4,
  skipping node_modules/build folders) or a named path, reads JSON or YAML (`openapi.cjs`, a small YAML subset reader:
  no anchors/tags) and lists endpoints by tag; a row puts «дерни METHOD server/path» into the composer, never sends it.

Response card: status chip (`200 OK · 143 мс`, tone by class), a timing bar (waiting for the first byte vs download)
with size, redirects taken, collapsible response headers, the body as a JSON tree (two levels open, lazy below, search
that lists matching paths, «Текст», «Копировать JSON»), an image preview (`<img>` from a `data:` URL, SVG included, never
HTML), text, or a size note for binary. Actions: «Повторить», «Скопировать как curl» (secrets become `$AUTHORIZATION`-style
shell variables), «Сохранить в окружение» (origin + headers; secret-looking headers become secrets), a task-tracker link for 5xx.

## Environments
Settings: name, other names, base URL, health path, headers with a «секрет» switch. Plain data lives in
`httpClientEnvironments`; secret header values in `httpClientCredential`, a feature secret (`secrets:[…]`, encrypted by
the OS, blank in public settings, saved only as an internal setting). The form never gets a secret back; an empty secret
field keeps the stored value. Both settings are limited to 2000 characters by the settings store; saving more is refused
with a clear message. A secret header is attached only to requests to its environment's own origin. Environments are found
by their names and usual synonyms (прод/production/prod, стейдж/staging, дев/dev, тест/qa, локал/local). An unknown
environment («отвечает ли dev») gets a question for its address, which is saved and the request continues.

## Safety
- GET/HEAD run at once only to a host saved in an environment or written out in this very message; any other method, or
  a host from elsewhere, gets a card with the exact request (method, URL with secret query values masked, headers with
  secrets masked, body) and «Отправить». A confirmed request is sent once; a second press is refused. «Повторить» of a
  non-GET asks again in the card.
- Requests go through `node:http(s)` with `agent:false`: no browser session, no cookies, nothing of Petya's own. A request
  whose URL, headers or body contain a value of Petya's connection settings (tokens, OAuth credentials, also nested JSON)
  is refused.
- Limits: 20 s for the whole exchange, at most 5 redirects, followed only for GET/HEAD (303 becomes GET); a cross-origin
  hop drops Authorization/Proxy-Authorization/Cookie; a 307/308 after a write is shown, not followed. Responses are capped at
  5 MB (marked as cut); the card keeps at most 256 KB of text and 1.5 MB of image. TLS verification is never disabled.
- Pending/sent requests are kept in memory for an hour; after that or a restart the card offers «Повторить в чате», which
  goes through the same checks.

## Phrases
Own: «дерни GET https://…», «отправь POST на /login с телом {…}», «проверь, отвечает ли staging», «какой статус у health-check прода»,
«curl …» / «импортируй curl …», «что отдаёт https://…», «какие эндпоинты в openapi проекта».
Near-misses (null, no offer): «API Jira» (jira), «как работает REST», «запрос в поддержку», «отправь запрос в поддержку»,
«что такое GET запрос», «отвечает ли Маша», «дерни Олега», «покажи задачи в Jira», «проверь почту».

## Verified
Unit `node tests/http-client.cjs` against two local HTTP servers (redirect chains, cross-origin header drop, 307 after POST,
gzip, 5 MB cap, timeout, refused connection, cookies/User-Agent seen by the server), curl/chat parsing, YAML/JSON specs,
environment secrets bound to their origin, Petya tokens refused, confirm-once. UI `tests/http-client-ui.cjs` with screenshots
(`petya-http-client-response.png`, `-confirm`, `-image-error`, `-openapi`, `-settings`) sends the confirmed POST through the real
IPC to a local server. No real external API was called; HTTP/2-only servers, proxies (`HTTPS_PROXY` is not used) and very large
JSON trees are not verified live.
