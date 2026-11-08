# UA sources (`ua-source`)

A foundation for user-acquisition spend: what buying users costs, from the ad networks' reporting APIs, in one
row shape. Petya knows no network itself.

- Registry: `src/features/ua-sources.cjs` (kind `ua-source` in `REGISTRIES` of `src/features/app-links.cjs`).
- Sources today (in `src/extensions/ua-campaigns/`): AppLovin (Axon advertiser report), Unity Ads (Advertising
  Statistics API v2), Meta (Marketing API insights). Google Ads is documented below, not implemented.
- First consumer: a minimal «Закупка трафика» card (`ua-campaigns`). A full UA app is planned for the next wave.
- Test: `node tests/ua-sources.cjs` (fake AppLovin/Unity/Meta servers over HTTP).

## Providing a source

`"provides": {"ua-source": "my-source.cjs"}`; the file exports `{id, name, ready(settings), hint?(settings),
maxDays?, names?:[RegExp], async fetch(services, {start, end, check}) → {rows, notes?, truncated?}}`.
`start`/`end` are inclusive UTC days, already bounded by the registry: not after today, not before
`today − maxDays + 1`, at most 92 days long. A source only reads.

## The row

```
{date:'YYYY-MM-DD', network, campaign, campaignId, country:'US'|'' , platform:'ios'|'android'|'',
 spend, installs, clicks, impressions, currency:'USD', source}
```

`row()` normalizes whatever a source returns (strings to numbers, negative to 0, country to ISO alpha-2,
`iphone`/`fireos` to platforms, unknown currency to USD). Spend is in `currency`; nothing is converted.

## Registry and helpers

`create(s)` → `{all(), list(), find(id), named(text), fetch(id, {start, end}), fetchAll({start, end})}`;
`fetchAll` returns `{rows, used, failed:[{id, name, error}], notes}` so a card can show what failed next to
what was read. Helpers: `summarize(rows, by)` (by `network`, `campaign`, `country`, `platform`, `date` or several;
one group per currency, with `cpi`, `ctr`, `cvr`), `period(text)` («вчера», «за неделю» = the last 7 full days,
«за 14 дней», «на прошлой неделе», «в этом месяце»), `roas(revenue, spend)`, `bound`.

ROAS: «Закупка трафика» divides ad revenue of the same days from the `ad-source` registry («Реклама и
монетизация», USD) by USD spend — a blended ad-revenue ROAS, without in-app purchases. IAP revenue from
`metrics-source` comes in the app's currency and per app; combining it needs a currency rate and app mapping
(next wave).

## Networks

| Network | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| AppLovin (Axon) | `GET https://r.applovin.com/report?report_type=advertiser&format=json&columns=day,campaign,campaign_id_external,country,platform,impressions,clicks,conversions,cost` | `api_key` = Report Key | Last 45 days; `conversions` are installs, `cost` USD. The MAX Report Key of «Реклама и монетизация» is reused. Paged by `limit`/`offset`. |
| Unity Ads | `GET https://services.api.unity.com/advertise/stats/v2/organizations/{org}/reports/acquisitions?scale=day&metrics=starts,clicks,installs,spend&breakdowns=campaign,country,platform&format=json` | `Basic base64(keyId:secret)` of a service account with «Advertise Stats API Viewer» | 204 = no data; 1 req/s and 30 per 30 min; `starts` used as impressions; ISO date-times, `end` exclusive. |
| Meta | `GET https://graph.facebook.com/v24.0/act_{id}/insights?level=campaign&time_increment=1&breakdowns=country&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency` | `access_token` with `ads_read` (system user token recommended) | Installs = `mobile_app_install` (or `omni_app_install`) action; spend in the account currency; `paging.next` followed (Graph host only). Platform cannot be combined with the country breakdown → empty. Up to 5 accounts. |
| Google Ads | `POST https://googleads.googleapis.com/v{N}/customers/{customerId}/googleAds:searchStream` with GAQL `SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN …` | `developer-token` header (approved Google Ads API access), OAuth 2.0 access token (client id/secret + refresh token), `login-customer-id` for manager accounts | Not implemented: needs a developer token approval and an OAuth client; installs are conversions of the app campaign's install action; cost is in micros of the account currency; country via `geographic_view`. |

Verified against the official docs (Unity: docs.unity.com «Advertising Statistics API 2.0.0»; AppLovin:
support.axon.ai «Reporting API» for advertisers; Meta: Marketing API insights and breakdowns). No real
credentials were available: everything is tested with fake servers.
