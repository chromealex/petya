# Naming («Нейминг»)

Category: creative. No settings card (`settings: false`, setting `extension_naming`).

## What it does
- «придумай название для ивента на Хэллоуин», «имена для героев-гномов», «как назвать фичу с сундуками»,
  «название игры про бункер»: the local model proposes candidates (default 8, up to 12) with a short meaning, in the
  requested style, language («на английском», «на русском») and length («до 8 букв», «короткие», «одним словом»).
- «проверь название «Bunker Wars»», «свободны ли названия: A, B»: only the checks, no model needed.
- Follow-ups: «Ещё в этом стиле» / «Короче» on the card (or a bare «ещё», «короче» right after the card) — names
  already shown in this thread are excluded, «короче» sets a length of ~70% of the previous average.

## Checks (all by code)
- Length in characters and words; mixed Cyrillic/Latin (homoglyphs), unusual characters; over the requested limit;
  game names over 30 characters (App Store / Google Play title limit).
- Transliteration (Cyrillic → Latin, Latin → a Russian reading) and simple pronunciation notes: ы/щ/ж/х/ц for English
  speakers, th/w/ough/c for Russian speakers, clusters of 4+ consonants.
- Duplicates in the current project (folders of the chat's project): texts and keys of localization files through the
  «Локализация» app's `find.cjs` / `formats.cjs` (read-only, any language), and code identifiers (`.cs .js .ts .py .gd
  .lua .cpp .java .kt .swift …`, bounded walk: 4000 files, 512 KB each, skips Library/node_modules/Build…; cached 5 min).
  Comparison is across scripts («Гномгард» = «Gnomgard»), exact or similar (edit distance 1–2, a separate word, an
  identifier that starts with the name).
- App Store: iTunes Search API `https://itunes.apple.com/search?term=…&entity=software&limit=15&country=US|RU`, one
  request per candidate, sequential with a 250 ms pause. Exact = the listing's main title (before «:» / « - ») matches.
- Google Play has no search API: one search for all candidates through Petya's own web search
  (`webSearchEngine.searchAPI`, `site:play.google.com/store/apps "A" OR "B" …`), only when «Поиск в интернете» is on;
  otherwise the card says Google Play was not checked. The search returns a few top links only, so this is best effort.
- .com domain via RDAP `https://rdap.org/domain/<name>.com` (404 → free, 200 → registered) for game names, when the
  request mentions a domain/site, or from the card's «Проверить домены .com».

## Card (`namingCard`)
Candidates free first: name, verdict chip «свободно» / «похоже на «…»» / «занято: «…»», a length bar against the limit
(red when over), dots for project / App Store / Google Play / .com with the match in the tooltip, meaning,
transliteration and notes, «Скопировать» per name; actions «Ещё в этом стиле», «Короче», «Проверить домены .com»,
«Скопировать все». «Добавить в глоссарий» is not shown: Petya has no glossary yet.

## Phrases
Own: the four above, «предложи никнеймы для босса-дракона», «как назвать новый режим», «подбери названия для локаций».
Near-misses (null / no offer): «как назвать переменную» / «функцию» / «ветку» / «таблицу» (code names — left to the
coder and Petya), «переименуй задачу», «придумай название задачи» (Jira), «назови сумму», «как называется игра про
бункер», «какое название у этой игры».

## Tests and what is verified
`node tests/naming.cjs` (stubs for the model, iTunes, RDAP and web search; a temporary project with a CSV localization
file and a C# file) and `tests/naming-ui.cjs` (real window, screenshots `petya-naming*.png`). The iTunes Search API and
rdap.org were not reachable from the build machine, so the request/response shapes are verified with stubs only;
check live: a real iTunes search, an RDAP lookup for a free and a taken .com, and Google Play results through the
search browser (it may ask to pass a check page).
