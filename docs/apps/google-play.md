# Google Play

Google Play is a Petya service (module `googleplay`, connection card in Settings: one-click Google sign-in or a
service-account JSON key, saved as `googlePlayCredential`; scope `playdeveloperreporting`) with an extension directory
`src/extensions/google-play` (no settings of its own, always present while the service is on). It does two things:

| Subject | Where | What |
|---|---|---|
| ANR | `src/google-play.cjs` `read()` (the `anr` reader of the dialogue) + `vitals-cards.js` | «ANR за неделю», «ANR в Google Play»: ANR rate, user-perceived ANR rate, the 7-day weighted rate, Google's bad-behaviour threshold, per-day chart. |
| Crashes | `crash-source.cjs` (a `crash-source` for «Крэши», [crashes.md](crashes.md)) | «крэши в Google Play», «крэши в гугл плей», or any crash request while Google Play is connected: Android vitals crash clusters in the «Крэши» card. |

On dashboards (`feature.cjs`, no chat `turn`): «ANR», «ANR за неделю», «зависания» become a widget whose
`dashboard.load` runs the same `read()` and `result.cjs` `extract`, so the widget is the chat's ANR card and refreshes
like the others. With several apps and none named in the phrase the widget asks to name one. See
[dashboards.md](../dashboards.md).

ANR stays a separate topic: the crash source returns only `CRASH` issues, and «ANR …» requests still go to the ANR
card. A request that names Google Play together with a crash word is routed to «Крэши» (`src/dialogue.cjs` `intent`,
`src/service-access.cjs`), not to the ANR reader.

## Crash source (Play Developer Reporting API v1beta1)

- `GET apps:search` — the apps the connection sees; a request naming an app's title or package reads only it,
  otherwise all (up to five).
- `GET apps/{app}/errorCountMetricSet` — `freshnessInfo`: the last complete DAILY day.
- `POST apps/{app}/errorCountMetricSet:query` — `timelineSpec` DAILY (America/Los_Angeles dates) from four weeks before
  the period to the freshest day, `dimensions:['issueId']`, `metrics:['errorReportCount','distinctUsers']`,
  `filter:'reportType = CRASH'` (+ `AND versionCode = N`) — daily reports per issue for the chart, sparklines and
  «новый» (no report in the four weeks before the period).
- `GET apps/{app}/errorIssues:search` — `interval.startTime/endTime` (UTC, hour-aligned, end not in the future),
  `filter=errorIssueType = CRASH` (+ `AND versionCode = N`), `orderBy=errorReportCount desc`, `pageSize=100`.
  ErrorIssue fields used: `name` (issue id), `cause` (title), `location` (culprit), `errorReportCount`,
  `distinctUsers`, `lastErrorReportTime`, `firstAppVersion`/`lastAppVersion.versionCode`, `issueUri`.
- With a `versionCode` in the request («крэши в Google Play versionCode 10422»): `crashRateMetricSet` freshness and
  `:query` with `metrics:['crashRate','distinctUsers']`, shown as crash-free users = 1 − crash rate weighted by daily
  users. A version name («1.4.2») cannot filter Play data: the source answers with a note asking for the versionCode.

iOS requests skip Google Play. Issues cannot be resolved through the API, so Google Play rows have no «Решено».

The service-account token is issued by `src/google-service-account.cjs` (shared with Firebase Crashlytics).

## Offer

`offer.cjs`: offered when crashes are named together with Google Play («крэши в Google Play», «падения в гугл плей»);
not for ANR, freezes or reviews («отзывы/жалобы в Google Play» are «Отзывы в сторах»). Google Play is connected in
Petya's service settings (`service: 'googleplay'`), so accepting opens that card; it also adds «Крэши».

## Tests

`node tests/google-play-crashes.cjs` (run by `tests/crashes.cjs`): request shapes (interval, filters, order, page size,
count query body), parsing, «новый», app choice, versionCode filter and crash-free users, iOS skip, missing freshness,
errors, routing away from ANR, offer. ANR: `tests/dialogue.cjs`, `tests/one-click-connect.cjs`; the ANR widget:
`tests/dashboards.cjs` (stubbed Play API) and `tests/dashboards-ui.cjs`. All with stubs.

To verify live: the exact filter syntax `reportType = CRASH` on `errorCountMetricSet` (documented as equality on
dimensions; the value may need quotes), `errorIssues:search` with an end hour close to now, issue grouping (the
ErrorIssue resource is marked alpha), and `crashRateMetricSet` for a versionCode.
