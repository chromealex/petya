# Localization (`localization`, «Локализация»)

Local extension, category `gamedev`. Checks a project's localization files and translates missing strings with
the local model. No account and no network besides the local Ollama model used for translation.

## Formats
- Unity Localization String Tables: YAML `.asset` tables (`m_TableData`, `m_LocaleId.m_Code`) joined to their
  `SharedTableData` (`m_Entries` keys) by the GUID in the `.meta` file, or by collection name without `.meta`.
- I2 Localization CSV / Google Sheets export / plain CSV and TSV: key column plus language columns
  («English», «German [de]», «English(en)», «de», «Русский»); Type/Desc/Comment columns are ignored.
- JSON: one file per language (`en.json`, `locales/de/common.json`), nested keys flattened, or one file with
  language sections.
- Android `res/values*/strings.xml` (`values-pt-rBR`, `values-b+es+419`; `values-night` is not a language;
  `translatable="false"` skipped). Plurals and string arrays are not checked.
- iOS `xx.lproj/*.strings` (UTF-8 or UTF-16) and `.xcstrings` (shouldTranslate=false and plural variations skipped).
- gettext `.po` with `.pot` template; fuzzy entries count as untranslated; plural entries are checked, not translated.

## Checks (code, not the model)
Per target language: total keys, translated, missing (no entry), empty, identical to source (likely untranslated),
placeholder/tag mismatches (`{0}`, `{name}`, `{{x}}`, `%s`, `%1$d`, `%@`, `%(name)s`, `<b>`, `<color=…>`; format
specifiers like `{0:N2}` are ignored) and too long strings (target longer than source × ratio, default 1.4, set in
the extension settings; short sources/`btn` keys are flagged as buttons).

## Translation
«Переведи недостающие / пустые строки (на испанский)» or the card's «Перевести недостающие»: missing and empty
strings go to the local model in batches of 20 with a JSON schema. Placeholders and tags are replaced by numbered
markers before the model sees the text, restored afterwards and verified; failures are retried once in batches
of 5 and then listed in the card (never written). Up to 400 strings per request. Progress goes to the
notification center (`localization-translate`).

Nothing is written until the user presses «Сохранить переводы» in the card. Then each language goes into a NEW
file beside the source (opened with `wx`, never over an existing file; source files are never modified):
`I2Languages.petya-es.csv`, `de.petya-de.json`, `Localizable.petya-de.strings`, `Localizable.petya-de.xcstrings`,
`messages.petya-de.po`, `UI.petya-de.csv` (Unity CSV-extension layout `Key,Id,<Language>(code)`), and for Android
`<module>/src/main/strings.petya-de.xml` (outside `res/`, so aapt never sees it). Saving checks the company is
unchanged and works once per translation.

## Phrases
«что не переведено», «проверь локализацию», «недостающие ключи на немецкий», «переведи пустые строки на испанский»,
«покажи проблемы с плейсхолдерами в локализации». Near-misses returning null: «переведи эту фразу на английский»,
«перевод денег на карту», «перевести задачу в другой статус», «переведи 100 рублей Пете».

## Inputs
Attached localization files (read from disk when picked with a path, otherwise from the extracted text; the
output then goes to the project folder or Downloads), else the current chat project's folders (bounded walk,
skipping Library/Temp/Build/node_modules/…; files named `*.petya-*` are ignored).

## Verified
Unit (`node tests/localization.cjs`) on synthetic fixtures from `tests/fixtures/localization/make.py` with the model
stubbed (`s.request`), including a model that drops placeholders. UI (`tests/localization-ui.cjs`) renders the
report and translation cards in the real Electron chat; screenshots `petya-localization.png` / `-2.png` in the
temp folder. Not yet verified with a real Ollama model or on large production tables.
