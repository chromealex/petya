# Google Sheets («Google Таблицы»)

Category: docs. Directory: `src/extensions/google-sheets/`. Connects: Google (shared connection
`src/google-workspace.cjs`, see below). Provides the cross-app kind `spreadsheet-export`.

## What it does

- **Open a tab** from a pasted link (`docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>` → that tab) or by a spoken
  name of a known spreadsheet or tab: «что в таблице баланса», «покажи лист Юниты». Spreadsheets are remembered when
  opened by link (setting `googleSheetsKnown`, up to 30; listed in settings with «Забыть» and «Добавить по ссылке»).
  Two known spreadsheets and a name that fits neither → a clarification with the titles as choices.
- **Card**: tab chips (another tab loads through ipc `sheet`), a row filter, the table with the header row detected
  from the data (or the frozen row), a sticky header and first column, numbers right-aligned with a thin bar
  (|value| / column max, negatives red), «Открыть в Google Таблицах», «Найти…», «Добавить строку…». Up to 200 rows ×
  30 columns are shown; formatted values come from `FORMATTED_VALUE`, numbers from `UNFORMATTED_VALUE`.
- **Search** «найди в таблице лучника»: one `values:batchGet` over up to 12 tabs (1000 × 40 each), matching by
  Russian word stems («лучника» → «Лучник»), results by tab with the row's other fields.
- **New row** «добавь строку в таблицу Юниты: Друид; druid; 14; 90; 180» (or `Столбец=значение` pairs; free text
  through the local model, values not in the request are dropped). The card shows the last rows and the new one;
  «Добавить строку» appends once (`values:append`, `INSERT_ROWS`). Numbers are typed by the column.
- **Export** (`spreadsheet-export`): another card hands `{title, sheet?, app?, header, rows}` (≤2000 rows, 40
  columns); the provider puts it into memory (2 h) and sends «Выгрузи в Google Таблицы «…» · N строк · #id» to the
  chat; the export card previews it and asks where: a new spreadsheet (own account only), a new tab of a known or
  pasted spreadsheet, or an existing tab — then «Показать изменения» lists the exact cells old → new and «Выгрузить»
  refuses if the tab changed after the preview. Used by «Планирование спринта» (the plan), «Метрики игры» (daily
  series of the shown source), «A/B-тесты» (groups and lifts) and «Конфиги и баланс» (the reconciliation report and
  version diff).
- **Cell updates for other apps** (`services.googleSheets.applyUpdate({spreadsheetId, changes:[{sheet,row,col,old,new}]})`):
  every cell is re-read first; if any differs from `old`, nothing is written («Ячейки изменились после проверки»).

All writes use `valueInputOption=RAW` (text that looks like a formula stays text), happen only on a card button, are
done at most once per card (`done` is kept in the chat message; an unanswered write is marked and never repeated
blindly) and are announced in the notification center for exports.

Phrases: «что в таблице баланса», «покажи лист Юниты», «найди в таблице лучника», «добавь строку в таблицу …», a
pasted link, «открой Google Sheets». Near-misses (null): «сверь баланс с конфигами» (config-balance), «таблица
умножения», «составь таблицу сравнения», Excel/CSV files, localization tables, «покажи лист ожидания» (a tab is named
with a capital letter or in quotes). The offer fires on the name (Google Sheets / гугл таблицы) or a spreadsheet link.

## Setup and what to enable in Google Cloud

Settings («Настройки → Google Таблицы»): the sign-in path, «Разрешить запись», known spreadsheets.

- **Google account** (default, `googleSheetsAuth=account`): the OAuth Desktop client already imported for Gmail.
  In its Google Cloud project enable **Google Sheets API** (APIs & Services → Library). On the OAuth consent screen
  add `https://www.googleapis.com/auth/spreadsheets.readonly` and, for writing,
  `https://www.googleapis.com/auth/spreadsheets`; while the app is in Testing, add the user to Test users. «Разрешить
  чтение таблиц» asks only for the read scope; the write scope is asked only after «Разрешить запись» is on.
- **Service account** (`googleSheetsAuth=service`): enable Google Sheets API in the account's project, create a JSON
  key (IAM & Admin → Service accounts → Keys), load it in settings (stored as the secret `googleSheetsCredential`);
  the settings show its address with «Скопировать адрес». Share spreadsheets with it as Viewer (read) or Editor
  (write). A service account cannot create a spreadsheet the user would see, so exports go to a tab of a shared one.
- Drive search is not used (no Drive scope): spreadsheets become known by link.

## Shared Google connection for other Google apps (`src/google-workspace.cjs`)

Google Docs and Drive apps should use this module instead of their own auth:

```js
const ws=require('../../google-workspace.cjs');
ws.SCOPES                 // {sheets:{read,write}, docs:{read:documents.readonly, write:documents}, drive:{read:drive.readonly, write:drive.file}}
ws.accounts(settings,'docs')          // mail Google accounts: [{key:'google:<id>', id, email, label, read, write}] for that product
ws.chosen(settings,'docs',key)        // the app's chosen account while it has read access, else the first one that has
await ws.consent(s,'docs',{account:key,write:false,onDone:r=>…})   // incremental consent; r = {ok, account} | {ok:false, error}
await ws.token(s,'docs',{mode:'account',account:key,write})        // access token; refresh is done by the mail client
await ws.token(s,'docs',{mode:'service',credential:json,write})     // service-account JWT grant, cached per key and scope
ws.serviceEmail(json); ws.parseKey(json); ws.configured(s)          // address to share with; key validation; OAuth client imported?
// A product may be a list: ['drive','docs'] needs both (accounts/chosen/token/consent ask for every scope at once).
ws.parseLink(text)        // {kind:'document'|'spreadsheet'|'presentation'|'form'|'drawing'|'file'|'folder', id, url} | null
ws.kindOf(mime); ws.MIME_OF[kind]; ws.fileUrl(kind,id)              // Drive MIME types ↔ kinds; the editor link of a file
ws.docText(documentsGetAnswer)       // {title, blocks:[heading|p|li|table with heading trail], text (Markdown), truncated}
```

Scopes are per product: a write scope covers reading (`spreadsheets` ⊃ `spreadsheets.readonly`), but `drive.file`
does not mean reading Drive. Consent keeps already granted scopes (`include_granted_scopes`), so Gmail, Calendar,
Sheets, Docs and Drive accumulate on one account. «Google Диск» (docs/apps/google-drive.md) is the first app on Drive
and Docs. Each app keeps its own settings (which path, which account, its own
service-account key secret) and passes them in; the module names no app.

## Verified

Unit (`node tests/google-workspace.cjs`, `node tests/google-sheets.cjs`) against a local fake Sheets API and token
endpoint (`tests/fake-sheets.cjs`): link/gid parsing, A1 quoting, header detection, routing and near-misses, not added
→ null, not connected → question, known names and tabs, the clarification, search, append once, export to a new tab /
existing tab (diff + stale refusal) / new spreadsheet, the service-account token, the provider without write
permission, 403 / API-disabled messages. UI (`tests/google-sheets-ui.cjs`, `tests/spreadsheet-export-ui.cjs`):
screenshots `petya-google-sheets*.png`, `petya-spreadsheet-export-ab.png` in the temp folder.

Needs live checking with real credentials: the consent screen with the Sheets scopes on the shared Desktop client,
the service-account path on a shared spreadsheet, `spreadsheets.create` placement in the user's Drive, large sheets
(header detection on real layouts, merged cells), rate limits.
