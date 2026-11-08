# Server logs («Логи сервера», `logs`, category dev)

Server logs in the chat, on top of the `log-source` foundation (`docs/foundations/log-sources.md`).

## What it does

- Reads logs from Loki, Elasticsearch/OpenSearch, or Kubernetes pod logs (when «Kubernetes» is added).
- The card: the query that ran (LogQL/KQL/text), totals, a histogram over time with error stacks (exact counts
  from the source when it has them), error signatures (numbers/ids normalized) with counts, a share bar and
  first/last seen, the entries table coloured by level with a level filter, notes about cuts.
- «Почему?» on a signature: the local model explains it from the group's lines only; quotes not in the lines are
  dropped. «Создать задачу» through the `task-tracker` link (only connected trackers appear).
  «Открыть в Grafana» / «Открыть в Kibana» when those URLs are set.
- The model translates «ошибки оплаты за последний час» into the source's language under a strict JSON schema;
  the registry validates and bounds it (period ≤ 7 days, ≤ 1000 lines, log queries only). An invalid query is
  rebuilt from the structured filters; service names the model did not read in the request are dropped; the
  period said in the request wins. Without a model, a model-free reading (period, levels, «сервис X», quoted
  words) is used.

## Phrases

«логи сервера за последний час», «ошибки оплаты в логах за час», «логи сервиса payments за 15 минут» (what
monitoring sends), «что в Loki по api за сутки», «ошибки в Кибане», «ошибки на проде за час», «логи пода api».
Short follow-ups right after a logs card («а за сутки?», «только payments») stay here.

Near-misses (tested): Docker container logs, CI build logs, Unity/Editor logs, git log, chat logs, «логин»,
logistics, monitoring («что с серверами», «какие алерты горят», «сервер упал», «метрики сервера»), «ошибки оплаты в
поддержке», and «ошибки оплаты за последний час» without a logs context.

## Setup

Settings → «Логи сервера»: Loki URL, user + password/token (basic) or token alone (bearer), tenant
(`X-Scope-OrgID`), service label (default `service_name`), default selector, Grafana URL + datasource UID;
Elasticsearch/OpenSearch URL, index pattern (default `logs-*`), API key (`ApiKey`) or user + password, Kibana URL;
the default source when several are connected (otherwise Petya asks). Secrets: `logsLokiToken`, `logsElasticKey`.

## Limits

- Reads only. Loki: `query_range` and label values. Elasticsearch: `_search` with a bool query built from KQL.
- Kubernetes pod logs need a service (Petya asks with the deployments as options) and only cover live pods.
- The entries table shows up to 300 lines; the card says when there are more.

## Verified

Unit (`node tests/logs.cjs`): fake Loki and Elasticsearch HTTP servers — request shape, auth headers, ns/ISO
ranges, histograms, error mapping, model query validation, clarifications, grounded «Почему?». UI
(`tests/logs-ui.cjs`, screenshots `petya-logs.png`, `petya-logs-lines.png`). Not verified live: no real Loki,
Grafana Cloud, Elasticsearch or OpenSearch credentials were available; the Grafana Explore URL uses the
`schemaVersion=1&panes=` format of current Grafana.
