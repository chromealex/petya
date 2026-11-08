# Crashes («Крэши»)

Category: gamedev. Directory: `src/extensions/crashes/`.

Shows Sentry crashes in the chat as one card: totals for the period (issues, events, users affected), a stacked
daily events chart (five most frequent issues plus the rest), crash-free sessions/users for a named release, and
the top issues with level, title, culprit, events/users, a 14-day sparkline and a «новый» mark. Per issue:
«Открыть в Sentry», «В задачу Jira» (sends a Jira creation request to the chat; the Jira flow confirms),
«Отдать Программисту» (sends «Исправь баг в коде — крэш из Sentry: …» to the chat) and «Решено» (resolves in
Sentry only when pressed; the toast's «Отменить» reopens it). Chat turns only read.

## Phrases

Triggers (when the app is added): «какие крэши за неделю», «топ крэшей», «новые крэши после релиза 1.4.2»,
«что с крэшами на андроиде», «сколько падений вчера», «что в Sentry за сутки», «краши на iOS».

Filters read from the request: period (вчера, сегодня/за сутки, за неделю, за N дней/часов, за месяц; default
7 days), release (`релиз/версия 1.4.2` or a bare `1.4.2`), platform (Android/iOS → `os.name:` tag), environment
(«в проде» → production, else the settings value), a configured project slug, «новые».

Not triggered: ANR (Google Play extension), «упала сборка» and other red builds (CI), «сервер упал» without a
crash or Sentry word, «падение продаж», fix requests («исправь крэш…» → Programmer), Jira task requests,
«что такое крэш-репорт». The offer (`offer.cjs`) promises Sentry only and is not shown for Crashlytics.

## Setup

Settings → «Крэши · Sentry»: address (`https://sentry.io`, a regional `https://de.sentry.io`, or a self-hosted
https URL), auth token (stored as a secret, `sentryToken`), organization slug, projects (loaded from the API
after the token is saved; none checked = all projects), optional environment and an extra search filter
appended to `is:unresolved` (e.g. `error.unhandled:true`).

Token scopes: `org:read`, `project:read`, `event:read`; `event:write` for «Решено».

## Sentry API used

- `GET /api/0/organizations/` and `/organizations/{org}/projects/` — settings pickers and slug → id.
- `GET /api/0/organizations/{org}/releases/?query=1.4.2` — exact versions (`com.game@1.4.2+102`, not `1.4.20`).
- `GET /api/0/organizations/{org}/issues/` with `project`, `query`, `environment`, `statsPeriod` or `start/end`,
  `groupStatsPeriod=14d`, `sort=freq`, `limit=100` — counts, users, firstSeen/lastSeen, level, culprit, stats.
- `GET /api/0/organizations/{org}/sessions/` with `crash_free_rate(session)`, `crash_free_rate(user)`,
  `sum(session)` for the release — optional; any failure or no sessions just hides the tile.
- `PUT /api/0/organizations/{org}/issues/?id=…` with `{"status":"resolved"|"unresolved"}`.

The model (optional, `app-kit.modelJSON`) adds one «Общее: …» line for 3+ issues; the card is complete without it.

## Limits

- Totals are over the fetched page (up to 100 issues, shown as «100+»); users are summed per issue (an upper bound).
- The chart and sparklines use Sentry's 14-day daily buckets, so a 30-day period shows the last 14 days.
- Platform filtering relies on the `os.name` tag sent by the SDK.

## Firebase Crashlytics (not implemented)

Crashlytics has no public REST API for issues/crash lists. The only programmatic access is the Crashlytics
BigQuery export (`firebase_crashlytics.<package>_<PLATFORM>` tables, daily batch or streaming). Supporting it
would need: the export enabled in Firebase, a Google Cloud service account or OAuth with
`bigquery.jobs.create` and dataset read access, the project/dataset/table names in settings, SQL that groups
by `issue_id` (count events, `COUNT(DISTINCT installation_uuid)`, min/max `event_timestamp`, `application.display_version`
for releases), and no «Решено» (issue state is not writable outside the console). The offer names Sentry only.

## Verification

Everything was tested with stubs; no real Sentry credentials were available.
- `node tests/crashes.cjs` — routing and near-misses, not added / not connected, request parameters, card data,
  release/crash-free, errors (401/403/bad JSON), model on/off, resolve/reopen ipc, settings validation, offer.
- `timeout 120 xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/crashes-ui.cjs`
  — renders cards, screenshots `/tmp/petya-crashes.png`, `-2.png`, `-settings.png`; then end to end through the
  real main process against a local fake Sentry: settings saved, a chat request answered with a card, the settings
  project list, and «Решено» / «Отменить» reaching the server.

To verify live: token scopes and regional routing on sentry.io, the `release:[…]` list syntax and `os.name`
filter on a real org, the sessions endpoint on an org with release health, the resolve PUT with `event:write`.
