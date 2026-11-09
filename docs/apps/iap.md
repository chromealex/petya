# In-game purchases («Покупки в игре») and the `purchase-source` foundation

Category: analytics. Directory: `src/extensions/iap/` (the card, App Store and Google Play sources, settings);
registry `src/features/purchase-sources.cjs`; the database source `src/extensions/sql/purchase-source.cjs`.

In-app purchases in the chat: revenue by product with shares, refunds (count, amount, rate, by product), net,
purchases by day, and — when a source knows buyers — payers, new payers, ARPPU, conversion to payers and the
products bought first. When «Реклама и монетизация» and «Закупка трафика» are connected, the card adds ROAS with
purchases. Everything is computed by code (`analysis.cjs`); no model is involved; nothing is written anywhere.

**Currencies are never added, compared as one number or converted.** The card shows one currency at a time (chips
switch, ordered by the number of purchases); the chat answer names the main currency and lists the others;
ARPPU is per currency (amount of that currency / payers who paid in it); ROAS is per spend currency.

## The `purchase-source` kind

`"provides": {"purchase-source": "<file>.cjs" | [files]}`; the file exports `{id, name, ready(settings), hint?,
maxDays?, names?, confirm?, plan?(services, {start, end}), fetch(services, {start, end, plan?, check})}`. Rows are
normalized by `row()` to `{date, store, product, title, type: iap|subscription, kind: purchase|refund, units, amount,
currency, proceeds, proceedsCurrency, country, platform, source}` (`amount` ≥ 0 is what players paid; negative
units or amounts become refunds). A source that knows buyers returns `payers: {total, newPayers, days, byCurrency,
first}` counted by the source (distinct buyers cannot be added up). A source with `confirm` (SQL) is read only with
the plan the user confirmed; the registry refuses otherwise. Registered in `REGISTRIES` of `app-links.cjs`; cached
with `registry.cached('purchase-sources')`. Helpers: `summarize(rows, by)` (one group per currency), `currencies`,
`bound`.

## Sources

### App Store Connect (`appstore-source.cjs`)

`GET https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[version]=1_0&filter[vendorNumber]=<vendor>&filter[reportDate]=YYYY-MM-DD`
with `Authorization: Bearer <ES256 JWT>` (`iss` = Issuer ID, `kid` = Key ID, `aud` = `appstoreconnect-v1`, 20 min),
signed with the team API key (.p8) by the shared signer of «Отзывы в сторах» (`tokens.ascToken`). One request per
day (4 at a time), gzip'd TSV; 404 = no sales that day. Kept: product type identifiers `IA1, IA9, IAY, IAC, FI1`
(and `-M`); `IAY/IAC/IA9` are subscriptions; Units < 0 are refunds; amount = Units × Customer Price in Customer
Currency; proceeds = Units × Developer Proceeds in Currency of Proceeds. Daily reports exist for 365 days.
Settings: Issuer ID, Key ID, .p8 (secret `iapAscKey`, role Sales/Finance/Admin), vendor number. Without own fields
the key of «Отзывы в сторах» is used (as a whole, never mixed) — that key may lack the Sales role (403 → a clear
message).

### Google Play (`googleplay-source.cjs`)

Monthly sales reports in the developer account's Cloud Storage bucket: `gs://pubsite_rev_<id>/sales/salesreport_YYYYMM.zip`
(one CSV), read with `GET https://storage.googleapis.com/storage/v1/b/<bucket>/o/<object>?alt=media` and an OAuth
token for `https://www.googleapis.com/auth/devstorage.read_only` of a service account invited to Play Console with
«View financial data» (JWT bearer grant by the shared `src/google-service-account.cjs`). Columns: Order Charged
Date, Financial Status (`Charged`, `Refund`, cancelled ones skipped), Product Title, Product ID (package; filtered by
the optional package list), Product Type (`inapp` / `subscription`), SKU ID, Currency of Sale, Item Price, Country of
Buyer. UTF-8 or UTF-16LE CSV; a minimal ZIP reader (`zip.cjs`: stored/deflated, size limits). A month without a
report is a note. Settings: bucket, packages, own key (`iapPlayCredential`, saved through ipc `saveKey`) or the
service-account key of «Подключения → Google Play».

### A purchases table («SQL по словам», `src/extensions/sql/purchase-source.cjs`)

Found in the cached schema by its columns (buyer, time, product, price; currency, refund flag, platform when
present; a `_usd`/`_rub` price name gives the currency when there is no currency column). One query written by code
for the dialect returns parts in one shape (`part, d, product, currency, platform, refund, units, amount, payers`):
sales per day/product/currency/platform/refund, distinct payers per day, per currency (with their amount), in total,
new payers (first purchase ever in the period) and the product of those first purchases. It passes the SQL app's
read-only validator, is shown on the card with the estimate, and runs only on «Выполнить» (ipc `run`, the stored
plan, checked again); the stores are read again then and the card is recomputed.

## Derived numbers

- conversion to payers = the mean over days of payers that day / DAU that day (DAU from the first ready
  `metrics-source`), shown with the mean DAU and the number of days;
- ARPPU per currency = amount paid in that currency / payers who paid in it;
- ROAS per spend currency C (UA spend from `ua-source`) = (purchases net in C + ad revenue of the period when C is
  USD, the ad sources' currency) / spend in C. Spend in a currency with no revenue is listed («Закупка в валюте без
  покупок»), not shown as 0%; purchase currencies without spend are listed as left out.

## Phrases

Own: «покупки в игре за неделю», «выручка по продуктам», «какие паки покупают лучше», «конверсия в платящих»,
«ARPPU за месяц», «рефанды в App Store за месяц», «первая покупка — какой пак», «ROAS с покупками за неделю»,
«продажи в Google Play за неделю», «IAP за неделю». Store names narrow the sources («в App Store»).

Near-misses: game revenue, DAU and ARPDAU («Метрики игры» — which now refuses ARPPU, payers, refunds, products and
first purchases), ad revenue («Реклама и монетизация»), spend and plain ROAS («Закупка трафика», which now leaves
«ROAS с покупками» here), «воронка … до первой покупки» («Воронки»), personal subscriptions and shopping lists,
store reviews, definitions, implementing IAP («как настроить IAP в Unity»), a named database («… в BigQuery» stays
with «SQL по словам»).

## Tests

- `tests/iap.cjs` — keys generated at runtime (EC P-256 .p8, RSA service account); fake servers: App Store Connect
  (JWT verified with the public key, filters, gzip TSV, 404 days, IAP types, refunds), Google OAuth and Cloud
  Storage (a ZIP built in the test, quoted CSV, refunds, cancelled orders, packages, a missing month); a failing
  store told apart; the database plan pending, refused by the registry without confirmation, then payers, ARPPU,
  first purchases, conversion and ROAS; currencies never mixed.
- `tests/iap-ui.cjs` (Electron) — the chat request through the real registry with fake providers, currency chips,
  tiles, daily bars with refunds, products, «Выполнить», payers and ROAS, hostile product names as text, the
  settings card; screenshots `petya-iap-pending.png`, `petya-iap.png`, `petya-iap-settings.png`.

## Verified

Stubs only: no App Store Connect, Play Console or database credentials were available. To check live: Sales report
`version` (1_0 for SUMMARY), product type identifiers in today's reports, refund rows (negative Units), the 404 body
for days without sales; Play sales report column names and the financial status values (Refund / Partial refund),
UTF-8 vs UTF-16 encoding, bucket access through a service account; the generated purchases SQL on real tables
(UNION type coercion in each dialect).

Docs: [GET /v1/salesReports](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports),
[Summary Sales report fields](https://developer.apple.com/help/app-store-connect/reference/summary-sales-report),
[Product type identifiers](https://developer.apple.com/help/app-store-connect/reference/product-type-identifiers),
[Generating tokens for API requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests);
[Play Console: download and export monthly reports](https://support.google.com/googleplay/android-developer/answer/6135870),
[Cloud Storage JSON API objects.get](https://cloud.google.com/storage/docs/json_api/v1/objects/get),
[OAuth 2.0 for service accounts](https://developers.google.com/identity/protocols/oauth2/service-account).
