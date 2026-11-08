# Dashboards

A dashboard is a grid of widgets made from chat cards: Jira issues, crashes, store reviews, builds, PRs,
meetings, charts. A widget keeps its **source**, not only its data, so it refreshes by itself.

## Making one
- **From a chat**: «Сделать дашбордом» in the chat header. Every answer with a card becomes a widget; plain
  answers stay out. The chat keeps its dashboard («Дашборд» in the header), and new cards of the chat join it
  when the dashboard is opened.
- **From one card**: «•••» → «В дашборд…» on an answer, then a dashboard of the project or «Новый дашборд».
  The card shows at once; its source refreshes it afterwards.
- **By description**: «Собери дашборд «Релиз»: баги спринта, крэши за неделю, отзывы в сторах». Each phrase goes
  to the first source that accepts it; phrases without a source are named in the reply.
- **On the dashboard**: «Добавить виджет» — a phrase, or one of the ready widgets of connected apps.

- **Example**: «Пример аналитики» (on the start screen of a project without dashboards, in «Добавить виджет» and on
  an empty dashboard) makes «Пример · аналитика игры» with made-up DAU, revenue, ARPDAU, retention, crash-free,
  platforms, countries and a tutorial funnel (`src/dashboard-example.cjs`), marked «Демо-данные».

## Layout
Six columns. New widgets are «Авто»: they share a row two at a time (three when that avoids a lone one). A fixed
size spans 2, 3, 4 or 6 (`s`, `m`, `l`, `w`). Rows are always full — what is left goes to the row's «Авто»
widgets, or grows the last one — and widgets of a row share its height. Content follows the widget's own width
(container queries): Jira cards go into two or three columns in a wide widget, a donut stacks in a narrow one. Cards drawn inside a
widget lose their own frame. Below 1100 px: two columns.

## Charts for analytics
The charts extension draws `donut`, `bars`, `line` (`labels` + `series`, hover values, legend toggles) and `kpi`
(tiles with value, change — green when it moves the good way, `better: 'up'|'down'`, `deltaUnit: '%'|'pp'` — and
a trend sparkline). An analytics extension answers with `extensionData.charts` in these shapes.

## Sources (`src/dashboards.cjs`)
| Kind | What | Refresh |
|---|---|---|
| `extension` | A read-only request an extension accepts (`dashboard.accepts(command)`) | The extension's `turn` runs in a sandbox: an empty chat of the dashboard's project; nothing is written to the dialogue |
| `provider` | A chat-reply provider's read (e.g. «мои задачи Jira по статусам») | `scope` + `answer`, charts and text |
| `jira` | Jira issues by JQL; «баги спринта» → JQL limited to the connection's projects (`src/extensions/jira/dashboard.cjs`) | Jira search, drawn by the Jira cards |
| `snapshot` | A card as it was | Never; marked «снимок» |

An extension joins dashboards by exporting from its `feature.cjs`:
```js
dashboard: { accepts: command => /* read-only requests only */, size: 'm', widgets: [{ title, command }] }
```
`accepts` must refuse anything that changes data («перезапусти сборку», «создай встречу»): the dashboard repeats
the request on its own. `widgets` are offered in «Добавить виджет».

Each widget refreshes on its interval (manual, 5 min … once a day, default 15 min) while its dashboard is open,
is the project's start dashboard, or is in a small window; at most two at a time. Data is cached in
`dashboards-cache.json` (encrypted). A failed refresh keeps the last data and shows the error above it.

## Where to see them
- **Sidebar**: the project's dashboards above its chats; the dashboard opens in place of the chat.
- **Start screen**: «Показывать при открытии проекта» — the dashboard under «Чем помочь?» in a new chat.
- **Small window**: «Открыть в отдельном окне» — one column, on top of other windows («Поверх окон»), «В Пете»
  opens it in the main window. Its preload (`src/dashboard-window-preload.cjs`) reaches only this dashboard.
- **Tray menu**: «Дашборды» → a dashboard opens in Petya.

## Personal and shared
Personal dashboards are kept with the company's chats. «Поделиться через папку «…»» writes
`<project folder>/.petya/dashboards/<name>.json` (see docs/project-share.md): definitions only — titles, sizes,
intervals and sources. Commit it, and colleagues see the dashboard after `git pull`; each refreshes it with
their own connections. Snapshots carry someone's data, so they are not shared: they stay in the personal
dashboard. Edits of a shared dashboard go to its file; «Сделать личную копию» makes a personal one.
