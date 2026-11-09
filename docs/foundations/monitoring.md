# Foundation: monitor sources (`monitor-source`)

Service and server health from any number of monitoring systems, in one normalized shape, for any app.
Module: `src/features/monitor-sources.cjs` (feature `monitorSources`; apps may also call `create(s)` themselves).
First consumer: «Мониторинг» (`src/extensions/monitoring`, [docs/apps/monitoring.md](../apps/monitoring.md)).
Contract test: `tests/monitor-sources.cjs` (fake sources in a temp extension folder, no app involved).

## Declaring a source

An extension lists source files in its `extension.json`:

```json
"provides": { "monitor-source": ["prometheus-source.cjs", "uptime-source.cjs"] }
```

`monitor-source` is one of the `REGISTRIES` in `src/features/app-links.cjs` (read by the shared `scan`; never shown
as card buttons). Each file exports:

| Field | Required | Meaning |
|---|---|---|
| `id`, `name`, `color` | no | defaults: extension id / name |
| `names: [RegExp]` | no | how a request names this source («в Grafana») — `registry.named(text)` |
| `ready(settings) → bool` | yes | connected; the registry adds «the extension is added» (its catalog switch) |
| `services(s, query) → [service]` | one of three | health per service |
| `alerts(s, query) → [alert]` | one of three | alerts firing / pending now |
| `history(s, query) → [event]` | one of three | outages / alert intervals in `[query.from, query.to]` |
| `silences(s) → [silence]` | no | read-only |
| `silence(s, {matchers, startsAt, endsAt, comment, createdBy}) → {id}` | no | **the only write** |
| `alertUrl(alert) → url` | no | link for an alert without its own URL |

`query` = `{now, from, to (ms), service, signal, light, aliases}`; `light: true` asks for the cheap form (the
background watch: status only, no signal series).

## Normalized shapes

Everything a source returns is normalized by the registry; apps never see raw formats.

- **service** `{name, status: ok|warn|critical|unknown, since: ISO|null, signals: {errorRate, latencyP95, rps, saturation}, series: {<signal>: [[ms, value]]}, sources: [ids], url, note}` —
  `errorRate` and `saturation` are fractions 0..1, `latencyP95` seconds, `rps` requests/s, `null` = unknown;
  series are sorted, at most 500 points.
- **alert** `{id, name, severity: critical|warning|info, service, startsAt, labels, annotations, source, silenced, state: firing|pending, url}` —
  severity spellings (`page`, `P1`, `crit`, `warn`, …) are mapped.
- **event** (history) `{service, status: critical|warn, from, to|null, title, source, kind: alert|uptime|other}`.
- **silence** `{id, matchers: [{name, value, isRegex, isEqual}], startsAt, endsAt, createdBy, comment, state}`.

## Service identity (shared with the log-source foundation)

All foundations name a service the same way: a **`service` label**. When a source has none, `serviceOf(labels,
aliases)` derives it in this order: `service`, `service_name`, `app_kubernetes_io_name` / `app.kubernetes.io/name`,
`k8s_app`, `app`, `container`, `job` (scrape-job names such as `kubernetes-pods`, `node-exporter`, `blackbox` are
skipped), and finally the host of `instance`. Names are lowercased; the user's aliases (`monitoringAliases`:
`api-prod = api`, one per line) map other names to the canonical one. `findService(text, names, aliases)` finds a
known service in a free-text request (longest match first). The log-source registry (`docs/foundations/log-sources.md`,
built in parallel) uses the same `service` label, so «Мониторинг» hands «логи сервиса <name> за последний час» to
«Логи сервера» without knowing its code.

## Registry API (`create(s)`)

`all()`, `list()` (ready only), `find(id)`, `named(text)`, `aliases()`,
`services(id, q)`, `alerts(id, q)`, `history(id, q)`, `silences(id)`,
`snapshot(q, {only})` → `{at, from, to, services, alerts, history, sources: [{id, name, error, services, alerts}]}`:
every ready source in parallel with a timeout (20 s); a failing source is reported in `sources[].error` and never
fails the snapshot. Services are merged by name (the worst status wins, `since` of that status, the first known value
of each signal); a firing, not silenced alert raises its service to its severity; the same alert from several
sources (same name, service, instance) is one row with `sources`.

`silence(id, {matchers, startsAt, endsAt, comment, createdBy})` refuses: no equality matcher with a value, any empty
value, a missing or non-positive duration, more than 7 days, a source without `silence`. **Callers must only call it
after the user confirmed the exact matchers and duration** (a card button) — the registry never calls it itself.

## State changes: `transitions({now, confirm=2, flapLimit=4, flapWindow=30 min})`

A tracker for background notifications (pure, injected clock, serializable with `state()` / `restore()`):

- a new status counts after `confirm` observations in a row; `warn` counts as up, `unknown` is ignored;
- the first observation is a baseline (ok says nothing, a confirmed critical says `down`);
- events: `down`, `recovered` (only after a told `down`), `flapping` (when `flapLimit` changes happen within
  `flapWindow`; then silent until the key stays in one state for `flapWindow`, after which the settled state is told
  with `settled: true`); the same event is never told twice in a row.

## Notifications and the notification policy

«Мониторинг» publishes each state change as one notification-center card per service (id `monitoring:<service>`,
updated in place) and a system notification through the notification policy
([notifications-policy.md](notifications-policy.md)): `notice` in `src/extensions/monitoring/feature.cjs` (the
watch's `deliver`) calls the core's `notify` with source `monitoring`, urgent when the service went down. Policies
(focus sessions, quiet hours, a per-source mute rule) decide when the popup shows — a summarized or held one is not
lost — and never whether the card is there. The tracker already removes duplicates and flapping, so the policy
receives at most one event per real change.

## `anomalies` compatibility (planned)

A future anomaly foundation can consume monitor sources without changes here. Mapping of one snapshot to anomaly
signals:

| Monitor data | Anomaly signal |
|---|---|
| service `status` change (`transitions` event) | `{metric:'service.status', subject: service, value: 0/1/2, kind:'state-change'}` |
| `signals.errorRate` above the service threshold | `{metric:'http.error_rate', subject: service, value, baseline: series median}` |
| `signals.latencyP95` above threshold | `{metric:'http.latency_p95', …}` |
| `signals.rps` drop below 30 % of the period start | `{metric:'http.rps', direction:'down', …}` |
| firing alert | `{metric:'alert', subject: alert.service, severity, since: startsAt}` |
| uptime failure run (`history` kind `uptime`) | `{metric:'uptime', subject: service, from, to}` |

Series are already numeric `[ms, value]` lists, so the anomaly detector can use them directly.

## Built-in sources

Provided by «Мониторинг» (`src/extensions/monitoring`): Prometheus (`/api/v1/query`, `/api/v1/query_range`,
`/api/v1/alerts`, `ALERTS` history), Alertmanager (`/api/v2/alerts`, `/api/v2/silences` read, `POST /api/v2/silences`
after confirmation), Grafana alerting (`/api/prometheus/grafana/api/v1/rules`, read-only), and Petya's own uptime
checks. Another monitoring system (Zabbix, Datadog, …) is a new extension with its own `monitor-source` file.
