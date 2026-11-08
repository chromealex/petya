# Firebase Crashlytics

«Firebase Crashlytics» is an extension (`src/extensions/crashlytics`, category gamedev, switch
`extension_crashlytics`) that provides a crash source for «Крэши» ([crashes.md](crashes.md)). Crashlytics has no public
REST API for issues, so Petya reads the **Crashlytics export to BigQuery**.

## Setup (what the user does)

1. Firebase console → Project settings → Integrations → BigQuery → link the project and enable Crashlytics export
   (optionally streaming export for `_REALTIME` tables). The first data appears within a day.
2. Google Cloud console → IAM → a service account with **BigQuery Job User** on the project and **BigQuery Data
   Viewer** on the `firebase_crashlytics` dataset; create a JSON key.
3. Petya → Settings → «Firebase Crashlytics»: choose the JSON key (kept as the secret `crashlyticsCredential`; the
   project id is taken from it), check the project and dataset, «Сохранить и проверить». The check lists the export
   tables and shows how much a week's query would read (a dry run; nothing is billed). Optionally tick the apps to
   read, realtime tables, a read limit per query (GB) and the dataset region.

Settings keys: `crashlyticsCredential` (secret), `crashlyticsProject`, `crashlyticsDataset` (default
`firebase_crashlytics`), `crashlyticsTables` (batch table names, empty = all), `crashlyticsRealtime`,
`crashlyticsLimitGb` (default 5), `crashlyticsLocation`.

## How it reads

Export schema (Firebase docs, «BigQuery dataset schema»): one table per app and platform,
`<app id with dots as _>_ANDROID` / `_IOS`, plus `…_REALTIME` with streaming export. Columns used: `issue_id`,
`event_id`, `event_timestamp`, `installation_uuid`, `error_type` (`FATAL`, `NON_FATAL`, `ANR`), `bundle_identifier`,
`application.display_version`, `blame_frame.{file,line,symbol}`, `exceptions[0].{type,exception_message}` (Android).

One read-only GoogleSQL query per request through `POST bigquery/v2/projects/{project}/queries` (`jobs.query`), polled
with `GET …/queries/{jobId}` (`getQueryResults`) while `jobComplete` is false:

- `useLegacySql:false`, `parameterMode:NAMED`, every value a query parameter (`@from`, `@start`, `@end`, `@chart`,
  `@types` = `['FATAL']`, `@version`, `@app<i>`); table names cannot be parameters and are validated against
  `^[A-Za-z0-9_]+_(ANDROID|IOS)$` before they reach the SQL;
- named columns only (never `SELECT *`) and an `event_timestamp` window: the period plus four weeks before it (to tell
  new issues from old) and 14 days for the chart;
- `maximumBytesBilled` = the read limit, so an expensive query fails instead of being billed;
  `formatOptions.useInt64Timestamp` for exact timestamps; `location` when set;
- batch and realtime tables are combined with `UNION ALL` and events are counted with `COUNT(DISTINCT event_id)`.

Result per issue: title (Android: exception type; Apple: blamed file/symbol), culprit (`file:line`), events, users
(`COUNT(DISTINCT installation_uuid)`), first/last seen, up to five versions, daily counts, console link
`console.firebase.google.com/project/{project}/crashlytics/app/{android|ios}:{bundle}/issues/{issue_id}`.
Only fatal crashes; non-fatals and ANRs are not shown. «Решено» is not available (issue state is not writable outside
the Firebase console). Platform: tables of that platform only. Release: `application.display_version = @version`.

Auth: the service-account JWT grant with scope `https://www.googleapis.com/auth/bigquery.readonly`
(`src/google-service-account.cjs`, shared with Google Play).

## Offer

Offered for «Crashlytics», «крашлитикс», or Firebase together with crash words («крэши в Firebase»); not for other
Firebase products (Analytics, Remote Config, Auth, Firestore, Cloud Messaging, Hosting, …) or ANR. Accepting also
adds «Крэши».

## Tests and live verification

`node tests/crashlytics.cjs` (run by `tests/crashes.cjs`): SQL shape and parameters, `jobs.query` body
(`maximumBytesBilled`, NAMED parameters, int64 timestamps, location), polling, row parsing (repeated strings and
records), card data through «Крэши», platform/release/table choice, missing export, errors (bytes limit, permissions,
schema), dry-run estimate, key import, validation, offer. All with stubs — no real BigQuery project was available.

To verify live: the export column names on a real dataset (especially `exceptions` on Android and `blame_frame` on
Apple tables), whether `bigquery.readonly` is enough for `jobs.query` with the given IAM roles, `maximumBytesBilled`
behaviour and the dry-run size, regional datasets (`location`), the console issue links, query cost on large exports.
