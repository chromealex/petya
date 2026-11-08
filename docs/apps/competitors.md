# Competitors («Конкуренты»)

Category: gamedev. Directory: `src/extensions/competitors/`.

Competitor games tracked per project. One card: a row per game with an icon placeholder (initials on a colour from
the name — no store images are downloaded), name, developer, store, rating with the number of ratings and its change
over a week (or a month), a rating sparkline from the local daily snapshots, the last update chip, version, size,
price, genre, change badges (new version, new release notes, rating, number of ratings, size, price — against the
previous snapshot), up to three highlights quoted from the release notes and the full notes collapsible. Per row:
«Открыть в App Store/Google Play» and «Убрать» (red trash; the toast's «Отменить» restores it, the history is kept).
Card actions: «Сравнить с нами», «Что нового у конкурентов», «Добавить конкурента» (puts the phrase in the composer).
In compare mode a rating bar chart puts our games (highlighted) and competitors on one scale. Search candidates get
«Следить».

## Phrases

Triggers (when the app is added): «что нового у конкурентов», «добавь в конкуренты Clash of Clans», «у кого вырос
рейтинг», «какие механики добавили в обновлениях», «покажи список конкурентов», «убери Brawl Stars из конкурентов»,
«сравни нас с конкурентами», «следи за https://apps.apple.com/…/id529479190».

Intents: add (name, App Store link or id, Google Play link or package), remove, list, news (default; «за неделю/
2 недели/месяц/2 месяца», 30 days by default), mechanics, rating (week; «за месяц» → 30 days), compare.

Not triggered: «конкурс», «конкурент в шахматах/турнире», «конкурентные преимущества», «конкурентоспособная
зарплата», «сравни iPad и iPhone», our own store reviews/rating («какой рейтинг у нашей игры в App Store» belongs to
«Отзывы в сторах»), «что нового в Unity», «какие механики в нашей игре».

## Data

- App Store: Apple's public iTunes Lookup/Search API, no credentials —
  `https://itunes.apple.com/lookup?id=<ids>&country=<cc>&entity=software` (up to 50 ids per call) and
  `https://itunes.apple.com/search?term=…&country=<cc>&entity=software&limit=6`. Fields: version, releaseNotes,
  averageUserRating, userRatingCount, averageUserRatingForCurrentVersion, price/formattedPrice, fileSizeBytes,
  currentVersionReleaseDate, trackViewUrl, primaryGenreName. Figures are per storefront: Settings → «Конкуренты» →
  «Страна App Store» (default `us`).
- Google Play: no official API for other developers' apps. Petya asks its own web search engine
  (`s.webSearchEngine`, «Поиск в интернете») and keeps version, rating and update date only when the answer cites a
  page on play.google.com; the row is marked «Google Play · поиск» with the source link. At most 3 Play games per
  request, once a day each; progress goes to the notification center (`competitors-refresh`). Without the web module
  the Play row keeps its last known data and the card says why.
- Adding by name searches the App Store; only an exact name is added at once, anything else shows candidates with
  «Следить». Google Play cannot be searched by name: the app asks for a link or package.
- Our games for «Сравнить с нами»: the App Store ids in «Отзывы в сторах» → «Приложения App Store»
  (`storeReviewsAscApps`), looked up in the same storefront. Without them the card says where to add them.

## Snapshots and changes

Lists and snapshots live in `<company data>/extensions/competitors/cache.json` (`src/extension-cache.cjs`):
`list:<projectId>` and `snap:<store>:<id>` → one snapshot per day when facts are read (release notes stored only when
they change; 180 days kept). Changes compare today's snapshot with the latest earlier one; rating trends use the
snapshot closest to 7 (or 30) days ago. Snapshots are taken when the user asks or adds a game — there is no
background polling, so the first days show «история с …».

## Highlights: quotes, not inventions

With a local model, it picks up to 4 highlights per updated game (kind: механика, контент, событие, баланс,
монетизация, исправления, другое); each `quote` must be a verbatim fragment of the release notes (case and spaces
aside) or it is dropped. Without a model (or when nothing survives) the first bullet lines of the notes are shown
as written. The chat text is built by code from those quotes.

## Verification

Live: none in this environment (no network in tests). The iTunes API is public and documented by Apple; field names
follow its JSON. With stubs: `node tests/competitors.cjs` (routing and near-misses, add/remove per project, fixed
snapshots over two days, change detection, verbatim highlights incl. an invented one dropped, model-free highlights,
rating trend, compare with our app, Google Play via the search engine or skipped, errors, offer) and the Electron
card test `tests/competitors-ui.cjs` (screenshots `petya-competitors*.png` in the temp folder; the trash and
«Отменить» go through the real main process). To verify live: the iTunes rate limit with many competitors, and how
reliably the web search answer states Google Play version/rating/date.
