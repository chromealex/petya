# Config balance («Конфиги и баланс»)

Category: gamedev. Directory: `src/extensions/config-balance/`. No settings card (`settings: false`). Uses
`code-fix` (Programmer) and `spreadsheet-export`; reads Google Sheets through «Google Таблицы»
(`services.googleSheets`) when that app is added and connected.

## What it does

Two sides, all read by code:

- **Balance tables**: a Google Sheet tab (a pasted link, the confirmed mapping's source, or known spreadsheets whose
  title/tab looks like balance), or CSV/TSV/XLSX in the project (`xlsx.cjs`: a small ZIP + sheet XML reader, every
  sheet). A CSV named or kept under «balance/баланс» is a table, not a config.
- **Configs** in the project folders (bounded walk, Library/Temp/Build/… skipped): Unity ScriptableObject `.asset`
  (`unity-yaml.cjs`: documents `--- !u!114 &id`, MonoBehaviour fields, flow maps, references `{fileID, guid}`, wrapped
  quoted strings; tags/anchors are never resolved, nothing is executed; grouped by script guid and named by the class
  from its `.cs.meta`), JSON (array of objects, a wrapper with one list, object of objects, or one object per file),
  CSV with an id column. Nested fields become paths (`stats.hp`, `levels[1].bonus`); every value keeps its line.

Features:
- **Mapping**: the key is the table column and object key (id, name, a string field, file name) with the most
  overlapping values; columns ↔ fields by name (Russian ↔ English game words: Урон→damage, Здоровье→hp, Скорость
  атаки→attackSpeed, Цена→cost…) or by agreeing values on the matched rows; the local model only suggests pairs for
  leftover columns (names must exist on both sides). The card shows each pair with a field choice (ipc `remap`) and
  «Подтвердить сопоставление» (ipc `confirm`), saved per project in `config-balance.json` in the company data folder.
- **Differences**: per mapped cell — object, field, sheet value, config value, delta, status (совпадает /
  расходится / нет в конфигах / нет в таблице / нет поля), file:line. «почему урон лучника в игре не как в таблице»
  answers with that cell («В таблице «Урон» у «Лучник» — 12, а в Archer.asset — 10 (строка 20)…») and highlights it.
- **Validation**: types (majority type per field), required (present in ≥75%), ranges (inferred min 0, ×10 outliers;
  user min/max), enums (inferred; a singleton one edit away from a common value is a likely typo; user enums),
  references (string fields ending in Id/To/Ref must name an existing object; Unity guids must exist in the project's
  `.meta` files), duplicate keys in configs and in the table. User overrides per field (ipc `setRule`) are saved per
  project and turn warnings into errors.
- **Versions**: `git log -p` (5 commits, bounded) tells which config files changed; both versions are parsed and
  compared field by field («archer.damage 10 → 9»), uncommitted edits first. Git runs with argument lists, no shell.
- **Applying** (never writing files): «Применить в конфиги (Программист)» → `code-fix` with the exact change list
  («Как программист, в отдельной ветке обнови значения … Archer.asset: damage 10 → 12 (строка 20); …»), which the
  Programmer does in its own branch with a diff for review. «Записать в таблицу…» (Google Sheet source, writing on):
  ipc `prepareSheetWrite` lists the cells old → new, «Записать N ячеек» → `writeSheet` → `googleSheets.applyUpdate`
  (re-reads the cells first; once per card). «Выгрузить отчёт» → `spreadsheet-export`.

Phrases: «сверь баланс с конфигами», «что поменялось в балансе с прошлой версии», «проверь конфиги юнитов», «почему
урон лучника в игре не как в таблице», «сверь баланс экономики с конфигами» (a named table wins). Near-misses (null /
no offer): «конфиг CI», «настройки Пети», «баланс на карте», «конфиг nginx», «баланс работы и жизни», «что в таблице
баланса» (Google Sheets), balancers and server configs. No project folder → a question; a sheet link without
«Google Таблицы» → the offer card for it.

## Verified

Unit `node tests/config-balance.cjs` on fixtures (`tests/fixtures/config-balance/project`: five unit `.asset`
files, `.meta` guids, `items.json`, `waves.csv`, `units-balance.csv`, `economy.xlsx`) and a temporary git repo, plus
the fake Sheets API: parsing, mapping, differences with lines, validation kinds, the Programmer text (accepted by the
coder's `isCoding`), remap/confirm/override persistence, a named table, the sheet write on confirm (once), history,
and that no project file changes. UI `tests/config-balance-ui.cjs` with card data computed by the feature
(screenshots `petya-config-balance*.png`).

Needs live checking: real Unity projects (large `.asset` counts, prefab-embedded ScriptableObjects, `stripped`
documents, multi-line plain scalars), real balance sheets (merged headers, several header rows), the Programmer
applying the change list to `.asset` files without reserializing them, git on large repositories.
