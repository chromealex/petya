# «Найм» (`hiring`)

A hiring pipeline the user keeps — candidates, stages, interview notes — with interview prep, verbatim feedback
summaries and interview times from the calendar. Category `team`, code `src/extensions/hiring/`.

## What it does

- «добавь кандидата Анна Иванова на бэкенд, anna@mail.example» → a card with name, role, email (editable); saved only by
  «Добавить в воронку». Stages: Отклик, Скрининг, Техническое интервью, Финальное интервью, Оффер, Вышел, Отказ — moved
  from the pipeline card's stage menu (with «Отменить»); a candidate is deleted with the red trash after a question
  (with «Отменить»).
- «покажи воронку найма», «кандидаты на бэкенд» → a bar per stage and the candidates.
- Roles and skills are what the user lists in settings (`hiringRoles`: «Бэкенд: Go, PostgreSQL, проектирование API»).
- «подготовь интервью с Анной» → questions per skill of the role (the local model drafts; code keeps only questions
  whose `skill` is one of the role's skills and that say nothing about protected characteristics; skills left without
  one get two plain templates), the doubts interviewers wrote in earlier rounds quoted as written, and the earlier
  notes folded.
- «запиши заметки интервью с Анной: …», «фидбэк Олега по Анне: …» → a card with the round (the candidate's stage) and
  the interviewer; saved only by «Сохранить».
- «сводка по кандидату Анна» → per criterion of the role, **verbatim quotes** of the interviewers' notes with who wrote
  them and in which round, «нет данных в заметках» where there are none, a criteria × notes grid. The model only maps
  `{criterion, note, quote}`; code (`evidence.cjs`) keeps a quote only when it is a verbatim part of that note
  (whitespace, quotes, dashes and ё normalised, ≥ 8 characters). Without a model, sentences naming a criterion's words
  are quoted. **No score, verdict, comparison or ranking**; «кто лучше из кандидатов», «ранжируй кандидатов» get a
  plain refusal.
- Protected characteristics (age, sex, family, pregnancy, health, nationality, religion, appearance, orientation,
  politics): sentences that mention them are never sent to the model, quoted, summarised or used for questions; the
  notes card warns when they are dictated, earlier notes show «[личные характеристики скрыты]», and the summary says how
  many were left out.
- «когда назначить интервью с Анной (и Олегом)» → free slots for the next five working days from «Календарь»
  (read only: its account choice, working hours and slot ranking — `src/extensions/calendar/{accounts,client,slots}.cjs`;
  Google `POST /calendar/v3/freeBusy`, Graph `getSchedule`), including named interviewers with an email in «Команда».
  The invitation text is a draft that passes the outgoing review (`k.outgoingReview`, channel `calendar`/`direct`).
  «Отправить приглашение» (IPC `invite`) puts «Поставь встречу «Интервью · Бэкенд · Анна Иванова» с anna@… 12 ноября в
  15:00 на 60 минут» into the chat: the event and its invitation are created only by the calendar's own «Поставить
  встречу». The reviewed text is copied to paste into the mail or the event description (Petya's mail connection is
  read only). The app `claims()` interview times and «воронка найма», so «Календарь» and «Воронки» do not take them.
- «фидбэк по Маше» is hiring only when Маша is a candidate in the pipeline.

## Privacy

`<company data>/hiring/hiring.json` (folder 0700, file 0600), encrypted with Electron `safeStorage` when available.
Opt-in (only card buttons write), local, wipeable («Удалить всех кандидатов и заметки» in settings). Reply texts carry
counts, not notes; notes reach only the local model of a prep or summary turn the user asked for. No dashboard widget
(personal data).

## Phrases and near-misses

Not ours: «найм юнитов», «нанять героев в таверне», «найми рабочих в игре» (games), «кандидат наук», «отзыв о кандидате»
in the stores sense, «запиши итоги с Машей: …» (a 1:1 or a meeting), «подготовь 1:1 с Олегом».

## Tests

`node tests/hiring.cjs` — routing and near-misses, claims, ranking refused, buttons-only writes, protected
characteristics, prep and summary checks with a stubbed model and without one, the calendar slots over a stubbed Google
free/busy and the request the calendar's intent and date parser accept, stages, undo, wipe, encryption.
UI: `tests/hiring-ui.cjs` (screenshots `petya-hiring*.png`).

Needs a live check: the calendar hand-off end to end (the calendar's confirm card with the candidate's address as an
attendee); Graph `getSchedule` for interviewers; the model's quote mapping quality on real notes.
