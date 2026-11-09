# Store reviews (`store-reviews`)

«Отзывы в сторах» shows App Store and Google Play reviews of the user's games in the chat and lets the user reply
to a player. Category: `gamedev`. Code: `src/extensions/store-reviews/`.

## What it does

- Reads reviews from the **App Store Connect API** (`GET /v1/apps/{id}/customerReviews?sort=-createdDate&include=response`,
  optional `filter[territory]` when the request names a country) and the **Google Play Android Publisher API v3**
  (`GET /androidpublisher/v3/applications/{packageName}/reviews`).
- Code counts everything numeric: rating distribution (1–5★), average, its change against the previous period of the
  same length (or, for «после обновления», the latest version against the previous one), reviews per day by rating.
- The local model (via `app-kit.modelJSON`) only groups complaints into at most 5 themes. Each theme's count is the
  number of reviews the model assigned to it; quotes are kept only when they are verbatim substrings of a fetched
  review (whitespace normalized), at most 2 per theme. Invented quotes and empty themes are dropped.
- Card: average + change, distribution bars, stacked per-day timeline coloured by rating, complaint themes with
  quotes, recent reviews (stars, country/language, version, collapsed text, existing reply, «ответ отправлен» chip).
- Replies: «Черновик ответа» asks the model for a draft in the review's language and puts it into an editable textarea
  in the card (without a model the button is «Написать ответ» and opens an empty editor). «Отправить ответ» posts
  exactly the textarea text — `POST .../reviews/{reviewId}:reply` (Google Play) or `POST /v1/customerReviewResponses`
  (App Store). Nothing is posted from a chat turn; duplicate clicks are refused; the sent reply is saved in the chat
  card so the chip survives reopening. The result goes to a toast and the notification center.
- Without a model: numbers, timeline and reviews are shown; the themes block says a model is needed.

## Phrases

Trigger: «что пишут в отзывах», «отзывы в App Store за неделю», «жалобы игроков в Google Play»,
«плохие отзывы после обновления», «ответь на отзыв», «оценки в App Store за месяц». Period words: за сегодня / 3 дня /
неделю (default) / две недели / месяц / квартал. If one store is named, only that store is read.

Never trigger (tested): «код-ревью», «ревью PR», «перфоманс-ревью», «отзыв кандидата», «отзыв о кандидате»,
«фидбэк по встрече», «ANR в Google Play», «размер APK в Google Play», «отзыв доступа», «напиши отзыв о ресторане».

## Setup

- **App Store**: Settings → «Отзывы в сторах»: Issuer ID, Key ID and the `.p8` key of an App Store Connect team API
  key (role Customer Support or higher). The key is a feature secret (`storeReviewsAscKey`, encrypted, never sent
  back to the renderer). JWT: ES256, `aud: appstoreconnect-v1`, 20-minute lifetime, reused for 15 minutes.
  App ids are optional; without them all apps visible to the key (`GET /v1/apps`) are used.
- **Google Play**: reuses the existing credential `settings.googlePlayCredential` (Connections → Google Play) parsed by
  the shared adapter in `src/extensions/google-play/client.cjs`; this app signs its own token for the
  `https://www.googleapis.com/auth/androidpublisher` scope. Only a **service-account key** works: the browser sign-in
  grants only the Play Developer Reporting scope, and the app says so. In Play Console, give the service account
  «View app information» and «Reply to reviews». Package names are optional («Name = com.package» per line);
  without them the app list comes from the shared reporting adapter.
- Apps of both stores with the same name are treated as one game; several games → a question in the shared panel.

## Limits

- Google Play's reviews API returns **only reviews with text from the last 7 days** and uses the last-modified time;
  it has no country (only the device language). A longer period shows App Store data for the rest, and the change of
  the average is computed only from stores that cover the previous period (noted on the card).
- Google Play rejects replies over 350 characters; the editor counts and blocks longer text.
- App Store review lists have no version: the versions are taken from the review lists of the two latest released
  versions (`/v1/appStoreVersions/{id}/customerReviews`). App Store reads stop after 5 pages (1000 reviews).
- A new App Store response is `PENDING_PUBLISH` until Apple publishes it; the chip says «ответ на проверке».

## Verified

Only with stubs — no real credentials were available. `node tests/store-reviews.cjs` checks routing and near-misses,
the offer gate, connection questions, the JWTs (RS256 for Google with the androidpublisher scope, ES256 raw signature
for Apple), request URLs and bodies, counted numbers, verbatim quotes, the update focus, drafting and sending the exact
text, duplicate sends, partial and total failures, the game question and the model-free card.
`tests/store-reviews-ui.cjs` renders the card in the real Electron chat and saves screenshots
(`petya-store-reviews*.png` in the temp folder). Still to verify live: the real API responses (field names of
`appVersionState`, pagination links, reply results) and Play Console permissions for the service account.
