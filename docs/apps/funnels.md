# Funnels («Воронки»)

Category: analytics. Directory: `src/extensions/funnels/`. Settings: none (sources are connected in their own apps).

A funnel of game events in the chat: the tutorial, onboarding, the path from install to the first purchase, or the
user's own steps («воронка: tutorial_start → level_3 → purchase»). The card shows:

- step bars narrowing from the first step, players and the share of the start on every step;
- between every two steps the drop-off (share and players) and the time between them (median; a hover gives the
  90th percentile), with the largest drop marked «главный отвал»;
- a comparison by platform, country and version (top six values and «другие»), a mini bar per step and the final
  conversion, coloured when it differs from the total by 2 p.p. or more;
- «Сохранить воронку» (per project, `<company folder>/funnels.json`; «воронка «Название»» repeats the saved steps,
  «мои воронки» lists them) and «Выгрузить в Google Таблицы» (`k.links('spreadsheet-export')`).

Every number is computed by code (`compute.cjs`); no model is involved.

## The funnel

A player enters with the first occurrence of step 1 inside the period; step k counts when the player sent its event
at or after the moment step k−1 was reached (the earliest such occurrence) and before the end of the period. The
period is the last N full days (30 by default; «за 14 дней», «за неделю», «за квартал»).

## Where the events come from

1. A `metrics-source` with the optional hooks `events(services, query) → [{name, users}]` and
   `journeys(services, {from, to, events, install}) → {journeys:[{user, platform, country, version, times}]}`
   (contract in `src/extensions/metrics/sources.cjs`). AppMetrica implements them:
   - event names: Reporting API `GET https://api.appmetrica.yandex.ru/stat/v1/data?id=<app>&metrics=ym:ce2:devicesWithEvent&dimensions=ym:ce2:eventLabel&date1&date2&sort=-ym:ce2:devicesWithEvent&limit=300`;
   - journeys: Logs API `GET /logs/v1/export/installations.json?application_id&date_since&date_until&fields=appmetrica_device_id,install_timestamp,os_name,country_iso_code,app_version_name`
     (the install step `$install`) and `GET /logs/v1/export/events.json?…&fields=appmetrica_device_id,event_name,event_timestamp,os_name,country_iso_code,app_version_name&event_name=<step>`
     per step. The Logs API prepares an export asynchronously: 202 «Wait for result» while it is prepared, the same
     request returns 200 with `{data:[…]}` when ready (polled 8 times, 5 s apart; then «повторите через минуту»).
     At most 300 000 rows are read; more is reported as truncated.
   - Exact counts and exact medians.
2. A database of «SQL по словам» (own connections and query sources such as Grafana): the events table is found in
   the cached schema by its columns (player: `user_id`, `player_id`, `user_pseudo_id`, `appmetrica_device_id`, …;
   event: `event_name`, `event`, `action`, …; time: `event_time`, `ts`, `created_at`, `event_timestamp` …; platform,
   country and version when present; integer time columns are epochs — μs for Firebase's `event_timestamp`). The
   SQL is written by code for the connection's dialect (ClickHouse, PostgreSQL, BigQuery, MySQL — `sql.cjs`), passes
   the SQL app's read-only validator (`src/extensions/sql/validate.cjs`, which also adds the LIMIT) and is shown on
   the card with the cost estimate; it runs only on «Выполнить» (ipc `run`, the SQL stored on the card, checked
   again). A preset needs the period's event names first: that query is shown and confirmed the same way, then the
   funnel query. The funnel query returns, per segment value, step and time bucket, the number of players
   (`seg, step, bucket, users`; the `'__all__'` total is ordered first so it survives the row limit). Counts are
   exact; medians are reported to a bucket («медиана ≈ 30 с–1 мин»). Progress and results go to the notification
   center (`funnels:<card id>`).
3. Neither → a question naming AppMetrica and «SQL по словам».

### Presets (`steps.cjs`)

- «туториал»: events matching `tutor|обуч|ftue`, ordered start → numbered steps by number → complete, others by how
  many players sent them; the install step first when the source has installations.
- «онбординг»: `onboard|ftue|tutor|first_…|registration`, plus early level events when there are fewer than three.
- «от установки до первой покупки»: install → the tutorial's complete event (when present) → the purchase event
  (`purchase|payment|iap|buy|покуп|оплат`, `first_…` preferred).
- Unknown or missing events → a clarification with the real event names as an example; the original request is kept.

## Phrases

Own: «воронка туториала», «где отваливаются игроки на онбординге», «воронка от установки до первой покупки»,
«на каком шаге туториала уходят игроки», «конверсия по шагам туториала», «воронка: a → b → c по странам»,
«мои воронки», «воронка «Магазин»». A bare «покажи воронку» asks which one (choices: tutorial, onboarding,
install → first purchase, saved ones).

Near-misses (null / no offer): sales and marketing funnels («воронка продаж», «воронка лидов в CRM», «маркетинговая
воронка сайта», «воронка сделок в амоцрм», e-mail, landing pages — unless game words such as «туториал» are named
too), other meanings («кухонная воронка», «воронка от взрыва»), definitions («что такое воронка»), «где мы теряем
время», and plain metrics (DAU, retention, revenue stay with «Метрики игры»; «Метрики игры» now refuses «воронк…»).

## Tests

- `tests/funnels.cjs` — routing and offer near-misses, presets, the computation from journeys and from buckets, the
  SQL text for four dialects through the validator (and a refused event name), AppMetrica end to end against a fake
  HTTP server (Reporting API through `s.request`, Logs API with a 202 first), explicit steps and the clarification,
  the «still preparing» answer, saving per project and building a saved funnel, the SQL flow pending → events →
  funnel only through `run`, a failing run on the card.
- `tests/funnels-ui.cjs` (Electron) — the request in the chat → the card (bars, drop-offs, medians, main drop,
  platform/country switch, save through IPC, the Sheets slot, hostile event names as text), then the SQL flow with
  two «Выполнить» presses; screenshots `petya-funnels.png`, `petya-funnels-sql.png`.

## Verified

Stubs only: no AppMetrica token or database was available. To check live: the `ym:ce2` event names query (namespace
and metric names), Logs API field names and the `event_name` filter, the time it takes to prepare large exports and
the 300 000-row cap; the generated SQL on real ClickHouse / PostgreSQL / BigQuery / MySQL tables (especially epoch
time columns and `minIfOrNull`), and `estimate` on BigQuery for the funnel query.

Docs: AppMetrica Logs API — [events](https://appmetrica.yandex.com/docs/en/mobile-api/logs/ref/events),
[request flow (202/200)](https://appmetrica.yandex.com/docs/en/mobile-api/logs/request-procedure),
[installations](https://appmetrica.yandex.com/docs/en/mobile-api/logs/ref/installations); Reporting API
[introduction and namespaces](https://appmetrica.yandex.com/docs/en/mobile-api/stat/intro).
