# Focus («Фокус»)

Category: personal. Local only, no settings card (`settings: false`, setting `extension_focus`). The model is not used.

## What it does
- Focus sessions and pomodoro from the chat: «фокус на 50 минут над картой уровня», «помодоро 4 раза»
  (25 min + 5 min breaks, a 15 min break after every 4th round), «перерыв» / «перерыв 5», and during a session
  «пауза», «продолжи», «стоп», «ещё 10 минут», «сколько осталось».
- The label is the rest of the request («над картой уровня»); a Jira key in it (`BW-123`) is kept separately and
  linked to `jiraUrl/browse/KEY` in the card when Jira is connected.
- Report: «сколько я сегодня сфокусировался» / «… на этой неделе» — sessions (over a minute), total focus time,
  interruptions (a focus session stopped more than a minute early, or ended by «Перерыв 5»), tasks with time.
- «помоги сосредоточиться» / «не могу сосредоточиться» offers a session through the shared question panel
  (25 / 50 minutes / pomodoro / not now).

## Timer
`store.cjs` keeps one active session, the pomodoro series and finished sessions (60 days) in
`<company data>/focus.json`. The main process ticks every second (`feature.cjs` engine), so the timer runs with the
window closed; after a restart a session whose time ran out is closed at its planned end and a series is not
replayed. Pause time is excluded from focus time.

## Where it shows
- Top bar: a small pill with a ring and `mm:ss` next to the notification bell (`focus-chrome.js`), only while a
  session runs; click opens the notification center.
- Notification center: one stable id `focus-session` on the shared `extension-install-progress` channel (busy with a
  percent while running, refreshed every 30 s with the same version so unread state is not reset), actions
  «Пауза»/«Продолжить», «Стоп», «Ещё 10 минут»; after a session «Перерыв 5». `item` ipc restores it after a reload.
- Card (`focusCard`): ring timer, today's stats, pomodoro dots, the next meeting, today's timeline (meetings lane,
  focus / interrupted / break / in-progress blocks, now marker), week bars Mon–Sun, tasks; controls «Пауза», «Стоп»,
  «Ещё 10 минут», «Перерыв 5». Only the newest focus card in the chat is live and has controls.

## Notifications held during focus
`hold.cjs` wraps Electron `Notification.prototype.show` once. While a *focus* session (not a break) is active,
Petya's own system notifications that are not urgent wait; when the session ends they are shown as one summary
(`focus-held` in the center plus one system notification). Urgent ones pass: a decision/answer/clarification
needed, errors and failures, questions, meeting reminders, `urgency: 'critical'`, and focus's own notifications.
The existing «smart notifications» switch (`smartNotifications`) still decides what is sent at all; focus only delays.
In-app notification-center cards are not held (they do not interrupt).

## Calendar
When «Календарь» is added and has calendar access (its `accounts.cjs` + `client.cjs`, read-only), today's busy
meetings are read at start and for reports. A single session that would run into the next meeting asks for a length
that fits with a 5-minute margin («35 минут» / «50 минут»), or, if less than 10 minutes fit, «Начать на N минут» /
«Не сейчас». A warning comes 5 minutes before a meeting during focus. Without the calendar, or when it does not
answer within 8 s, focus starts as usual.

## OS focus modes
Not switched. macOS Focus has no public API for third-party apps to turn a Focus on (only Shortcuts the user makes,
or Focus filters inside the app); Windows Focus assist / «Не беспокоить» has no documented public API. So Petya does
not touch them.

## Phrases
Own: «фокус на 50 минут над картой уровня», «помодоро 4 раза», «перерыв», «перерыв 5», «сколько я сегодня
сфокусировался», «сколько я фокусировался на этой неделе», «запусти фокус», «фокус на час по BW-123»,
«помоги сосредоточиться». Near-misses (null / no offer): «фокус камеры в Unity», «фокус на задаче» (no time),
«давай сфокусируемся на багах» (team planning, also with a time), «фокус-группа в пятницу», «как сделать фокус на
поле ввода», «перерыв в работе сервера», bare «стоп» / «пауза» / «ещё 10 минут» when no session runs.

## Tests
`node tests/focus.cjs` (store with an injected clock, restart from file, routing, hold with a fake Notification,
calendar with a stubbed Google Calendar fetch, center items) and `tests/focus-ui.cjs` (real window: cards, top-bar
pill, center actions, a real Electron `Notification` held during a session; screenshots `petya-focus*.png`).
Verified with stubs only: no real calendar account was used.
