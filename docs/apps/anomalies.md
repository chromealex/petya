# Anomalies («Аномалии»)

Category: analytics. Directory: `src/extensions/anomalies/`. No account of its own: it reads the source registries of
other apps. No model: everything is computed by code.

## What it watches

| Kind | Read through | Series |
|---|---|---|
| Game metrics | `metrics-source` (AppMetrica, Grafana) | DAU, installs (new users), revenue — total and per platform (one query per platform); a source that returns series with `dimensions.country` gets per-country segments |
| Crashes | `crash-source` (Sentry, Crashlytics, Google Play) | crash events per day: sum of the issues' 14-day daily stats |
| Player support | `support-source` (Zendesk) | tickets created per day |
| Ad revenue | `ad-source` (AppLovin MAX, LevelPlay) | revenue per day, total, per top-5 network and per platform (within the source's `maxDays`) |
| Store ratings | «Отзывы в сторах» (App Store, Google Play) | average rating per day (with the number of ratings) and 1–2★ reviews per day, per store and game |

A source counts while its app is added and connected; «Метрики игры» / «Крэши» need not be added themselves.

## Detection

- Baseline: the same weekday of the 4 weeks before (≥ 3 of them present), median and MAD (σ = 1.4826·MAD, at least 3%
  of the median). Short histories (14-day crash stats, App Store pages) fall back to the 7–14 days before, marked
  «короткая история»; less than that is a «мало истории» note.
- An anomaly needs |z| ≥ k, a minimum relative effect and a minimum volume. Sensitivity (`anomaliesSensitivity`):
  low k=4 / 30%, normal k=3 / 20%, high k=2.5 / 12%. Volumes: DAU and installs 100, revenue 20, crash events 20,
  tickets 10, bad reviews 5; ratings need ≥ 5 ratings that day and a 0.4★ move.
- **Missing data is never an anomaly**: a day without a point, or a source whose every series reads 0 while its
  baseline is busy, becomes «нет данных за вчера — источник ещё не прислал их». Ad days without report rows and
  reviews older than the oldest one read are missing, not zero.
- Dedupe: the same move from two sources is one row («+ GameAnalytics»); a segment that explains ≥ 50% of its
  total's move is the headline with the total as context («в целом −22%»), otherwise the total with the segments
  listed. Ranked by impact (metric weight × relative change × log volume).
- «Не показывать такое» saves a rule kind|metric|segment|direction (`anomaliesMuted`), any source; «Отменить» and the
  settings list remove it. Hidden items are counted on the card.

## Phrases

«что необычного вчера», «есть аномалии за неделю?» (every day of the last 7), «покажи аномалии», «аномалии в метриках
вчера», «что странного в данных за неделю». Not this app: «упала выручка с рекламы» / «аномалии eCPM» (Реклама и
монетизация), «DAU за неделю» (Метрики игры), «какие крэши за неделю», «аномальная жара», «необычный подарок».
Installed without a source → a question with the source apps in the shared offer card.

## Daily check and the morning brief

`anomaliesDaily` (default `09:00`, empty = off) runs once a day within 3 hours of that time, only while a source is
connected. When yesterday has anomalies it creates a chat titled with the top one («Вчера установки из Бразилии −40%»)
holding the card and marks it done: the notification center shows exactly one notification with «Открыть чат». Quiet
days post nothing. The morning brief gets the same summary and card as a part through `morning-brief.addPart`
(`brief.cjs`); results are cached for an hour per day and settings, so the daily check, the brief and a question right
after read the services once.

## Card

Per anomaly: the headline, the impact («−612 установок», «+$310», «−1,3★»), «обычно …», the source chip, a 35-day
sparkline with the baseline band (median ± k·σ), the baseline days as dots and the anomalous day red (bad) or green
(good); «Почему?» sends a request the owning app answers («сколько новых игроков за 2 недели на Android», «топ
крэшей вчера в Sentry», «что жалуются в поддержку вчера», «выручка с рекламы вчера по сетям», «плохие отзывы за неделю
в App Store»), «Не показывать такое». Missing data and read errors are listed as notes. Actions: «За неделю»,
«Настроить».

## Verified

With stubs and a fake clock only: `node tests/anomalies.cjs` (spikes, drops, weekly seasonality, low volume, missing
data, short history, ratings, dedupe, ranking, mute, sensitivity, routing and near-misses, not installed / not
connected, the daily check and its single notification, the brief part, each reader over stubbed registries, that the
«Почему?» questions route to their apps) and `tests/anomalies-ui.cjs` (card from the real detector, mute and undo,
settings; screenshots `petya-anomalies*.png`). Live: real AppMetrica/Grafana lag for yesterday (it should show as
missing), Sentry 14-day stats volume, Zendesk search caps on busy desks.
