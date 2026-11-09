# Absences («Отсутствия»)

Category: team. `src/extensions/absences/`, setting `extension_absences`, settings card (`settings.js`), no service
to connect. Built on the people records foundation (`docs/foundations/people.md`); no model.

## What it does
- «Кто в отпуске на этой неделе?», «кто на больничном», «кто отсутствует завтра», «отпуска команды», «график отпусков»,
  «кто в отпуске в декабре» — a strip of days (this week, next week, today/tomorrow, this/next month, a named month;
  two weeks from Monday without a period): a column per day with weekends shaded and today marked, a row per absent
  colleague and a bar per absence coloured by kind (отпуск, больничный, отгул, нет на месте), a legend, the details with
  their source («отмечено в чате», «календарь», an HR source) and «на месте: N». Typed absences have a red trash button
  with «Отменить».
- «Когда Маша вернётся?», «когда у Олега отпуск», «Маша в отпуске?» — whether the person is away now and until when
  (adjacent absences count as one stretch), the first working day back, or the next absence within four months.
- «Маша в отпуске с 10 по 20», «Ваня взял отгул в пятницу», «Олег на больничном до 20-го» — a confirmation card with the
  dashed bar on the strip; saved only after «Сохранить» (IPC `confirm`, once; a second press or an old card says
  «Уже сохранено»/«устарело»), «Отмена» drops it. «Отметить отсутствие» on any card puts «Отметь, что » into the
  composer.
- Two people with the same name are asked with the shared question panel; someone outside «Команда» is not this app's
  (a typed note) or gets a question (a «когда вернётся» request). An empty «Команда» → a question saying how to fill it.
- Dashboard: «Кто в отпуске на этой неделе», «Отсутствия на две недели» (read-only requests only).

## Routing and near-misses
`claims()` takes a typed dated absence first, so it reaches this app before sprint planning (which keeps its own
per-project notes when this app is not added). Not this app: «отпуск в Турции», «куда поехать в отпуск», «хочу в отпуск
на море», «сколько дней отпуска осталось», «как оформить отпуск», «отпускные», «я в отпуске …» (the user's own leave),
«кто в отпуске в спринте» / «ёмкость спринта» (sprint planning), the calendar's meetings. Offer rows are in
`tests/extension-offers-matrix.cjs`.

## Sources and privacy
Typed absences (stored by the foundation, encrypted when possible) plus every ready `people-source`: the calendar
app's out-of-office and vacation events while «Календарь» is added and `peopleCalendar` is on (the switch in this
app's settings). A failing source is named under the card; the rest still shows. The settings card shows counts and
sources and deletes every people record of the company (asks first). Nothing leaves the computer.

## Verified
Stubs only: `node tests/absences.cjs` (fake clock: routing and near-misses, not added, empty team, foundation not
loaded, the confirmation card with nothing saved before «Сохранить», saved once, cancel, stale and other-company
drafts, ambiguous names, the period list with a calendar source and a failing HR source, return dates across adjacent
absences, removal with restore). UI: `tests/absences-ui.cjs` (screenshots `petya-absences.png`,
`petya-absences-saved.png`). Live checks left: the calendar source against real Google/Outlook out-of-office events,
the confirmation buttons in a running Petya after a restart (draft state).
