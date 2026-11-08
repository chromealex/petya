# SQL from words («SQL по словам»)

Category: analytics. Directory: `src/extensions/sql/`. Settings card: connections, BigQuery key, auto-run rules.

A question in words becomes one read-only SQL query over a connected database. The query and its estimated cost are
shown **before** it runs; it runs after «Выполнить» (or at once when the user turned on auto-run and the estimate is
under the threshold). The result is a table plus a chart chosen by its shape.

## Flow
1. **Schema** of the connection (tables, columns, types, comments, row counts) is read once and cached for a day in
   memory and in `<company>/extensions/sql/schema-<id>.json` (names only). «Обнови схему» re-reads it.
2. **The model** (local Ollama, `kit.modelJSON`) writes SQL from the question and the schema as compact text — for a
   large schema only the tables closest to the question (name/column/comment overlap plus a small Russian→English
   game-analytics dictionary), the rest listed by name. JSON schema `{sql, explanation, assumptions}`.
3. **Code checks it** (`validate.cjs`, by the connection's dialect):
   - a tokenizer that knows each dialect's quoting (PostgreSQL `E''` and `$tag$` strings, nested comments; backslash
     escapes in ClickHouse/BigQuery/MySQL; BigQuery triple-quoted and raw strings; backtick identifiers);
   - one statement only (a single trailing `;` is dropped), starting with SELECT or WITH;
   - no DML/DDL/session words anywhere (data-modifying CTEs, `SELECT … INTO`, `SET`, `COPY`, `CALL`, locks,
     ClickHouse `SETTINGS`/`FORMAT`/`INTO OUTFILE`, BigQuery scripting), no MySQL executable comments or hints;
   - dangerous functions per dialect (PostgreSQL `pg_sleep`, `pg_read_file`, `lo_*`, `dblink`, `set_config`,
     `nextval`, `query_to_xml` …; ClickHouse `url`, `file`, `s3`, `remote`, `mysql`, `postgresql`, `executable`,
     `sleep` …; BigQuery `EXTERNAL_QUERY`; MySQL `sleep`, `benchmark`, `load_file` …);
   - no invisible or look-alike characters (bidi overrides, zero-width, full-width punctuation);
   - a top-level LIMIT is added or lowered (default 500; ClickHouse unions are wrapped);
   - comments are removed, so the SQL on the card is exactly what runs;
   - every table the query reads must exist in the schema (CTE names, table functions and `EXTRACT(… FROM …)` are
     not tables). A refused draft is retried once with the reason; a second refusal shows the card «не прошёл
     проверку» without «Выполнить».
4. **Estimate**: BigQuery dry run (`totalBytesProcessed`, nothing billed; a query over the connection's read limit is
   blocked), ClickHouse `EXPLAIN ESTIMATE` (rows to read, shown against the tables' total rows), PostgreSQL
   `EXPLAIN (FORMAT JSON)` (planner rows).
5. **Run** — ipc `run(cardId)`: the SQL is taken from the stored chat message, never from the renderer, and checked
   again. The message keeps the result (first 200 rows), so it survives a restart. Runs publish to the notification
   center (`sql:<id>`).

Chart by shape (`chart.cjs`): one number → big number; date + 1–4 numbers (or date, category ≤5, number) → lines;
category + number, 2–50 rows → horizontal bars (top 15); otherwise the table only.

Typed SQL («выполни SELECT …», or in backticks) skips the model and goes through the same checks and estimate.
A request to change data in a named database («SQL: удали тестовые события») gets «only reads» without the model.

## Connections
- **ClickHouse** — HTTP interface, `POST <url>/?database=…` with `FORMAT JSONCompact`, credentials in
  `X-ClickHouse-User`/`X-ClickHouse-Key`. Settings in the URL: `max_execution_time=30`, `max_result_rows`,
  `result_overflow_mode=break`, and **`readonly=1` last** (after it no setting may change). A user whose profile is
  already read-only refuses URL settings (code 164): the query is repeated with `readonly=1` alone. Schema from
  `system.columns`/`system.tables` with `{db:String}` query parameters.
- **PostgreSQL** — a pure-JS wire protocol v3 client (`postgres.cjs`, no dependency): TLS via SSLRequest (verified by
  default; «TLS без проверки» for self-signed; no TLS only to localhost), SCRAM-SHA-256 / MD5 / cleartext (cleartext
  only over TLS or localhost). Each query: `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '30s'`, then
  the extended protocol (Parse/Bind/Describe/Execute(max rows)/Sync — it refuses several statements), then `ROLLBACK`.
- **BigQuery** — REST with a service-account key through the shared JWT path (`src/google-service-account.cjs`,
  scope `bigquery.readonly`). The app's own key (`sqlBigQueryCredential`) or, when none, the key already saved for
  «Firebase Crashlytics» (not copied). Schema from `tables.list` + `tables.get` (free); date-sharded tables
  (`events_YYYYMMDD`) become one wildcard table. Queries carry `maximumBytesBilled`, `defaultDataset`, `location`.
- **MySQL** — not built in: a dependency-free client needs `caching_sha2_password` (RSA or TLS full auth); MySQL is
  reachable through Grafana's MySQL datasource (below). The validator already knows the MySQL dialect.
- **Grafana** (`query-source`) — see below.

Stored: `sqlConnections` (no secrets), passwords in the feature secret `sqlCredential` (id → password), the
BigQuery key in `sqlBigQueryCredential`. Both settings are limited to 2000 characters by the settings store.
The form never gets a password back; an empty password field keeps the stored one. Auto-run: `sqlAutoRun`,
`sqlAutoRunGb` (BigQuery bytes), `sqlAutoRunRows` (ClickHouse/PostgreSQL estimate); `sqlMaxRows` (LIMIT).

## `query-source` contract (other apps)
Registered in `REGISTRIES` of `src/features/app-links.cjs`; documented in `sources.cjs`. An extension declares
`"provides": {"query-source": "query-source.cjs"}` exporting `{id?, name?, ready(settings), connections(s) →
[{id, name, dialect}], schema(s, id) → {tables}, estimate?(s, id, sql), run(s, id, sql, {maxRows}) → {columns, rows,
truncated?, elapsedMs?, bytesRead?}}`. Its connections appear as `src:<provider>:<id>`, labelled «name · Provider»;
every statement passes this app's validator for the connection's dialect and the user's «Выполнить» first.

**Grafana** implements it (`src/extensions/grafana/query-source.cjs`): the SQL datasources a Viewer sees in
`/api/frontend/settings` (PostgreSQL, MySQL, the ClickHouse plugins) become connections; schema and queries go
through `POST /api/ds/query` with `rawSql` and the table format; Grafana runs them as the datasource's user, so that
user should be read-only. Prometheus and other non-SQL datasources are skipped; BigQuery via Grafana is not used
(the built-in BigQuery connection is better).

## Phrases
Own (added + connected): «Сколько игроков дошли до 10 уровня за неделю», «топ стран по платежам», «покажи схему
таблицы events», «какие таблицы в базе данных», «SQL-запрос: …», «… в ClickHouse/BigQuery/постгресе»,
«выполни SELECT …», «обнови схему базы». A question in words without database words is taken only when a database
is connected (with several connections — only when a cached schema matches the question), and never for other
apps' subjects (DAU/retention/revenue/new players, crashes, reviews, tasks, builds, A/B tests).
Near-misses (null): «напиши SQL-миграцию» (coder), «что такое JOIN», «база знаний», «создай таблицу …»,
«оптимизируй этот SQL», «почему падает контейнер postgres» (docker), «сколько новых игроков вчера», «DAU за неделю»
(metrics), «найди в таблице …» (sheets). Added but not connected: database words get the question where to connect.
Note: with both «Метрики игры» and this app added and connected, a generic «топ стран по платежам» may be claimed by
either depending on turn order; naming the database («… в ClickHouse») makes it unambiguous.

## Cards
Query: connection, dialect, status chip, the question, what the query counts, assumptions (collapsible), the SQL with
light highlighting (selectable), chips «LIMIT … добавлен», «только чтение», the cost gauge (bytes against the read
limit, or rows against the tables' rows), «Выполнить» / «Обновить» / «Повторить», «Копировать SQL»,
«Копировать таблицу» (TSV), «Уточнить вопрос». Result: line chart (SVG, up to 5 series, legend), bars, or a big
number, then the table (10 rows, «Показать все строки»), rows/time/bytes read.
Schema: tables with a size bar (log scale), row and column counts and first columns (click → that table's schema);
one table: columns with types and comments.

## Verified
With stubs and local fakes only (no real credentials): `node tests/sql-validator.cjs` (rules plus 1800 generated
hidden/exposed cases and 3000 random inputs per dialect), `node tests/sql.cjs` (a real HTTP fake ClickHouse server,
a fake PostgreSQL server speaking the wire protocol with SCRAM-SHA-256, BigQuery REST stubs with a generated RSA
key, Grafana `/api/ds/query` stubs), UI `tests/sql-ui.cjs` (screenshots `petya-sql*.png` in the temp folder).
Not verified live: real ClickHouse Cloud/BigQuery/PostgreSQL servers (TLS certificate chains, `EXPLAIN ESTIMATE`
on real tables, BigQuery IAM errors), Grafana's ClickHouse plugin query fields across plugin versions.
