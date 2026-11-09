# Log sources (`log-source`)

A foundation for reading server logs. Petya knows no log service itself: extensions provide sources, apps consume
them through one registry with one bounded query shape and one entry shape.

- Registry: `src/features/log-sources.cjs` (kind `log-source` in `REGISTRIES` of `src/features/app-links.cjs`).
- Sources today: Loki and Elasticsearch/OpenSearch (`src/extensions/logs/`), Kubernetes pod logs
  (`src/extensions/kubernetes/log-source.cjs`).
- Consumers today: «Логи сервера» (`src/extensions/logs`). Planned: anomalies, monitoring (see below).
- Contract test: `node tests/log-sources.cjs` (includes a 3000-case fuzz of the validators and `bound`).

## Providing a source

In `extension.json`: `"provides": {"log-source": "my-source.cjs"}` (or a list). The file exports:

| Field | Meaning |
| --- | --- |
| `id`, `name` | Stable id and display name. |
| `language` | `logql`, `kql` or `text` — the language of `spec.query`. |
| `ready(settings)` | Connected (the registry adds «the extension is added»). Synchronous. |
| `compile(filters, settings)` | Structured filters → a query in `language` (used when no valid query is given). |
| `search(services, spec, {check})` | `{entries, histogram?, total?, truncated?, notes?}`. Read-only. |
| `validate?(query)` | A stricter check than the registry's language check: `{ok, query?, error?}`. |
| `services?(services, spec)` | Service names for a «which service?» clarification. |
| `explore?(settings, spec)` | `{label, url}` — «Открыть в Grafana/Kibana». |
| `names?`, `hint?`, `prompt?`, `maxRangeHours?`, `maxLimit?` | How a request names it; a connect hint; what the model must know; own caps. |

A source talks to one fixed read endpoint (Loki `query_range`/`label values`, Elasticsearch `_search`,
`kubectl logs`). It throws `Object.assign(Error(text), {need:'service'})` when it cannot search without a service
(kubectl) — the consumer asks with `services()` as options.

## The spec every source receives (`bound`)

Whatever a model, a card or another app passes goes through `bound(raw, source)` first:

```
{ source, language, query,                       // query validated or rebuilt from filters
  filters: {levels:['fatal'|'error'|'warn'|'info'|'debug'], services:[name], contains:[text], exclude:[text]},
  range: {from, to},                             // ISO; never in the future; ≤ 7 days (or the source's cap); ≥ 1 min
  limit,                                         // 1..1000 (default 200, or the source's cap)
  notes: [text] }                                // what was cut or rebuilt, in Russian, for the card
```

Raw input may be `{query, levels, services, contains, exclude, limit, range:{last:'15m'|'1h'|'24h'|'7d'} |
{from, to}}`. Filters are de-duplicated, at most 8 each, 80 characters; service names `[A-Za-z0-9._/-]`.

Query languages accepted by the registry:

- **LogQL** — log queries only: a stream selector with at least one non-empty matcher, then `|=`, `!=`, `|~`, `!~`
  with quoted strings (≤200 chars, regexes must compile, no lookarounds/backreferences), `| json`, `| logfmt`,
  `| label op value`. Metric queries (`count_over_time`, `sum`, `rate`), `line_format`, `label_format`, `unwrap`
  and anything else are refused; ≤ 12 stages, ≤ 600 characters.
- **KQL subset** — `field:value`, `field:"phrase"`, `field:(a or b)`, free words and phrases, `and/or/not`,
  parentheses; no ranges, no leading wildcards, depth ≤ 5, ≤ 20 terms. `parseKQL` returns a tree; the
  Elasticsearch source compiles it to `match_phrase`/`prefix`/`bool` itself — the model never writes ES DSL.
- **text** — a plain substring.

An invalid query is not an error: it is dropped with a note and the source's `compile(filters)` is used.

## Entries and helpers

`search` results are normalized by the registry (`entry`): `{ts (ISO), level, service, message (≤4000), labels,
source}`, sorted newest first, outside the range dropped, capped to `limit`. `level` comes from a level label,
a JSON/logfmt field or a keyword; `service` from `service`, `service_name`, `service.name`, `app`,
`app.kubernetes.io/name`, `k8s-app`, `container`, `job` (last path part).

`registry.search(id, raw)` returns `{source, spec, entries, histogram, groups, total, truncated, notes, explore}`:

- `histogram` — `{step, buckets:[{t, total, errors, warns}], exact}`: the source's own counts when it has them
  (Loki `count_over_time`, Elasticsearch `date_histogram`, `exact:true`), else from the returned lines.
- `groups` — error signatures (`signature()` replaces numbers, ids, UUIDs, hex, IPs, e-mails, times; JSON `msg` and
  logfmt `msg=` are used as the message) with `count`, `first`, `last`, `services`, `samples` (≤5), most frequent
  first; warnings are grouped only when there are no errors.

Also exported: `parse(text)` (model-free: period, levels, «сервис X», quoted words), `translate(s, request,
source)` (the model writes the query under `SCHEMA`; the result still goes through `bound`), `levelOf`,
`serviceOf`, `stepFor`, `validateLogQL`, `parseKQL`.

## The `service` key — contract with monitoring and anomalies

Entries always carry a normalized `service`. Apps that link to logs pass the service, not a source-specific
selector:

- **Monitoring** (`monitor-source` / «Мониторинг», built in parallel) sends the chat request
  `«логи сервиса <name> за последний час»` through `k.ask`. «Логи сервера» reads it model-free
  (`parse` → `services:[name]`, `range:{last:'1h'}`) and searches the chosen source: Loki by the service label
  (setting, default `service_name`), Elasticsearch by `service.name`/`kubernetes.labels.app`/`app`, Kubernetes
  by the deployment's selector. «что с серверами» and «какие алерты горят» are not logs requests (tested
  near-misses in `tests/logs.cjs` and the offers matrix).
- **Anomalies** (in progress) should call the registry directly, without the model:
  ```js
  const L=require('../../features/log-sources.cjs');
  const reg=s.logSources||L.create(s);
  for(const src of reg.list()){
    const r=await reg.search(src.id,{levels:['error','fatal'],services:['payments'],range:{last:'24h'},limit:1000});
    // r.histogram.buckets (exact when the source counts), r.groups (signatures with first/last seen)
  }
  ```
  A new error signature is `groups[i].first` inside the window; a spike is a bucket of `histogram.buckets` far
  above the others. Sources that need a service (Kubernetes) throw `{need:'service'}` — skip them or iterate
  `reg.services(id)`.

`src/features/log-sources.cjs` is not listed in `src/features.cjs` (the shell is not edited by app work): consumers
use `s.logSources || L.create(s)`. Adding it to `src/features.cjs` later makes `s.logSources` shared.

## Safety

- Read-only: no source calls anything but its read endpoint; Elasticsearch requests are built from the KQL tree
  (no scripts, no `query_string`), the index pattern is validated, kubectl reads go through an allowlist.
- Bounded: period ≤ 7 days (Kubernetes 48 h), ≤ 1000 lines, query ≤ 600 characters; Loki and Elasticsearch
  requests time out after 30 s, Elasticsearch searches carry `timeout:"25s"`.
- Credentials are extension secrets (`logsLokiToken`, `logsElasticKey`); kubectl uses the user's kubeconfig.
