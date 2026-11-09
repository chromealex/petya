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
  to the first source that accepts it:
  - every phrase is implicitly «покажи …»: a bare noun («краши», «ANR», «отзывы», «сборки») that no source takes as
    written is tried as «покажи краши», and the widget keeps the accepted form as its command;
  - a source hint — «основные метрики (из wombyte)», «DAU из графаны», «дашборд лиг (из wombyte)» — is matched
    against the names of the apps and of their own sources (an app's `dashboard.names` / `dashboard.sources`;
    Grafana answers to the host labels of its address, «dashboards.wombyte.net» → «wombyte»). A hint naming one of
    an app's sources selects it (`source.selected`: «Метрики игры» read only from Grafana); a hint naming the app
    passes the phrase to it as «… из Grafana». A name in parentheses is always a hint; a trailing «из X» / «в X» only
    when X is a known name, so «отзывы в сторах» stays as it is.
  - A phrase nothing connected takes is explained concretely: the app that would take it (added or not, connected or
    not — `dashboard.accepts` of every app, then Jira, providers and the apps' offers) and what to do: «для «ANR»
    подключите «Google Play Console» (Подключения → «Google Play Console»)», «для «краши» добавьте «Крэши»». When
    nothing could be built, the shared offer card brings the apps to connect and repeats the request.
  - In the chat, a catalog app that would take a phrase and needs nothing connected is added on the spot («Добавил
    приложение «Отзывы в сторах»»). For a phrase no app recognises («погода на марсе») Petya asks for the page where
    it is visible: the page opens in the chat browser, the person signs in there, and a *web* widget reads the page
    in that session (`src/dashboard-web.cjs`, figures picked by the local model). A sign-in page is reported, never
    filled in.
- **On the dashboard**: «Добавить виджет» — a phrase, or one of the ready widgets of connected apps.

- **Example**: «Пример аналитики» (on the start screen of a project without dashboards, in «Добавить виджет» and on
  an empty dashboard) makes «Пример · аналитика игры» with made-up DAU, revenue, ARPDAU, retention, crash-free,
  platforms, countries and a tutorial funnel (`src/dashboard-example.cjs`), marked «Демо-данные».

## Layout
A 12-column grid with 32-px rows; each widget keeps `pos: {x, y, w, h}` and the person arranges it: drag a widget
by its header, resize it by the bottom-right corner, or pick «Ширина» (¼, ⅓, ½, ⅔, full) in its menu. The others
make room and everything rises to close gaps (vertical compaction). A new widget takes the first free spot with
the width of its size (`auto` — half) and its height is fitted to its data once (`pos.fit` until then). The
arrangement is saved per dashboard (`layout` IPC) and travels with a shared dashboard's file. Below ~760 px of
width the widgets stack in reading order; the small window always stacks. Content follows the widget's own width
(container queries): Jira cards go into two or three columns in a wide widget, a donut stacks in a narrow one.

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
dashboard: {
  accepts: command => /* read-only requests only */,
  size: 'm',                                   // optional: 's' | 'm' | 'l' | 'w' | 'auto'
  widgets: [{ title, command }],               // or (services) => [...] for widgets that depend on the connection
  ready: settings => bool,                     // optional: connected; otherwise its phrases are advice, not widgets
  connect: (settings, phrase) => ({ names, where, offers }),  // optional: what to connect for this phrase
  names: settings => [string],                 // optional: other names a source hint may use for the app
  sources: settings => [{ id, name, names, ready, extension }], // optional: the app's own sources a hint selects
  load: async (services, command, { selected, topic }) => reply, // optional: instead of `turn`
}
```
`accepts` must refuse anything that changes data («перезапусти сборку», «создай встречу»): the dashboard repeats
the request on its own. `widgets` are offered in «Добавить виджет». `load` is for apps whose chat answer comes from
elsewhere or that read with a chosen source: Google Play has no chat `turn` (ANR is Petya's own `anr` reader) and
its `load` runs that reader and returns the same `playVitals` card data (`result.cjs`), so the widget is the chat's
ANR card; «Метрики игры» `load` reads only the `selected` source. Widgets render extension data with the chat's own
card renderers, so a widget looks like the card in the chat.

| App | Phrases | Ready widgets |
|---|---|---|
| Метрики игры | «основные метрики», «метрики проекта», DAU, выручка, ретеншн, ARPDAU…; a hint selects the source | «Основные метрики», «DAU за неделю», «Выручка за месяц» |
| Grafana | «дашборд X из графаны», a dashboard named with «дашборд»/Grafana, a pasted dashboard or panel link, the list | the dashboards Grafana listed in the last five minutes |
| Google Play | «ANR», «ANR за неделю», «зависания» | «ANR за неделю» |

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
