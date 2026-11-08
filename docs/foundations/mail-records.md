# Mail records (foundation)

Structured records from the mail Petya can already read: receipts and subscriptions, bookings and renewals, each with
a link to its message and the evidence it was read from. Core feature `src/features/mail-records.cjs` (one line in
`src/features.cjs`), implementation in `src/mail-records/`. The first consumer is «Подписки и продления»
(`docs/apps/subscriptions.md`).

## Privacy
- **Opt-in**: `mailRecords` is `'false'` by default; switched on only by the user (the switch in «Подписки и
  продления» settings, or the consent question an app asks through the shared question panel).
- **Read only**: candidate messages are fetched (`users.messages.get` / Graph `GET /me/messages`); nothing is marked,
  moved, sent or forwarded. Only messages that look like receipts, subscriptions, bookings or renewals are read.
- **Local**: `<company data>/mail-records/records.json` (folder 0700, file 0600), encrypted with Electron
  `safeStorage` (OS keychain) when available (`status().encrypted`). Kept: type, merchant, amount, currency, dates,
  booking / renewal fields, the message id, sender, subject, date and web link, short evidence lines. Message bodies
  are not stored.
- **Wipe**: `wipe()` deletes the folder; `forget(id)` one record.

## Reading (`src/mail-records/fetch.cjs`)
- Gmail REST v1 for every connected Google account (`s.mailAccounts.google`): `users.messages.list` with
  `q = newer_than:<days>d|after:<last scan> (category:purchases OR subject:(receipt OR invoice OR … OR чек OR подписка …))`,
  pages of 100, at most 300 per scan, then `users.messages.get?format=full` (text/plain and text/html parts). Link:
  `https://mail.google.com/mail/u/?authuser=<email>#all/<id>`.
- Microsoft Graph v1.0 for every Outlook account: `/me/messages?$filter=receivedDateTime ge …&$orderby=receivedDateTime
  desc&$top=50&$select=id,subject,from,receivedDateTime,body,webLink`, subjects matched locally, `@odata.nextLink`
  followed only on graph.microsoft.com. Link: `webLink`.
- The first scan reads `mailRecordsDays` (default 365, 30–730); later scans read from the last scan (2-day overlap);
  read message ids are remembered. While enabled, a quiet scan runs every 12 hours; apps scan on demand. A scan
  publishes the notification `mail-records-scan` (progress every 10 messages, result or error); one failing account
  does not hide the others.

## Extraction (per message, `extract(message)`)
1. **schema.org JSON-LD** (Gmail markup, `src/mail-records/jsonld.cjs`): `Order`, `Invoice` (a `billingDuration` /
   `billingPeriod` makes it a subscription; an Apple/Google Play seller gives way to the item), `FlightReservation`,
   `LodgingReservation`, `TrainReservation`, `BusReservation`, `RentalCarReservation`, `EventReservation`; cancelled
   reservations are dropped. When JSON-LD gives records, the steps below are skipped.
2. **App parsers** (`mail-record` registry, below).
3. **Built-in parsers** (`src/mail-records/parsers.cjs`): receipts / subscriptions (amount on a «total» line, period
   words, next-charge phrases in Russian and English, app-store item lines such as «Apple One Individual (Monthly)»),
   renewals (domain, certificate, license + expiry line), bookings (a labelled confirmation code + kind by words +
   dates). Money (`money.cjs`): ₽ руб р. $ US$ € £ ₸ ₴ грн ₹ ₺ ₾ … and ISO codes, «1 299,00», «1,299.50», «1.299,00».
   Dates (`dates.cjs`): «December 9, 2026», «9 дек. 2026», «09.12.2026», «2026-12-09», «12/09/2026» (US), and without a
   year the next such day after the message date.
4. **The local model** (`model.cjs`, only when `mailRecordsModel` is on, a model is chosen, the subject looks like a
   receipt/booking/renewal and nothing above matched): a strict JSON schema where every field has `evidence`. Code keeps
   a field only if its quote occurs verbatim in the message and the value reads back from the quote (amount and
   currency via `money.cjs`, dates via `dates.cjs`, the merchant/code/name inside the quote); a record without its key
   fields checked is dropped.

## Record shape
```
{id, type:'subscription'|'receipt'|'booking'|'renewal', merchant, date:'YYYY-MM-DD', source:'jsonld'|'parser:<id>'|'model',
 amount?, currency?,                                  // ISO 4217
 period?:'month'|'year'|'week'|'quarter'|null, nextCharge?:'YYYY-MM-DD', item?, platform?, order?,   // charges
 booking?:{kind:'flight'|'hotel'|'train'|'bus'|'car'|'event', code, number, from, to, place, start, startTime, end, endTime},
 renewal?:{kind:'domain'|'certificate'|'license', name, expires},
 message:{id, account, provider:'google'|'microsoft', from, subject, at, url}, evidence:{field: 'line of the mail'}, also?:[message ids]}
```
**Dedupe** (`store.cjs`): charges by merchant + amount + currency + date, bookings by confirmation code, renewals by
kind + name + expiry; a duplicate from a better source (JSON-LD > parser > model) replaces the stored one, other
duplicates are remembered in `also`.

## API (`s.mailRecords`)
`list({types, from, to, merchant})`, `status()` → `{enabled, running, connected, records, last, scanned, encrypted,
model, days}`, `enable(on)`, `scan({quiet})` → `{read, added, errors}`, `forget(id)`, `wipe()`, `extract(message)`,
`parsers()`. Renderer IPC: `window.petya.feature('mailRecords', 'status' | 'enable' | 'scan' | 'list' | 'forget' | 'wipe')`.

## Parsers (`mail-record`)
An app that knows a sender declares `"provides": {"mail-record": "<file>.cjs"}` (a REGISTRIES kind in
`src/features/app-links.cjs`); the file exports `{id, name?, match({from, subject}) → bool, parse(message) → [record]}`
with records in the shape above (without `id`/`message`, which the foundation adds). Records are normalized and
validated like the others; a throwing parser skips only that message. Only parsers of added apps run.

## Tests
`node tests/mail-records.cjs` — fixture mail: currency and date parsing, HTML text, JSON-LD (order, flight, hotel,
train, cancelled, broken), Russian and English plain-text receipts and subscriptions, Apple item lines, domain /
certificate / license renewals, a train ticket, the model with verbatim checks (made-up merchant, amount, date dropped;
the gate and a failing model), app parsers, dedupe, opt-in, incremental scans over fake accounts, notifications,
encryption at rest, file mode, forget, wipe, the Gmail query and the Outlook reader on stubbed REST answers.
Not verified live: real Gmail/Graph responses, Gmail's JSON-LD in delivered mail, `safeStorage` on macOS/Windows.
