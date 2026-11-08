# Grafana («Grafana»)

Category: analytics. Directory: `src/extensions/grafana/`. A generic connector to any Grafana (self-hosted or
Grafana Cloud), read-only. Nothing in it is specific to one company.

Shows Grafana dashboards in the chat, drawn natively from the panels' query results — Grafana's HTML is never
rendered, and no images are used unless the optional panel pictures are enabled (below). It is also a
`metrics-source` for «Метрики игры»: panels the user maps to DAU, new users, revenue, ARPDAU and retention
D1/D7/D30 appear on the metrics card as the «Grafana» source next to AppMetrica.

## Phrases

- «какие дашборды есть» — the dashboard list grouped by folder (the default folder first); a click on a title asks
  for that dashboard, «↗» opens it in Grafana.
- «найди дашборд про ретеншн» — a search over titles, tags and folders. Grafana's own `query` matches a title
  substring only and titles are often English, so the list is ranked locally: Russian word stems plus a small
  glossary of game-analytics words (лиги → league, ретеншн → retention, выручка → revenue, …). One hit opens it,
  several are listed.
- «что на дашборде лиг», «покажи дашборд «Leagues» за неделю», «что в Grafana по матчмейкингу» — one dashboard.
- «покажи лиги за неделю» — without the words «дашборд»/«Grafana» only when Grafana is connected, the request is a
  show verb plus 1–3 words that are no neighbour's subject (DAU, задачи, крэши, отзывы, билды, календарь, …), and a
  dashboard title matches every word.
- A pasted dashboard or panel link, e.g.
  `https://dashboards.wombyte.net/d/c9e4b7f6-9caf-428d-a93f-578ec4be556f/leagues?orgId=1&from=now-7d&to=now&var-league=gold&viewPanel=4`
  (this real URL is only an example and a test fixture): the uid, `viewPanel` (also Grafana 11's `panel-4` form and
  `/d-solo/…?panelId=`), `from`/`to` (relative or epoch ms), every `var-x` (repeated for multi-values) and `orgId`
  are respected. A link to another Grafana host than the connected one gets a question; `/goto/…` short links are
  not resolved (Petya asks for the full link).
- «DAU в графане» — when DAU is mapped (below), that panel of its dashboard.
- Periods: «за сутки / неделю / месяц / квартал / год», «за N часов/дней/недель/месяцев», «вчера», «сегодня».
  An option of a dashboard variable named in the request («… для сервера asia») is selected.

Near-misses that are not this app: «графана не открывается», «не могу войти в графану» (support talk), «нарисуй
график» (charts), «как настроить дашборд в графане» (how-to), «создай/измени дашборд» (answered: Petya only reads
Grafana), PromQL or «Prometheus» without Grafana — out of scope: Petya has no Prometheus connection and runs
queries only as parts of Grafana panels. Game metrics words alone («DAU за неделю», «ретеншн D1 D7 D30») stay
«Метрики игры»'s, also in offers.

## The card

Title with folder (a link to the dashboard with the shown range and variables), status chip (panel count, or how
many failed), range chips «Сутки / Неделя / Месяц» (the active one pressed; a link's or a panel's custom range is
shown as its own chip) that ask the chat again — for a card from a link the link is re-sent with the new
`from`/`to`, so the panel and variables are kept — and the variable values (set ones highlighted). Then a grid of up
to 8 panels in Grafana's reading order:

- `timeseries` / `graph` → inline SVG lines, multi-series with a legend that toggles series, a hover crosshair with
  every series' value at that time, threshold lines when the panel shows them, series colors from `fixed` color
  overrides (palette colors too close to a fixed one are skipped).
- `stat` / `singlestat` → tiles; the value is the panel's reducer (`reduceOptions.calcs[0]`: lastNotNull, mean,
  sum, max, …), colored by the panel's thresholds (absolute or percentage; Grafana's named colors mapped to hex),
  value mappings applied, and a sparkline when `graphMode` is `area`.
- `gauge` → a tile with a meter from min to max and threshold marks.
- `bargauge`, `barchart`, `piechart` → horizontal bars (pie charts also show shares).
- `table` → `k.table` with each column's unit and decimals (overrides by name), the panel's `sortBy`, at most 20
  rows shown («Показано 20 из N»).
- Anything else (text, logs, heatmap, node graph, geomap, …) → the title, «Тип панели … не рисуется в чате» and
  «Открыть в Grafana». The text panel's HTML is never shown.

Every panel has «↗ Открыть в Grafana» (`viewPanel` link). Units and decimals come from `fieldConfig` (defaults and
overrides by name / regex / refId): percent, percentunit, short/none (compact numbers), currencies, bytes, bit/byte
rates, durations (ms/s/m/h/d), req/s, ops/s, °C, `suffix:` / `prefix:` custom units; others are appended as written.
Numbers and dates follow `window.petyaLocale`. Actions: «Открыть в Grafana», «Обновить» (asks again) and «Отправить
в Slack» (`k.links('share-message')`, only when a share provider is connected; the Slack flow confirms). A
dashboard with more than 8 panels says how many more are in Grafana.

### What runs

1. `GET /api/dashboards/uid/<uid>` — the dashboard JSON and folder.
2. Panels flattened: rows, collapsed rows (their own `panels`), the pre-5.0 `rows` schema; library panels
   (`libraryPanel.uid` without targets) are replaced by `GET /api/library-elements/<uid>` → `result.model`, keeping
   the dashboard's id and position.
3. Variables: a link's `var-x`, else an option named in the request, else the saved current value; `$__all` becomes
   the `allValue` or every option; constants and datasource variables are resolved. `$x`, `${x}`, `${x:format}` and
   `[[x]]` are interpolated in every string of the targets, with Grafana's formats (csv, pipe, regex, sqlstring,
   singlequote, doublequote, json, lucene, glob, …) and the datasources' defaults: a single value as written; several
   values as a regex group for Prometheus/Loki, a quoted list for SQL datasources, an OR for Elasticsearch, a glob
   otherwise. Backend macros (`$__interval`, `$__rate_interval`, `$__timeFilter`, `$__range`) are left to Grafana;
   `$__from` / `$__to` are filled in.
4. Time: the link's or the request's range, else the dashboard's `time`; a panel's `timeFrom` («7d» = the last 7
   days) and `timeShift` apply. `intervalMs` is the range over `maxDataPoints` (300, or the panel's) rounded to
   Grafana's nice steps, never below the panel's min interval.
5. `POST /api/ds/query` with `{from, to, queries}`: one request per datasource of the panel (a «-- Mixed --» panel is
   split by its targets' datasources; with server-side expressions everything goes in one request). Legacy
   datasource names and the default datasource are resolved through `GET /api/frontend/settings`. Hidden targets
   are not sent. At most 4 panels are queried at once.
6. Frames: `results[refId].frames[].schema.fields` + `data.values`; display names from `displayNameFromDS` /
   `displayName` / labels; SQL long frames (time, string, value) are pivoted into one series per string value. A
   refId's error stays with its panel; other panels still draw. Panel `transformations` are not applied — the panel
   says so.

Errors in words: 401 (token), 403 (the service account lacks access to the folder or datasource), 404, a redirect
(usually a missing path prefix sending to the login page), a timeout (15 s per request), the host unreachable
(address or VPN), a non-JSON answer (not the API). If every panel fails the same way, the card is replaced by
that one error.

### Optional panel pictures

Settings → «Картинки панелей …» (off by default). Then an unsupported panel gets «Картинка панели», which fetches
`GET /render/d-solo/<uid>/<slug>?panelId=&from=&to=&width=600&height=280&theme=dark` with the same token and shows
the PNG. This needs the Grafana Image Renderer plugin on the server; without it the button reports that. Pictures
are never used for panels Petya draws itself.

## Setup

Settings → «Grafana»:

1. Address: `https://grafana.example.com` or with a path prefix `https://corp.example.com/grafana`. Pasting any
   dashboard link works: everything from `/d/…` (or another Grafana route) on is cut, the prefix stays. https only,
   except `http://localhost` / `127.0.0.1` for a local Grafana. No login in the URL.
2. Service account token: Grafana → Administration → Users and access → Service accounts → «Add service account»,
   role **Viewer** → «Add service account token» (`glsa_…`). Give the account (or its team) view access to the
   folders Petya should see; Viewer can read dashboards and run their panels' queries, nothing else. The token is a
   secret setting (`grafanaToken`).
3. Default folder (optional): its dashboards are listed first and win ties.
4. «Сохранить и проверить»: `GET /api/health` (version, no auth) and an authorized `GET /api/search?type=dash-db&limit=1`;
   the status shows the version and the number of dashboards.

### «Сопоставить панели с метриками»

Petya reads the dashboards (default folder and KPI-looking ones first, at most 25), scores every drawable panel and
each named series of multi-query panels (legend «D1», «D7», …) for each metric by its title, legend, description,
query text and unit (currency → revenue/ARPDAU, percent → retention; MAU/WAU/per-user excluded from DAU/revenue;
a KPI-looking dashboard wins a tie), and proposes the best. With a local model chosen, the model may pick another
one among each metric's top candidates (an answer outside the list is ignored). Each metric gets a select with the
candidates and «— не сопоставлять —»; nothing is saved until «Сохранить сопоставление». Stored as `grafanaMetricMap`
(`{metric:{d: dashboard uid, p: panel id, f: series, t, dt}}`), plus the revenue currency used when the panel has no
currency unit (`grafanaCurrency`).

### As a metrics source

`metrics-source.cjs` (contract in `src/extensions/metrics/sources.cjs`) is ready when the app is added, connected
and at least one of DAU / new users / revenue / ARPDAU is mapped. For the asked days each mapped panel is queried
with `intervalMs` = 1 day and `maxDataPoints` = days + 1 (the panel's own relative time and interval do not apply),
the chosen series (or the first) is bucketed by UTC day: DAU, ARPDAU and retention by mean, new users and revenue by
sum. Revenue from a mapped revenue panel, else ARPDAU × DAU per day (noted). Retention panels plot a share per
install day: they become cohorts with the mapped new users as the cohort size (without new users mapped, retention
is reported unavailable). Platform and version filters of the metrics card are applied through a dashboard variable
named platform/os or version/build when it has that option; otherwise a note says they were not applied.
«Метрики игры»'s own «подключите источник» question still names only AppMetrica (that text lives in the metrics
app, not here).

## Verified

All with a local fake Grafana (`tests/grafana-fake.cjs`, served under `/grafana` to check the path prefix), no real
credentials: `tests/grafana.cjs` (unit: links, base URL, routing and near-misses, pure dashboard logic, the card from
real HTTP calls incl. templating / rows / library and mixed panels, list and search, 401 / 403 / redirect / timeout /
unreachable, the mapping proposal with and without the model, metrics-source output and «Метрики игры» showing the
Grafana block, offers and turn order) and `tests/grafana-ui.cjs` (the chat request end to end in the real window,
the card's DOM and interactions, a pasted panel link, the list card, the settings check and mapping; screenshots
`petya-grafana*.png` in the temp folder). To verify live: a real Grafana with a Viewer service account — the panel
query shapes of the actual datasources (Prometheus, SQL, ClickHouse, …), Grafana 11 Scenes links, library panels,
and the Image Renderer endpoint.
