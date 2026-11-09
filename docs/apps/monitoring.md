# Monitoring («Мониторинг»)

Category: dev. Built on the monitor-source foundation ([docs/foundations/monitoring.md](../foundations/monitoring.md)).
Directory: `src/extensions/monitoring/`. Settings card: sources, uptime checks, aliases, notifications.

## What it does

- «что с серверами», «всё ли живое», «лежит прод?»: a health board — every service with a status dot, since when,
  and sparklines of error rate / p95 latency / RPS; alerts firing now (severity chip, age, silenced/pending marks);
  incidents of the week on a 7-day strip (from Prometheus `ALERTS` history, alerts seen by Petya and failed uptime
  probes); uptime per check with a 30-day strip; TLS expiry warnings.
- «какие алерты горят», «аптайм за неделю», «инциденты за неделю» — the same card with that part first.
- «почему лежит api», «почему тормозит payments»: the facts about one service — down instances, its alerts with
  summaries, signals over thresholds, a traffic drop, failing checks. Service from code (`findService`); the model,
  when chosen, only picks one of the known service names.
- «заглуши алерт на час»: which alert (a question with the firing ones when several), how long (a question when not
  said), then a card with the exact matchers (`alertname`, the service label, `instance`) and the duration; the
  Alertmanager silence is created only when «Заглушить на …» is pressed, once (a second press answers «already»; an
  unknown outcome is never retried).
- «найди все адреса серваков в проекте», «какие сервера использует игра»: endpoint discovery in the project folders
  (below).
- Card actions: «Логи этого сервиса» (sends «логи сервиса <name> за последний час» — answered by «Логи сервера»
  when added, otherwise by its offer; hidden when no such app exists), «Создать инцидент-задачу» (`k.links
  task-tracker`), «Сообщить в канал» (`k.links share-message`), «Заглушить…» per alert, «Только алерты»,
  «Аптайм за неделю». Clicking a service asks «почему …» about it.
- Background (off by default, «Сообщать, когда сервис падает и когда поднимается»): due uptime checks and, every
  `monitoringPollMin` minutes, a light snapshot of all sources; a service going down / coming back / flapping is told
  once (foundation `transitions`: two observations confirm, flapping held until settled), as one notification-center
  card per service plus a system notification through the notification policy (source `monitoring`, urgent when
  down; focus, quiet hours or a mute rule decide when it pops up); restored after a window reload. See the
  foundation doc.
- Dashboards: `dashboard.accepts` takes read-only requests only (no silence, no discovery).

## Sources

| Source | API | Auth |
|---|---|---|
| Prometheus | `GET /api/v1/query?query=up` (services by identity labels; down instances), `GET /api/v1/query_range` per service for the golden signals and `up`, `GET /api/v1/alerts`, `ALERTS{alertstate="firing"}` range for history | optional token: Bearer, or «login:password» → Basic |
| Alertmanager | `GET /api/v2/alerts?active=true&silenced=true&inhibited=true`, `GET /api/v2/silences`, `POST /api/v2/silences` (confirmed only) | optional token |
| Grafana alerting | `GET /api/prometheus/grafana/api/v1/rules` (Grafana-managed rules, Prometheus-compatible format; instances in `Alerting`/`Pending`) — read-only | service account token (Viewer), Bearer |
| Uptime checks | Petya's own probes | — |

Grafana endpoint verified against Grafana's alerting client (`/api/prometheus/grafana/api/v1/rules`) and the unified
alerting docs; Grafana silences are not created by Petya. `src/extensions/grafana` (another branch) is not used.

PromQL templates (`promql.cjs`, never written by the model) with `{{selector}}`, `{{window}}`, `{{service}}`:
error rate `sum(rate(http_requests_total{…,code=~"5.."}[5m])) / sum(rate(http_requests_total{…}[5m]))`, p95
`histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{…}[5m])))`, RPS, saturation from
node_exporter CPU. Per service (store `services`): own selector, templates, window and thresholds (defaults: errors
1 % / 5 %, p95 1 s / 3 s, saturation 85 % / 95 %). Selectors and templates are validated (label matchers only, the
three placeholders only).

## Uptime checks

`uptime.cjs`: user-configured `https://` addresses (`http://` only for localhost / private networks), GET or HEAD —
never POST, no body, no stored credentials; expected codes (`200-399` by default), optional keyword, interval 1–60 min,
timeout 1–60 s; status code, latency, TLS days left (from the peer certificate, also through a proxy), keyword match.
Redirects are not followed. At most 4 probes at once. Results are kept 30 days in
`<company data>/monitoring/monitoring.json` (0600), with the alert log, tracker state and recent notices; «Очистить
историю» wipes them. Status: two failed probes in a row → critical, one → warn, TLS < 7 days → warn, expired → critical.

Proxies (`http.cjs`): the Electron session resolver (system proxy / PAC) when available, else `HTTPS_PROXY` /
`HTTP_PROXY` / `ALL_PROXY` with `NO_PROXY`; HTTPS through a CONNECT tunnel; localhost always direct; TLS always verified.

## Endpoint discovery

`discover.cjs` + `csharp.cjs`, code only. Walk: the current project's folders (`project-folders.cjs`), skipping
`node_modules`, `.git`, `Library`, `Temp`, `Obj`, `Logs`, `Build(s)`, `dist`, `out`, `bin`, `.gradle`, `Pods`, … and
`.gitignore` rules (globs, `**`, anchors, negation); text extensions only, binaries (NUL bytes) skipped, 1 MB per file,
150 MB / 20 000 files in total; progress («Читаю файлы: N из M») in the notification center.

Found: http(s)/ws(s)/grpc URLs, `host:port` pairs, base-URL config keys in JSON/YAML/TOML/INI/.env(.example)/
properties/Gradle/AndroidManifest/Info.plist/xcconfig/Dockerfile/compose/k8s/CI files; Unity YAML (scenes, prefabs,
ScriptableObjects, Addressables profiles). C# (`csharp.cjs`): literals (regular, verbatim, raw, interpolated),
`const` / `static readonly` / auto-property / `=>` fields and locals resolved in the class, outer classes,
`ClassName.Field` across files or a project-unique name; `+`, interpolation, `string.Format/Concat/Join`,
`Path.Combine`-like joins, `new Uri(x)`, `new Uri(base, rel)` (RFC 3986), `UriBuilder` (positional and object
initializer), ternaries (both sides); `#if/#elif/#else` conditions per address, evaluated against
`ProjectSettings.asset` `scriptingDefineSymbols` per platform (both formats) — «#if PRODUCTION → Android», «only in
development builds», «editor»; env mappings from `case Env.Prod:`, switch expressions, dictionary entries; host +
port fields folded; `[SerializeField]`/public string defaults matched with values serialized in scenes/prefabs/assets
(script GUID from `.meta` + field name) — the default shows «в сцене задано другое». Unresolved parts stay as
`{Name}` placeholders with where they are declared («RuntimeHost задаётся в рантайме: ServerConfig.cs:16»).

Classification: own servers / CDN and storage (CloudFront, S3, GCS, Azure Blob, R2, `cdn.*`, …) / third-party SDKs
by a known domain list (analytics, ads, attribution, payments, crash, push, backend, multiplayer, platform). Docs and
XML namespace links are dropped. Environment: `#if` symbol, env key, variable/field name, file name, then host name;
the model (if chosen) only names prod/staging/dev for own hosts code could not place (marked dashed). Redaction:
`user:password@`, token-like query values, long secret-looking path pieces, and `key=value` secrets in snippets.

Card: tiles, env filter, groups (own servers under host headers), env chips, provenance buttons `File.cs:12` (open
the file; paths confined to the scanned roots), resolved-piece names, placeholders, `#if` lines, overrides.
«Следить за выбранными» → proposals (health path from the code on the same origin, else the most common health
path seen in the project, else the root; addresses with credentials or placeholders are never probed) →
«Добавить проверки: N» saves them (duplicates skipped). «Скопировать список».

## Phrases

Own: «что с серверами», «всё ли живое», «какие алерты горят», «аптайм за неделю», «почему лежит api»,
«заглуши алерт на час», «инциденты за неделю», «что в Prometheus» (plain «что в Grafana» belongs to the «Grafana» dashboards app), «найди все адреса серваков в проекте»,
«какие сервера использует игра». Near-misses (null / other apps): «мониторинг конкурентов», «мониторинг упоминаний
бренда», «второй монитор не работает», «настрой яркость монитора», «аптайм компьютера», «поставь алерт в
календаре», «логи сервиса api за последний час» (logs), «что с подами в kubernetes» (kubernetes), «почему падает
контейнер postgres», «что запущено в докере» (docker), «адрес офиса», «IP моего компьютера», «проверь, отвечает ли
staging» / «какой статус у health-check прода» (API client), «какие эндпоинты в openapi проекта».

## Tests and verification

- `node tests/monitor-sources.cjs` — the foundation contract.
- `node tests/monitoring.cjs` — fake Prometheus / Alertmanager / Grafana HTTP servers, a local target (codes, keyword,
  timeout, redirect), stubbed TLS dates, a local HTTP proxy, a fake clock for dedupe/flapping, the Unity-like fixture
  project (`tests/monitoring-fixture.cjs`, secrets built at run time).
- `tests/monitoring-ui.cjs` — the cards in the real window, screenshots `petya-monitoring*.png` in the temp folder.

Verified with stubs only: no real Prometheus, Alertmanager or Grafana credentials were available. To verify live:
Prometheus `up`/range queries against a real instrumentation (metric names differ per stack — adjust templates),
Alertmanager silence creation and the silence link, Grafana service-account token and rule format of the installed
version, HTTPS probes through a real corporate proxy (CONNECT + certificate days), Electron `resolveProxy` with PAC.
