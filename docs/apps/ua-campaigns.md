# UA campaigns («Закупка трафика», `ua-campaigns`, category analytics)

A minimal first consumer of the `ua-source` foundation (`docs/foundations/ua-sources.md`); the full UA app is
planned for the next wave.

## What it does

Spend, installs, CPI and CTR for a period from AppLovin, Unity Ads and Meta: spend per day (bars) with installs
(line), networks with spend share and CPI, campaigns (CPI 1.5× above the median is marked), top countries.
Spend in different currencies is never added (a note says what was left out). When «Реклама и монетизация» has a
ready ad source, a blended ROAS (ad revenue ÷ USD spend, no purchases) is shown. No model; reads only.

## Phrases

«сколько потратили на закупку за неделю», «CPI по сетям за 30 дней», «расходы на рекламные кампании вчера»,
«какой ROAS за неделю», «кампании в Unity Ads», «сколько стоит установка по сетям». Near-misses (tested): ad
revenue («сколько заработали на рекламе», eCPM), starting/stopping ads, marketing in general, purchases,
«что в Unity».

## Setup

Settings → «Закупка трафика»: AppLovin Report Key (reused from «Реклама и монетизация» when set), Unity Ads
organization core ID + service account Key ID and Secret key, Meta ad account IDs + token with `ads_read`.

## Verified

`node tests/ua-sources.cjs` with fake AppLovin, Unity and Meta servers; UI `tests/ua-campaigns-ui.cjs`
(`petya-ua-campaigns.png`). No live credentials. Unity's documented curl example writes the Basic header as
`<key id>:<secret key>`; Petya sends the standard base64 form of it (Unity service-account auth) — check live.
