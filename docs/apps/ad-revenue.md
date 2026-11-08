# Ad revenue («Реклама и монетизация»)

Category: analytics. Directory: `src/extensions/ad-revenue/`.

Ad revenue of the user's games in the chat, as one card: KPI tiles (revenue, impressions, eCPM, change against the
previous period — or, for a single day, against the same weekday of the four weeks before), revenue by day stacked
by network (top five plus the rest) with a dashed eCPM line, anomalies against the 4-week baseline, networks with
share, revenue change, eCPM, an eCPM-per-day sparkline and fill rate, a format × network table (revenue and eCPM per
cell) and the top countries. Fill rate and ARPDAU appear when a source reports them. Actions: «Сравнить с прошлой
неделей» and «По форматам» (follow-up requests) and «Отправить в …» (cross-app `share-message`; the messaging app's
own flow picks the channel and confirms). Nothing here writes to a service. Everything is computed by code; the
local model is not used.

## Phrases

Triggers (when the app is added): «сколько заработали на рекламе вчера», «eCPM по сетям», «какой формат приносит
больше», «упала выручка с rewarded», «выручка с рекламы за неделю», «какой fill rate у AdMob», «ARPDAU за неделю»,
«что в AppLovin за вчера», «доход от рекламы по странам».

Read from the request: period (вчера, позавчера, сегодня — partial, за N дней/недель, за 2 недели, за месяц; default
the last 7 complete days, at most 42), format (rewarded, interstitial/интеры, баннер, MREC, native, app open,
offerwall), network (AdMob, Unity/ironSource, Meta, Mintegral, Pangle, Liftoff, InMobi, Chartboost, Moloco,
BidMachine, Yandex, AppLovin — «AppLovin MAX» is the reporting service, not a network filter), platform (iOS/Android),
country (highlighted in the country list), an app name that appears in the report, the view (по сетям, по форматам,
по странам, eCPM, fill rate, ARPDAU, «упала/просела» → anomaly).

Not triggered (near-misses, `NEAR` in `query.cjs`, also the offer's `avoid`): user acquisition — «реклама игры»,
«маркетинговые кампании», «запусти рекламу в TikTok», «сколько потратили на рекламу», CPI/ROAS/creatives (a separate
UA app later); «отключи/убери рекламу», adblock; in-app purchases and subscriptions («покупки в приложении», IAP,
«выручка за подписки»); «сколько заработали вчера» without ads; «что такое eCPM».

## Sources: the `ad-source` kind

The app is source-agnostic. A source is declared in an extension's `extension.json`
`"provides": {"ad-source": "<file>.cjs"}` (the shared scan in `src/features/app-links.cjs`, where `ad-source` is
listed in `REGISTRIES` next to `meeting-source`) and exports
`{id, name, ready(settings), maxDays?, fetch(services, {start, end, current, check})}` returning rows
`{day, app, platform, network, format, revenue, impressions, attempts?, responses?}`, optional daily
`{day, app, platform, dau?, requests?, fills?}` and `countries`. `sources.cjs` loads them; a source counts only while
its extension is added and `ready`. Names go through `shape.cjs` so «ADMOB_BIDDING» and «AdMob» are one network.
Several ready sources are summed; one failing is reported in the answer and in the card notes, the others still answer.

### AppLovin MAX (implemented)

`GET https://r.applovin.com/maxReport?api_key=<Report Key>&format=json&start=…&end=…&columns=…&not_zero=1&limit=10000&offset=…`
(MAX Revenue Reporting API). Two reports per request: `day,application,package_name,platform,network,ad_format,
attempts,responses,impressions,estimated_revenue` for the period plus 28 days before it, and
`country,impressions,estimated_revenue` for the period. Fill rate = responses / attempts per network (these columns
work only with `network`). Limits: the last 45 days only (a month's baseline is partial), revenue is an estimate in
USD, the last 1–2 hours may be incomplete, paging up to 100 000 rows.

### Unity LevelPlay / ironSource (implemented)

Auth: `GET https://platform.ironsrc.com/partners/publisher/auth` with headers `secretkey` and `refreshToken` → a
bearer token valid 24 h (kept in memory for 23 h). Reports: `GET https://platform.ironsrc.com/levelPlay/reporting/v1`
with `startDate`, `endDate`, `breakdowns`, `metrics`, `page`, `resultsPerPage` — `date,app,platform,adNetwork,adFormat`
× `revenue,impressions`; `date,app,platform` × `revenue,activeUsers,appRequests,appFills` (ARPDAU and the
mediation-level fill rate); `country` × `revenue,impressions`. `adNetwork` comes back as `networkName`. Limit: 8000
requests per hour.

### Later sources (not implemented)

AdMob directly (AdMob API `networkReport:generate`, OAuth), Google Ad Manager, a metrics app with DAU (AppMetrica,
Firebase/GA4) — ARPDAU for AppLovin-only setups would then come from that app's DAU. Each is one `ad-source` file.

## Setup

Settings → «Реклама и монетизация»: AppLovin MAX Report Key; LevelPlay Secret Key and Refresh Token. All three are
feature `secrets` (never shown again; «Удалить сохранённый …» clears them). «Проверить подключение» reads one day.

## Anomalies

For each of the last (up to) 7 days of the period: revenue of all ads, of each format and of the top networks is
compared with the mean of the same weekday in the 4 weeks before (at least 2 weeks needed). Flagged at ±20 % (total)
or ±30 % (a format or network), ignoring days under max($5, 2 % of the average day). With a format or network filter
the filtered total is labelled with that format/network.

## Verification

Live: none — no AppLovin or LevelPlay credentials exist here. Endpoints, parameters and response shapes follow the
official docs (support.applovin.com «Revenue Reporting API», docs.unity.com «LevelPlay Reporting API» and «API
authentication»). With stubs: `node tests/ad-revenue.cjs` (routing, near-misses, both sources' requests, paging,
card data, anomalies, one source failing, errors, offer) and the Electron card test `tests/ad-revenue-ui.cjs`
(screenshot `petya-ad-revenue.png` in the temp folder). To verify live: the exact `network` spellings AppLovin
returns, the LevelPlay `app` breakdown field names (`appName`/`appKey` are both accepted) and whether the LevelPlay
auth body is a JSON string (handled) or bare text (would need a text read in `s.request`).
