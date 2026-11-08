# Time tracking («Учёт времени»)

Category: personal. `src/extensions/time-tracking/`, setting `extension_time-tracking`, settings card (`settings.js`).
Built on the activity tracker (`docs/foundations/activity.md`); no model is used, nothing is sent anywhere except
worklogs the user confirms.

## What it does
- «На что ушёл день?», «куда ушло время на этой неделе», «вчера», «в пятницу», «за месяц», «за последние 3 дня» —
  the total split into **work / meetings / communication / other**, the day's timeline (activity colored by category,
  meetings from «Календарь» and focus sessions of «Фокус» above it) or, for longer periods, stacked columns per day,
  and the top apps with a category chip. The chip menu changes the app's category for good
  (`timeTrackingCategories`, «По умолчанию» returns it); browsers are categorized by the page title (Jira, Gmail,
  YouTube…).
- «Сколько я сидел в Unity на этой неделе», «…в слаке вчера», «в браузере», «сколько часов ушло на BW-123» — one app
  (Russian names: юнити, слак, телеграм, фигма…), the browsers, or a Jira task.
- «Время по задачам», «время по проектам» — from the classifiers this app provides: a Jira key in a window title,
  project names from editor and Unity window titles and repo paths.
- «Выгрузи время в CSV» — «Скачать CSV»: a save dialog, one row per span (start, end, minutes, app, title, project,
  task, category; UTF-8 with BOM for Excel). There is no shared spreadsheet-export kind yet; CSV is the export.
- «Запиши время в Jira» — a preview of time per task per day (rounded to 5 minutes, < 5 minutes not offered) with
  checkboxes; only after «Записать в Jira» are the ticked rows written: `POST /rest/api/3/issue/{key}/worklog?adjustEstimate=auto`
  with `timeSpentSeconds`, `started` (`2026-11-09T10:30:00.000+0300`) and an ADF comment (the window title), through
  Petya's Jira connection. A preview is written once (15 minutes), a row already written is marked «уже записано»,
  errors are shown per row, a changed Jira connection refuses the write. Without Jira the button is not shown.
- Voice controls: «поставь учёт времени на паузу (на 30 минут)», «возобнови / выключи учёт времени», «удали историю
  активности» (asks first).
- Journal: provides a `journal-source` (time by project or app for the day).

## Setup and privacy
The tracker is off until the user turns it on: the settings card (what is collected, interval, idle limit, retention
7–90 days, apps whose titles are never stored, pause, delete history with a red trash button) or the consent question
in the chat («Включить учёт / Не сейчас»). The card says «учёт выключен» with «Включить учёт» when it is off.

## Phrases and near-misses
Own: «на что ушёл день», «сколько я сидел в Unity на этой неделе», «время по задачам», «куда ушло время на этой
неделе», «запиши время в Jira». Not this app (null / not offered): «который час», «сколько времени», «сколько я сегодня
сфокусировался» (Фокус), «что я сегодня сделал» (journal), «сколько времени займёт сборка», «время встречи с Олегом»,
«учёт расходов», «время в Токио», «сколько я был в отпуске».

## Verified
Stubs and fake clock only: `node tests/time-tracking.cjs` (real activity foundation with a fake sampler: routing,
consent, cards, categories and mapping, classifiers, focus overlay, CSV, worklog preview → confirmed write with a
stubbed Jira, duplicates, connection change, journal source, pause/off/wipe, periods, offers). UI:
`tests/time-tracking-ui.cjs` (screenshots `petya-time-tracking.png`, `petya-time-tracking-written.png`). Live checks
left: the Jira worklog endpoint on a real site, the calendar overlay with a real account, the foreground readers on
Windows/macOS.
