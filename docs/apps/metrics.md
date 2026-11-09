# Game metrics («Метрики игры») and the AppMetrica source

Category: analytics. Directories: `src/extensions/metrics/` (the card) and `src/extensions/appmetrica/` (the first
data source).

Shows the game's product metrics for a period as one card: KPI tiles (average DAU, new players, retention D1,
revenue, ARPDAU) with the change against the previous period of the same length, a line chart by day (inline SVG;
DAU / new players on the left axis, revenue on the right; legend chips toggle series; hover shows the day's
values), the previous period as dashed lines on «Сравнить с прошлым периодом», days that break the weekly pattern
circled, a retention heatmap D1/D7/D30 by install week, and chips for the period (7/30/90 days), platform
(all/Android/iOS) and the top app versions that ask the chat again. Actions: «Сравнить с прошлым периодом» (local
toggle), «Почему упало?» (only when a KPI fell by more than 5% / 1 p.p. or a day is flagged low; sends the fact to
the chat, where the model answers from the conversation) and «Отправить в Slack» (`k.links('share-message')`,
shown only when Slack is connected; the Slack flow picks the channel and confirms). Read-only: no writes anywhere.

Everything shown is computed by code (`compute.cjs`) from the sources' daily series. The local model, when chosen,
adds one optional line under the chart; a line containing digits is dropped, so numbers are never the model's.

### Anomaly flag

A day is flagged when it is more than 3σ away from the same weekday of the 4 previous weeks (mean and sample σ
of those 4 values). σ from 4 points can be tiny for a very steady game, so it is floored at 2% of the mean.
Days without a full 4-week baseline are not judged. Checked for DAU, new players and revenue.

### Retention

Cohorts by install day: users active on day 0 are the cohort size, users active on day 1/7/30 are the returned.
Weekly rows sum the cohorts of the install week whose day n is already complete; cells no cohort has reached are
empty. The D1 tile is the D1 of cohorts installed in the period (against the previous period, in p.p.).

## Sources (multi-source design)

The card knows no service. Sources are extensions that declare in `extension.json`
`"provides": {"metrics-source": "metrics-source.cjs"}` — the same `provides` scan as cross-app links and
meeting sources (`src/features/app-links.cjs` lists `metrics-source` among its registries). The contract and the
normalized series shape `{source, metric, unit, series:[{date, value}], dimensions}` are documented in
`src/extensions/metrics/sources.cjs`. Every added and connected source is read; each becomes its own block, with
source chips on the card when there are several. A source that fails is listed under the card, the others still
show. When «Метрики игры» is added but no source is ready, the chat gets a question naming what to connect
(or, if AppMetrica is added but not connected, where to finish connecting it).

Later sources (not implemented): GameAnalytics (its Metrics API with an API key), Firebase Analytics (only through
the BigQuery export; there is no public REST API for aggregated Analytics metrics), Adjust (KPI Service).

### AppMetrica

Settings → «AppMetrica»: OAuth token (secret `appmetricaToken`, a Yandex OAuth app with «appmetrica:read»), the
applications to read (loaded from `GET https://api.appmetrica.yandex.ru/management/v1/applications` after the token
is saved; one application is picked automatically) and the revenue currency (RUB/USD/EUR).

Requests (Reporting API, `Authorization: OAuth <token>`, one namespace per request as the docs require):

- `GET /stat/v1/data/bytime?id=<app>&metrics=ym:u:activeUsers,ym:u:newUsers&group=day&date1&date2&accuracy=full`
- `GET /stat/v1/data/bytime?…&metrics=ym:r2:revenue<currency>&currency=RUB` (total in-app + ad revenue; the
  currency is passed as a request parameter, the documented way for parametrized metrics)
- `GET /stat/v1/data?metrics=ym:u:activeUsers&dimensions=ym:u:profileInstallDate,ym:u:date&filters=ym:u:profileInstallDate>='<from>'&limit=10000` (retention cohorts)
- `GET /stat/v1/data?metrics=ym:u:activeUsers&dimensions=ym:u:appVersion&sort=-ym:u:activeUsers&limit=6` (version chips)
- Filters: `<ns>:operatingSystemInfo=='android'|'iOS'`, `<ns>:appVersion=='1.4.2'`.

For «Воронки» (`docs/apps/funnels.md`) the source also implements the optional `events` / `journeys` hooks of the
contract: event names with devices (`GET /stat/v1/data?metrics=ym:ce2:devicesWithEvent&dimensions=ym:ce2:eventLabel`)
and per-device step times from the Logs API exports (`/logs/v1/export/installations.json`,
`/logs/v1/export/events.json?event_name=…`; 202 while the export is prepared).

Graceful degradation: revenue refused or all zero → «Выручка недоступна / Нет данных о выручке» note, the rest of
the card stays; retention refused → a note, no heatmap; 401/429 fail the source with an actionable message.
AppMetrica's public docs do not describe a retention endpoint: retention is computed from the documented
`profileInstallDate` × `date` audience dimensions.

## Phrases

Triggers (when added): «DAU за неделю», «ретеншн D1 D7 D30», «сколько новых игроков вчера», «как выручка после
ивента», «сравни эту неделю с прошлой», «метрики игры за 30 дней на Android версии 1.4.2», «ARPDAU за месяц»,
«DAU из AppMetrica». Period: вчера, за неделю (default 7), за N дней/недель, за месяц (30), квартал (90).

Not triggered: «метрики команды», «велосити» (Jira), crashes, store reviews, ANR, «метрики сервера», A/B
significance («значим ли тест» → «A/B-тесты»), «почему упал DAU» (the chat model answers), «что такое ретеншн».
Offers: data questions offer «Метрики игры»; «подключи AppMetrica» offers «AppMetrica».

## Tests

- `node tests/metrics.cjs` — routing and near-misses, not added / no source / not connected, the AppMetrica request
  shapes, KPI arithmetic, the 3σ flag on textbook values, cohorts, revenue/retention refused, 401, a second
  source merged and a failing one listed, the model-line guard, settings validation, offers.
- `tests/metrics-ui.cjs` (Electron) — the card from stubbed AppMetrica answers through the real feature code,
  hover, compare toggle, chips asking the chat, «Почему упало?», the Slack link, two sources, the end-to-end
  no-source question and the AppMetrica settings card; screenshots `petya-metrics*.png`,
  `petya-appmetrica-settings.png` in the temp folder.

## Verified

Everything with stubs only: no AppMetrica credentials were available. To verify live: token scopes, the
`time_intervals` field of `bytime` (the code falls back to consecutive days), the `ym:r2:revenue<currency>` +
`currency` form, `operatingSystemInfo` filter values ('android', 'iOS'), and the `profileInstallDate` × `date`
cohort query (dimension compatibility and row limits on large apps).
