# One-on-ones («Встречи 1:1»)

Category: team. `src/extensions/one-on-one/`, setting `extension_one-on-one`, settings card (`settings.js`), no
service of its own. Built on the people records foundation (`docs/foundations/people.md`); reads Jira and GitHub only
when they are connected; the local model is optional.

## What it does
- «Подготовь 1:1 с Олегом», «что обсудить на 1:1 с Машей», «повестка на one-on-one с Ваней», «1:1 с Олегом» — the prep
  card: a half-year line with a dot per past 1:1, «Мои обещания» and the colleague's promises with due dates (overdue in
  red, a check closes one with «Отменить»), the agenda draft («Скопировать повестку»), the person's work of the last two
  weeks, upcoming absences, the last notes folded, «Записать итоги».
- «Запиши итоги 1:1 с Олегом: …» — code finds the follow-ups (`followups.cjs`): «я обещал / мне нужно / с меня / я
  сделаю …» are yours, «Олег сделает / он подготовит / с него / Олег обещал …» are his (another colleague's promise
  is not a follow-up between you two); «, я …» inside a sentence starts a new clause; due dates from «до/к пятнице»,
  «к 20 ноября», «до 3.12», «завтра», «до конца недели / месяца», «на следующей неделе», «через 2 недели». The card
  shows the notes and each follow-up with a checkbox, the owner (click to give it to the other side), editable text and
  date; only «Сохранить» writes (IPC `confirm` with the edited list, once). Without a name the app asks who it was with
  («Команда» as choices); without the notes («запиши итоги 1:1 с Машей») it asks for them.
- «Что я обещал Маше?», «мои обещания Маше», «что Олег обещал?», «договорённости с Олегом», «что я обещал на 1:1» — open
  follow-ups with due dates (bars per colleague for all of yours), closing with «Отменить».

## The agenda
By code: how things are since the last meeting (or expectations for a first one), your open promises (overdue
marked), the colleague's open promises, issues in progress, open PRs older than three days, an absence in the next 30
days, «в следующий раз обсудить … / вернуться к …» from the last note, feedback both ways. With a chosen local model,
up to two questions drawn from the last three notes are added (checked for length; no model → none).

## Work of the last two weeks
- Jira (Petya's Jira connection): `POST /rest/api/3/search/jql` with `assignee = "<accountId>" AND updated >= -14d` in the
  projects chosen in Jira settings; needs the Jira account on the person's «Команда» card (a notice otherwise).
- GitHub (the «Pull requests» app added and a token in «GitHub»): `GET /repos/{repo}/pulls?state=all&sort=updated`
  for up to three configured repositories (or the project's remote); a PR is the person's when the login is on their
  card (`accounts.github`) or reads as their name («oleg-smirnov»). Each failure is a notice; the other source stays.

## Privacy
Notes and follow-ups are stored by the foundation (local, encrypted when possible) only after «Сохранить». They never
go to other apps or to «Команда»; reply texts carry counts, not the notes; the local model sees the last notes only in a
prep turn the user asked for, in that chat. Settings: what is kept, counts, and deleting all 1:1 notes and follow-ups
(asks first; absences stay).

## Phrases and near-misses
Not this app: «1 на 1 в игре», «бой один на один», «сыграем 1 на 1», «счёт 1:1», «масштаб 1:1», «мои обещания» and «мои
обещания по задачам» (tasks), «что я обещал маме» (not a colleague), «итоги встречи с заказчиком: …» and «сводка
встречи» (meeting summaries), «подготовь встречу с заказчиком» (meeting prep). Rows in
`tests/extension-offers-matrix.cjs`.

## Verified
Stubs only: `node tests/one-on-one.cjs` (fake clock: routing and near-misses, follow-up extraction and dates, not added,
foundation not loaded, unknown/ambiguous people asked, the outcome card with edits saved once, cancel and stale drafts,
asking for missing notes, promises and closing, the prep card with stubbed Jira search and GitHub pulls, the agenda,
model questions, Jira failing while PRs stay, no requests without connections, no model call outside prep, notes kept
out of reply texts and the team context). UI: `tests/one-on-one-ui.cjs` (screenshots `petya-one-on-one.png`,
`petya-one-on-one-saved.png`). Live checks left: real Jira Cloud and GitHub responses for a person, GitHub logins
that do not read as names, the model's questions on real notes.
