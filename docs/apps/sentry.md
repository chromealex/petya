# Sentry

«Sentry» is an extension (`src/extensions/sentry`, category gamedev, switch `extension_sentry`) that provides a crash
source for «Крэши» ([crashes.md](crashes.md)). It has no chat turn of its own: «Крэши» answers, Sentry supplies the
issues, releases, crash-free rates and «Решено».

| File | What it does |
|---|---|
| `client.cjs` | Sentry REST API (sentry.io, a regional `de.sentry.io`, or a self-hosted https URL): organizations, projects, releases, the organization issue stream with 14-day stats, release-health sessions, bulk resolve. |
| `crash-source.cjs` | The crash source: projects (a slug named in the request, the chosen ones, or all), `release()` with exact versions (`1.4.2` finds `com.game@1.4.2+102`, not `1.4.20`), `issues()` (`is:unresolved` + extra filter + `os.name:` + `release:[…]`, environment from the request or the setting), `crashFree()` (sessions and users of the release), `resolve`/`reopen`. Named by «Sentry», «сентри» (alone enough). |
| `feature.cjs` | Settings defaults and validation, the settings card ipc (`status`, `organizations`, `projects`), the migration. |
| `settings.js` | Settings card: address, token (secret), organization, projects loaded from Sentry, environment, extra search filter. |
| `offer.cjs` | Offered when Sentry is named; accepting also adds «Крэши». |

Settings keys (unchanged from when they belonged to «Крэши»): `sentryUrl`, `sentryToken` (secret), `sentryOrg`,
`sentryProjects`, `sentryEnvironment`, `sentryQuery`.

Token scopes: `org:read`, `project:read`, `event:read`; `event:write` for «Решено».

## Sentry API used

- `GET /api/0/organizations/` and `/organizations/{org}/projects/` — settings pickers and slug → id.
- `GET /api/0/organizations/{org}/releases/?query=1.4.2` — exact versions.
- `GET /api/0/organizations/{org}/issues/` with `project`, `query`, `environment`, `statsPeriod` or `start/end`,
  `groupStatsPeriod=14d`, `sort=freq`, `limit=100`.
- `GET /api/0/organizations/{org}/sessions/` with `crash_free_rate(session)`, `crash_free_rate(user)`, `sum(session)`.
- `PUT /api/0/organizations/{org}/issues/?id=…` with `{"status":"resolved"|"unresolved"}`.

## Migration from «Крэши»

Before this extension, Sentry settings lived in «Крэши». `feature.cjs` `migrate` (on loading settings): a user with
`extension_crashes = true` and a saved `sentryToken` gets `extension_sentry = true` and the settings are saved once,
so their crashes keep coming. An explicit decision (`extension_sentry` present in the saved file) is kept; users
without a token, or who removed «Крэши», are not changed. The keys themselves did not change.

## Tests

`node tests/sentry.cjs` (run by `tests/crashes.cjs`): the issue stream request and card data through «Крэши», release
with exact versions and crash-free, platform/yesterday/project/environment filters, errors in words, resolve/reopen,
settings ipc and validation, migration, offer. `tests/crashes-ui.cjs` runs Sentry end to end against a local fake
server. Live verification still needed: token scopes and regional routing on sentry.io, `release:[…]` and `os.name`
filters on a real org, the sessions endpoint with release health, the resolve PUT with `event:write`.
