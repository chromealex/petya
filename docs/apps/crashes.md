# Crashes («Крэши»)

Category: gamedev. Directory: `src/extensions/crashes/`. The app knows no crash service: it shows the crashes of
every connected **crash source** in one chat card. Sources are extensions that declare a `crash-source`:

| Source | Extension | How it reads | «Решено» | Doc |
|---|---|---|---|---|
| Sentry | `sentry` | Sentry REST API (token) | yes | [sentry.md](sentry.md) |
| Firebase Crashlytics | `crashlytics` | Crashlytics BigQuery export, `jobs.query` (service-account key) | no | [crashlytics.md](crashlytics.md) |
| Google Play | `google-play` | Play Developer Reporting API, Android vitals errors (the Google Play connection) | no | [google-play.md](google-play.md) |

Possible later sources (not implemented): Unity Cloud Diagnostics / Backtrace (REST API with a token), Bugsnag
(Data Access API). App Store Connect has no API that lists crashes (only diagnostic logs and Xcode Organizer), so
iOS crashes come through Sentry or Crashlytics.

## The card

Totals for the period (issues, events, users affected), a per-source strip (each source's share of the events, its
issues and events; a click asks for that source only), crash-free tiles of the sources that report it for a named
release (Sentry: sessions and users; Google Play: users), a stacked daily events chart split **by source** (default
with several sources) or **by issue** (the five most frequent issues across sources plus the rest), an optional
«Общее: …» line from the local model, notes (a source that failed or had nothing to say), and the top issues grouped
by source. Each row has a source chip, level, «новый», title, culprit, versions, events/users, a 14-day sparkline,
«Открыть в <источник>», «В задачу …» and «Отдать Программисту» (cross-app links) and «Решено» only for sources that can
resolve. Issues are never merged across sources: the same bug in Sentry and Crashlytics stays two rows.

Chat turns only read. «Решено» / «Отменить» call `crashes` ipc `resolve(source, id)` / `reopen(source, id)` and only
for a source with `resolve`.

## Phrases

Triggers (when the app is added): «какие крэши за неделю», «топ крэшей», «новые крэши после релиза 1.4.2», «что с
крэшами на андроиде», «сколько падений вчера», «покажи краши на iOS». Naming a source reads only it: «что в Sentry
за сутки», «только Sentry», «что в Crashlytics за неделю», «крэши в Firebase», «крэши в Google Play», «крэши в гугл
плей». Sentry and Crashlytics are crash requests by name alone; Google Play and Firebase need a crash word (Google
Play alone is the ANR card or reviews, Firebase alone is any Firebase product).

Filters read from the request: period (вчера, сегодня/за сутки, за неделю, за N дней/часов, за месяц; default 7 days),
release (`релиз/версия 1.4.2`, a bare `1.4.2`, `versionCode 10422` for Google Play), platform (Android/iOS), environment
(«в проде» → production; Sentry falls back to its setting), «новые». A release with no period starts the period at the
release date given by a source that knows releases (Sentry), else 30 days.

Not triggered: ANR (the Google Play ANR card), «упала сборка» and other red builds (CI), «сервер упал» without a crash
word, «падение продаж», fix requests («исправь крэш…» → Programmer), Jira task requests, «что такое крэш-репорт»,
Firebase Analytics / Remote Config / Auth.

## No source connected

When «Крэши» is added but no source is ready, the answer is the shared offer card (`extensionOffers.propose`) listing the
sources to connect («Крэши пока неоткуда взять: подключите источник — Sentry, Firebase Crashlytics или Google Play»).
A request that names a source that is not connected gets the offer for that source only. Accepting adds the source
(and opens its settings, or Petya's Google Play service card); the request is kept and resumed with «Готово —
продолжить». Offers: «Крэши» itself is offered by crash words with a generic pitch; each source has its own offer by
name (`sentry`, `crashlytics`, `google-play`), and accepting one also adds «Крэши» (`also` in `offer.cjs`).

Settings → «Крэши» lists the sources with their state and a button to set each up.

## The crash source interface

Declared in `extension.json` as `"provides": {"crash-source": "<file>.cjs"}`, served by
`src/features/crash-sources.cjs` (`services.crashSources`; the shared `scan` of `src/features/app-links.cjs`). The file
exports:

```
{ id?, name?, color?, names?: [RegExp], standalone?: [RegExp], service?: '<module>',
  ready(settings) -> bool,
  async issues(services, query) -> {issues, more?, url?, scope?, note?},
  async release?(services, name) -> {name, date, versions} | null,
  async crashFree?(services, query) -> {sessions, users, total?} | null,
  async resolve?(services, id), async reopen?(services, id) }
```

`query` is `{text, period:{label, kind, start, end, days, statsPeriod?}, since, release, found, platform, environment,
onlyNew, now}` (`found` is this source's own `release()` answer). An issue is `{id, title, culprit, level, events, users,
firstSeen, lastSeen, versions, platform, project, shortId, daily:[{day, count}], isNew, url, unhandled}`; the registry
normalizes it (numbers, ISO times, https links only) and adds `source`. A source counts while its extension is added
(`setting`) and `ready`. Only crash issues: no ANR or non-fatal reports.

## Limits

- Totals are over each source's first page (Sentry and Crashlytics up to 100 issues, Google Play 100 per app; «100+»);
  users are summed per issue (an upper bound).
- The chart and sparklines cover the last 14 days (Sentry's daily buckets; Play days are America/Los_Angeles dates and
  end at the last complete day).
- Platform filtering: Sentry `os.name` tag, Crashlytics tables per platform, Google Play is Android only.

## Verification

Everything was tested with stubs; no real Sentry, Google Play or BigQuery credentials were available.
- `node tests/crashes.cjs` (also runs `tests/sentry.cjs`, `tests/google-play-crashes.cjs`, `tests/crashlytics.cjs`) —
  routing and near-misses, filters, the registry (declarations, readiness, names, normalization), no-source and
  named-source offers, the merged card of three sources, source filters, partial and total failures, release flow,
  model line, resolve/reopen ipc, offers.
- `tests/extension-offers.cjs` (`propose`, `also`, `service`), `tests/extension-offers-matrix.cjs` (rows for crashes,
  sentry, crashlytics, google-play), `tests/extension-ui.cjs`.
- `timeout 180 xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/crashes-ui.cjs`
  — the three-source card (`/tmp/petya-crashes.png`, `-2.png`), the no-source offer (`petya-crashes-offer.png`), the
  Sentry, «Крэши» and Crashlytics settings cards (`petya-crashes-settings.png`, `petya-crashes-sources.png`,
  `petya-crashlytics-settings.png`), and Sentry end to end against a local fake server with «Решено» / «Отменить».
