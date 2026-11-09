# Дни рождения (`src/extensions/birthdays`)

Colleagues' birthdays: the «День рождения» field on the cards of «Команда», a note every morning about whose birthday
is today and tomorrow, and answers about upcoming birthdays. Local only: nothing is sent anywhere.

## What it does

- **The field** (`team-field.js`, `extension.json` `ui.personFields`): a date with a calendar on every card of
  «Команда», the date in words and the coming age under it, «Очистить». Shown only while the app is added
  (person-field host `src/ui/person-fields.js`, docs/extensions.md §8a).
- **Morning note** (`feature.cjs` `run`): from 9:00, once a day — «🎂 Сегодня день рождения: …», «Завтра: …» in the
  «Дни рождения» chat of the general project and a system notification. Only while the app is added.
- **Answers** (`turn`): «у кого день рождения на этой неделе / сегодня / завтра / в этом месяце», «ближайшие дни
  рождения в команде», «когда день рождения у Маши» (any case of a name or alias). Near-misses that go elsewhere:
  «напомни про день рождения …» («Напоминания»), greetings and gifts (the dialogue), the calendar, events and holidays,
  the company's birthday.
- **Offer** (`offer.cjs`): the same questions offer the app when it is not added.

## Where the date lives

The date stays in the person record of «Команда» (`birthday`, ISO `YYYY-MM-DD` or `--MM-DD` without a year), where it
always was. That is the cleaner option: the date is a person attribute with several readers and writers — Slack
profiles fill it (`src/team-enrich.cjs`), «Люди» shows anniversaries from it (`src/features/people.cjs`), this app
reads it — so moving it into the app's store would make the Slack import and «Люди» depend on this app and would need
a migration of every record for nothing. What moved is the interface: the core team page has no birthday field,
picker or styles any more; it keeps the stored attributes it does not show as they are (hidden inputs marked
`data-kept`), so saving the team without the app loses no date.

## Migration

Before 0.16 the app had no catalog switch and always ran. `setup` adds it once per company (`extension_birthdays`)
when someone in «Команда» already has a birthday, so those teams see no change; a team without birthdays gets the field
when it adds «Дни рождения» from the catalog. The switch happens once: removing the app later stays removed.

## Tests

`tests/birthdays.cjs` (answers, near-misses, not added, the one-time switch, field declared by the app, value kept in
the record, offer), `tests/team-people.cjs` (the morning note), offer rows in `tests/extension-offers-matrix.cjs`, the
field in `tests/apps-own-ui.cjs` (absent without the app, the date survives a save, shown and saved with the app).
