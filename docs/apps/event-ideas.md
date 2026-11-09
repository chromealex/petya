# Event ideas («Идеи для ивентов»)

Category: gamedev. Directory: `src/extensions/event-ideas/`. No settings card (`settings: false`). Uses
`task-tracker`; reads «Конкуренты»' stored release notes, a metrics source («Метрики игры») and the project's configs
(through «Симуляция баланса»' `economy.cjs`, i.e. «Конфиги и баланс»' readers).

## What it does

«какой ивент провести в декабре», «идеи ивентов на Хэллоуин для Бразилии», «придумай ивент к Новому году», «предложи
ивенты на ближайший месяц для России». The card lists up to six ideas on a timeline; each has a mechanic, dates,
regions, **its evidence** and **its cost in the game currency**:

- **Holidays by region, computed in code** (`holidays.cjs`): fixed dates; Easter (Western and Orthodox) and US
  Thanksgiving / Black Friday from «Объясни график»; Carnival (Easter − 47); US Mother's Day; the Chinese lunisolar
  calendar from astronomy (new moons — Meeus ch. 49; the Sun's longitude — ch. 25): month 1 is the lunation holding
  the principal term 330° (Lunar New Year; Seollal in Korea's time), month 8 holds 180° (Mid-Autumn; Chuseok);
  Ramadan, Eid al-Fitr and Eid al-Adha from the tabular Islamic calendar (observed dates follow the crescent — shown
  «± 1 день»); Diwali from the new moon of Kartika in India's time (also «± 1 день»). Each holiday has regions, a
  theme and the window an event usually runs (Halloween: a week before to two days after). Regions are read from the
  request (России, США, Бразилии, Латинской Америки, Азии, Европы, Китая, Кореи, Японии, Индии, Турции, арабских стран…);
  worldwide holidays are always included. The period: «на декабрь», «на месяц», «на 2 месяца», «на зиму», «до конца
  года»; 60 days by default; ideas start at least a week ahead.
- **Competitors' recent events**: release-note lines of the last 60 days that «Конкуренты» stored for the project
  (`competitors/history.cjs`, no network) and that name an event (event, festival, limited-time, season, holidays,
  tournament…), quoted as written with the game and the date. A line that echoes a holiday becomes evidence for it; a
  mechanic no holiday covers becomes its own idea («Турнир — как у Hero Wars»).
- **Our past events' metrics**: events planned here (after their dates) or recorded («прошлый ивент «Хэллоуин 2025»
  шёл с 24 октября по 2 ноября 2025» → a card with DAU and revenue per day against the 14 days before, from a
  connected metrics source; «Запомнить ивент» keeps it). They are evidence for ideas of the same holiday or mechanic;
  the best one by DAU is suggested again («Повторить «…»»).
- **Cost from configs** (`ideas.cjs`): per participating player, a formula per mechanic over config values — the
  login calendar = days × the daily bonus + the median item price; the collection event = 5 + 10 + 15 win rewards;
  double rewards = battle income × days; the sale = 30% of the three most expensive purchases; the tournament = 10% of
  the most expensive item + 5 win rewards; the mini pass = 30 win rewards; pair tasks = 20 win rewards. Each term
  shows its config `file:line`. The constraint compares the total with an average player's income per day (battles
  per day and the win rate from the configs' hints, else 10 and 50%): under 2 days «мягко», 2–5 «заметная
  инфляция», 5+ «сильная инфляция». Without a project folder the cost is not computed and the card says so.

The local model, when there is one, may add a one-line pitch per idea; a line with digits is dropped (numbers are
code's).

**«запланируй ивент N» / «запланируй ивент на Чёрную пятницу»** shows a plan card (an idea from the last ideas card by
number, quoted name or holiday; otherwise built for the named holiday; otherwise a question with the last ideas).
Nothing is written by the chat turn. «Создать задачу» is `k.links('task-tracker', {title, description})`: Jira or
Asana put «Создай задачу в …» into the chat and create it only after their own preview and confirmation; after that
the event is kept in the project's plan (`<company folder>/event-ideas.json`, mode 600, ipc `planned`, once per
card). «Сохранить в план» keeps it without a task. Without a tracker the card says to add «Jira» or «Asana».

Dashboards: the ideas request only reads (`dashboard.accepts`); planning and recording do not.

## Phrases and near-misses

Triggers need an event word (ивент, live-ops, событие в игре) and an ask for ideas, planning, or a past event with two
dates. Not this app (null / no offer): «поставь ивент в календаре на завтра», «какие ивенты в календаре», «создай ивент
в календаре с Олегом» (the calendar), «UnityEvent не вызывается», «как подписаться на ивент в коде», «воронка:
ивенты …», «сколько ивентов в AppMetrica», «придумай название для ивента» («Нейминг»), «что нового у конкурентов»
(«Конкуренты»).

## Verified

Unit `node tests/event-ideas.cjs`: Lunar New Year 2023–2032 and Mid-Autumn 2023–2030 exactly (including 2025's leap
month), Islamic holidays within a day of the published 2024–2030 dates in «Объясни график», Diwali 2024–2030 within a
day, Easter, Thanksgiving, Carnival, Mother's Day; regions and windows; routing and near-misses; ideas with holiday,
competitor (through «Конкуренты»' own store) and past-event evidence; costs with `file:line` on the balance fixture;
the plan card, saved once on the button; a past event's metrics from a stubbed source and «Запомнить ивент»; the
pitch without numbers; the offer. UI `tests/event-ideas-ui.cjs` (screenshots `petya-event-ideas.png`,
`petya-event-ideas-plan.png`).

Needs live checking: competitors' real release notes (wording of events in other languages), the AppMetrica daily
series for a past event a year ago, the Jira / Asana flows receiving the event description, and the observed dates of
Islamic holidays and Diwali in a given country.
