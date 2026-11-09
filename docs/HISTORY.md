# Petya — feature history by version

Detailed notes for versions 0.2–0.10.0. Project overview: [README](../README.md).



Desktop MVP 0.5 of a voice assistant for macOS and Windows: tray, notifications, the «Петя» ("Petya") wake word, meeting and Slack context, clarification of ambiguity, and creating an issue in Jira Cloud.

OAuth registration package: [oauth/REGISTRATION.md](../oauth/REGISTRATION.md).

## 0.16.5 — choosing the Google Play app: search and a list

- The ANR widget's question is no longer an error box with a wall of chips: a calm prompt, a search field («bunker» finds Bunker Wars by name or package) and a scrolling list of names with the package beside each. All apps of the account are there (it showed only the first 40), and «Ничего не нашлось» says to check the account's access in Play Console.

## 0.16.4 — the ANR widget asks which Google Play app

- With several apps in Google Play the ANR widget shows them as buttons right on the card («Hearts: Classic Cards», «Rummy Gin»…) instead of asking to retype the request; the choice stays with the widget («ANR · Hearts: Classic Cards») and it reads that app at once.

## 0.16.3 — a spinner while a dashboard card refreshes

- Refreshing a dashboard card no longer swaps the time for «обновляю…» or replaces the content with a placeholder: the card keeps what it shows and a small spinner turns in its top-right corner (the «Обновить» icon spins on hover). The same in the separate dashboard window.

## 0.16.2 — a button for the link in an error

- An error or a status with a link shows a button for it instead of the raw address: «Включить API в Google Cloud» on the Google Play errors in dashboard widgets, in Settings → «Google Play Console» and in the anomalies card.
- «основные метрики проекта» with the Grafana connected but no panels mapped: «добавьте «Метрики игры» и сопоставьте панели Grafana с метриками (Настройки → «Grafana» → «Сопоставить панели с метриками»)», not «подключите «AppMetrica» или «Grafana»».

## 0.16.1 — dashboard widgets that work: «из wombyte» metrics and bare «краши»

- «основные метрики проекта (из wombyte)» is no longer searched as a Grafana dashboard name when the wombyte Grafana has no panels mapped to game metrics: the reply says to map them (Настройки → «Grafana» → «Сопоставить панели с метриками»), and once mapped the widget reads «Метрики игры» from that Grafana.
- The «Краши» widget answers a bare «краши» (it said «Расширение не ответило»): the dashboard reads the crash card directly.

## 0.16.0 — apps add their own pages and tabs; reminders belong to the «Напоминания» app

- An app can add an item to the left menu with a page of its own, and tabs on Petya's pages («Навыки», «Команда», «Материалы», «Настройки», «История», «Агенты») or on another app's page. Turning the app off or removing it takes them away at once; an open page goes back to the previous one.
- Tabs with the same name from several apps are one tab, with a small header per app inside.
- The install review of a third-party app lists the menu items and tabs it adds.
- Reminders live only in the «Напоминания» app now: its list is on «Навыки» → «Напоминания». Your old reminders and voice commands that set them moved there by themselves (the app was added if you had any), nothing was lost.
- «Напомни …» without the app offers to add it. Voice commands can now run any chat command («Выполнить команду в чате»).
- «Напоминания» understand seconds and times like «через 1 час 20 минут».

## 0.15.0 — light, dark and system themes

- Settings → «Оформление»: light, dark or as the system, a preset for each mode (Лес, Графит, Океан, Закат; Снег, Бумага, Мята), your own accent colour and the text size. It applies at once to the main window and the dashboard windows.
- Every screen uses the same theme colours (src/ui/theme.css), so cards of every app follow the chosen theme.

## 0.14.6 — «Развитие» at the bottom of the side panel

- «Развитие» moved to the bottom of the left rail, above the status dot.

## 0.14.5 — a sign-in page in Petya's look that closes itself

- After signing in through the browser (Gmail, Outlook, Google Play) the tab shows a page in Petya's look — a check mark, «Google Play подключён.», «Можно вернуться в Петю — эта вкладка закроется сама» — and closes when the browser allows it; Petya's window comes to the front. A failed sign-in shows the same page with a red cross and the reason.
- Settings no longer have the «Подключения выбранной компании» card: it had no settings, only an explanation that is on the «Компании» screen.

## 0.14.4 — «Собери дашборд» adds what it needs and asks for a page for the rest

- «Собери дашборд»: a catalog app that would show a part and needs nothing connected is added on the spot («Добавил приложение «Отзывы в сторах»»); for one that needs a connection the reply names it.
- For a part no app shows («погода на марсе») Petya asks for the page where it is visible, opens it in the browser next to the chat for you to sign in, and the widget reads that page. A sign-in page is reported, never filled in.
- «Краши» alone is enough for the crashes widget; Slack window snapshots in the materials are no longer duplicated.

## 0.14.3 — dashboards from metrics, Grafana and ANR

- «Собери дашборд: основные метрики проекта (из wombyte), краши и ANR» builds three widgets: game metrics read from the Grafana at dashboards.wombyte.net, crashes and the Google Play ANR card.
- Short phrases work: «краши», «отзывы», «сборки», «ANR» are read as «покажи …».
- «(из wombyte)», «из графаны»: a source named in the phrase picks that source; Grafana is known by the name in its address.
- New widgets: «Основные метрики», «DAU за неделю», «Выручка за месяц», «ANR за неделю», and the Grafana dashboards you opened recently.
- When a phrase has no source, Petya names the app to add or connect («для «ANR» подключите «Google Play Console»») and offers to add it; the generic hint stays only for phrases no app knows.
- In the chat «DAU из wombyte» reads the metrics from that Grafana.

## 0.14.2 — Google Play says why it refused

- Instead of «Сервис вернул HTTP 403» the Google Play connection says what is missing: the Google Play Developer Reporting API turned off in the Google Cloud project (with the link to turn it on), or no access to the apps in Play Console (who to invite and with which permission). An expired sign-in asks to reconnect.

## 0.14.1 — the macOS download passes Apple's check

- The release build signs every binary inside the app with the Developer ID, the hardened runtime and a timestamp, inside out — Electron's framework libraries and helpers included — so `Petya.dmg` passes notarization and opens on any Apple Silicon Mac without a warning.

## 0.14.0 — «Генератор уровней»: RTS maps from a phrase

- New app «Генератор уровней» (gamedev): «сгенерируй карту 2 на 2 с рекой посередине», «сделай симметричную карту для 4 игроков, побольше руды». Petya drives the RTS engine through its own MCP server rtsmcp and shows the map as a picture with starts and deposits, path lengths between starts and the engine's validation.
- Edits in plain words on the draft — «сделай реку шире», «добавь ещё 2 месторождения у центра», «убери лес у центра», «больше руды» — with «Отменить правку»; «Ещё вариант» tries the next seed.
- «Проверить баланс» plays bot matches on the map: win rate per start and match length. Runs in the background, can be cancelled.
- «Сохранить в проект» writes the map into the project folder and its game.json only after you confirm, and never overwrites an existing map without a second confirmation. «Открыть в редакторе» starts the engine's editor with the project.
- «Покажи мои RTS-проекты»: the project is chosen once per Petya project. An engine you already have (settings, PATH, ~/RTSEngine) is used as is; otherwise the ready build (macOS Apple Silicon ~43 MB, Windows ~53 MB) downloads with a checksum check, progress and «Отменить», and «Обновить» appears when a newer build is published.

## 0.13.0 — onboarding, hiring, GDD, screen recording to bug, balance simulation

- **Team apps**:
  - **Onboarding**: a two-week plan for a newcomer with the docs, people, starter tasks and accesses they need.
  - **Hiring**: candidates, interview questions, and feedback that quotes the interviewers. No scores or rankings.
  - **Performance review**: facts with links, and an explicit note of what data is missing.
- **Docs apps**:
  - **Game design document**: numbers cited from configs by file and line; written only after you see the changes.
  - **Wiki from discussions**: verbatim quotes from the thread; can update a page that already exists.
  - **What changed in a document**: compares versions from git, Confluence or Google Docs.
- **Computer apps**:
  - **Screen recording → bug**: you pick the window; the game log is attached; the bug is filed in Jira only after you confirm.
  - **Clipboard history**: off by default; skips passwords.
  - **Downloads cleanup**: removes files to the trash only, with undo.
- **Gamedev and documents**:
  - **Balance simulation**: player progression by your current configs.
  - **PDF contracts**: terms with quotes and page numbers; deadlines become reminders.
  - **Live-ops event ideas**: each idea with evidence and its cost in game currency.

## 0.12.5 — where the Grafana token comes from

- Grafana settings explain who creates the service account token and how, with a link to this Grafana's service accounts page. The link uses the organization from a pasted dashboard link (`?orgId=`).

## 0.12.4 — a macOS download in every release

- The Release workflow builds Petya for Apple Silicon Macs on GitHub as well: the speech runtime (whisper.cpp with Metal and the base model), every binary signed with the Developer ID and the hardened runtime, `Petya.dmg` notarized by Apple and stapled. It is attached to the release next to `Petya-Setup.exe`.
- Without the signing secrets the release is Windows only, and a failed Mac build does not hold the Windows release back.
- The channel post says «Скачать для macOS и Windows» when the release has the Mac image.

## 0.12.3 — Petya knows which colleague is you

- «Команда» has «Это я» on each card (one card at most) and an «это вы» mark next to the name. Without a mark Petya finds your card himself by your Jira email or your full name.
- In answers Petya talks to that person as «ты» and no longer suggests «Алекс (или ты)» when you are the Alex in question.
- Scrollbars look the same everywhere: the thin chat scrollbar on every screen, including the dashboard window.
- Settings «Модели Пети» show the group's version, let you pick a published version of each part, and choose the default answer model.

## 0.12.2 — «Важное» as a popover, steadier materials, «Реализовать» fixed

- «Важное» opens as a popover (it was cut off inside the header); each mark has «Убрать», and there is «Убрать все»; the star on a message removes its mark.
- Materials: a meeting recording no longer redraws the whole page every few seconds; an open transcript keeps its scroll.
- «Реализовать» no longer fails with «Чат изменился»; the card opens the plan's new chat.
- A chip above the input shows what the chat is about («Про: Jira · BW-4569»); errors under the input go away by themselves.
- The chat browser shows why a page did not load instead of a white screen.

## 0.12.1 — a meeting keeps recording when you switch company

- The company can be switched during a meeting: the recording goes on in the background for its own company, whose tab shows a red dot; another company sees it and can stop it, and starts no recording of its own meanwhile. Recognition waits until the recording company is open again and uses its speech settings and memory.

## 0.12.0 — retro, ADR, funnels, purchases; Unity connects itself

- **New apps**: retro, ADR (architecture decisions), doc freshness, funnels, in-app purchases, «объясни график»; search sources, export to Google Docs and Sheets, messengers wired into the apps that read chats.
- **Unity finds and connects itself**; apps without settings (Asana) can be deleted from the catalog.
- **Slack feed** in the chat, Petya's own dialogs instead of system ones, Zoom speakers named without screen-reading access.

## 0.11.4 — a Jira link opens that issue

- A Jira issue link («https://…/browse/BW-4569 посмотри эту таску», or just the link) or «посмотри задачу BW-12» shows that issue — type, status, priority, assignee, due date, version, parent, description, the latest comments and links, with its card — instead of the project's task list. Only the connected Jira site and the projects allowed in the connection are read.

## 0.11.3 — project settings tidy-up

- Project settings in one column, with tree lines, chips and spinners.
- A Unity game's icon is found in a subfolder of the project too.

## 0.11.2 — meetings go to their company, «её задачи»

- **A meeting is recorded in its company.** When a Zoom meeting starts, Petya reads who is in it and compares the names with each company's «Команда» (full names, «Имя на встречах», aliases, email names). If clearly more of another company's people are there, he switches to that company before recording and says so. No known names, a tie, or one company only — the meeting is recorded in the open company as before. On Windows Zoom's window does not give the names yet, so there it stays as before.
- **«Какие у неё задачи?»** after a question about a colleague shows that colleague's card and open Jira issues instead of every task in the project.

## 0.11.1 — agent board tidy-up

- The agent board no longer shows chats of archived projects.
- The rail item is called «Агенты» instead of «Claude и Codex».

## 0.11.0 — Google Drive, people records, more messengers

- **Google Drive**: find files, read a Google Doc and answer from it with checked quotes, save an answer as a new Doc.
- **People records** on «Команда»: absences, 1:1 notes and follow-ups; «Встречи 1:1» prepares a one-on-one, «Отсутствия» shows who is away and when they return; sprint capacity counts absences.
- **Messengers as sources**: Slack, Mattermost and VK Teams answer «что писали» the same way.

## 0.10.0 — app catalog, dashboards, agent board, English interface

- **App catalog**: 80+ apps by category with tiles, details and examples; apps install from a folder or a .zip without rebuilding (`docs/extensions.md`).
- **Dashboards**: any data card goes onto a dashboard that refreshes itself; widgets are arranged freely.
- **Agent board**: what Petya, the Programmer, Claude and Codex are working on, with real statuses.
- **Interface in English**: the system language by default, Russian or English in settings; requests in other languages are understood.
- **Meetings without Zoom in the core**: any call or none at all; Zoom, Google Meet and Teams are apps.
- **Programmer** and «Выполнить» on tasks: code written in a separate branch with tests, or by Claude and Codex under a plan.
- **Tasks to people**: assignees by role and workload, one send to Jira or Asana, «Blocks» links.
- **Chat browser**, relative times, project sharing through git, deleting companies, an introduction on first launch, a smaller Petya.app (the larger speech model downloads on first launch).
- Details of the earlier changes in this version follow.


**Meetings without Zoom in the core.** Petya records meetings, not one app: «Слушать встречу» works with no meeting app at all (system audio and the microphone until the user stops it), «Запись встреч» in settings holds the start mode and the microphone, transcripts are «Встреча», the team field is «Имя на встречах». Meeting apps plug in as meeting sources (`src/features/meeting-sources.cjs`); «Zoom» became such an extension (`src/extensions/zoom`, [apps/zoom.md](apps/zoom.md)): Zoom window detection, speaker names, the personal room for the calendar and scheduled recordings. It is off for new users and added automatically for those who recorded Zoom meetings; old settings migrate once (`src/meeting-migration.cjs`). `tests/core-meeting-guard.cjs` keeps Zoom out of the core and other extensions.

**Programmer.** Petya writes code himself on a local model: «Напиши функцию…», «Исправь баг в модуле…», «Добавь тесты для…». Each task runs in its own git worktree on a `petya/…` branch, with tools to list, search, read and edit files and to run the project's tests; Petya then runs the tests himself and feeds failures back. The chat card shows the diff and the check; «Прими» merges into the current branch, «Оставь в ветке» keeps a commit, «Отклони» deletes it. Separate model choice for code in the extension's settings. Details: [coder.md](coder.md).

**Tasks to people, one send to Jira or Asana.** After a decomposition the planner picks people for the tasks and shows a summary before anything is sent (`src/assign.cjs`, `src/features/assignment.cjs`). The local model reads the tasks next to the «Команда» cards (role, responsibilities, projects) and names up to three people per task with a fit and the task size; a deterministic step then gives each task to the best fit, counting the person's open tasks and what this plan already gave them (score = fit − 0.03 × load, load = open tasks + 2 × size of tasks given in the plan), so near-equal fits go to the less loaded person and one strong person does not get the whole feature. A person named in the request keeps the task; a task nobody fits (fit below 0.4) or whose people have no account in the chosen tracker stays unassigned and is listed. The summary shows who gets which tasks with open tasks before → after, unassigned tasks, people without an account, and where the plan goes; one button sends it — «Отправить 6 задач в Jira» or «…в Asana», whichever is connected, with a switch when both are (the choice is remembered; switching rebalances without asking the model again). Without Jira the plan is made without boards and sprints. Asana gets a batch with assignees and task dependencies (`addDependencies`); a task whose creation result is unknown stops the batch and blocks a retry, a definite rejection can be retried. A voice-started plan asks for the Asana project when it is not clear.

**Jira links and versions.** Dependencies of a Jira batch become «Blocks» links between the created issues once the issues exist (`Workspace.link`); the text in the description stays as a fallback. The first link of a batch is read back from the blocked issue and recreated the other way round if the site read it reversed, since the API does not define the direction. Existing links are read before each issue's links are added, so a retry adds only what is missing; a link that fails is named on its row and undoes nothing; without a «Blocks» link type the plan says so. Each task has its own Fix Version («Как у пакета» by default), checked before the first write; an open version the discussion or request names exactly («в 1.19.3») is chosen for the batch by itself.

**Team workload.** Open tasks per person from Jira (one JQL search, with how many are in progress) and Asana (per user), matched to the team by account, name or email and cached for five minutes (`src/workload.cjs`). The team page shows a count and a short bar next to each name with «Обновить загрузку»; chat answers «загрузка команды», «кто свободен», «у кого меньше задач», «сколько задач у Маши» (any case of the name, aliases count). A source that fails is reported, not shown as zero.

**Decomposition of any size.** «Декомпозируй эту фичу» is understood in everyday wording too — «декомпозь давай», «разложи фичу на задачи», «нарежь тасков по спеке», «раскидай это по задачам» (`decomposeRequest` in `src/core.cjs`; rarer paraphrases go through the tool router's `jira-decompose` capability). Chosen documents now reach the planner whole and with their headings: a Confluence page is kept in full, a long Notion page is read to the end once chosen (the search list still shows its start). The planner measures the material against the model window (`model-context.SIZE`, 16k tokens). When it fits, the plan is made in one request as before. When it does not, the material is cut into parts by sections, and up to three agents read it at once — each takes its own contiguous range of parts of about the same size, so no part is read twice — writing out requirement notes; notes are merged until they fit (a note the model leaves out of a merge is kept as it was), and the plan is made from the notes, each task naming the notes it covers and the sections in its description (`src/decompose.cjs`). Overflow is caught (Ollama's `truncate:false` error, `prompt_eval_count`, `done_reason`) and the part is halved and read again. The planner shows an overall progress bar and a line per agent; progress is counted in token-time (a token read costs 1, a token written 15; each step adds its cost when known, the plan's share is reserved up front, and the bar never goes back), and the notification center keeps one card per run. After the plan, a coverage box says what was condensed and highlights what did not reach it: unreadable parts, notes that did not fit, notes no task covers, proposed tasks past 12, a team list narrowed to the people the material names. A voice-started plan with such losses is not sent without an explicit yes. Limits: still at most 12 tasks per batch; very large material can take many minutes on a local model.

**Skills.** A built-in library of 100 instruction skills (`src/skill-library/`): tasks and Jira, releases, QA, development, games and mobile, analytics, communication, management, documents, product. For each request a lexical shortlist over skill names and descriptions (up to six candidates) goes to the local model, which picks one skill or none; small talk, facts, service data and actions get none. The chosen skill only shapes the answer of that one request (instructions added through the `skill` hook of `dialogue-request.cjs`, the answer is labelled «скилл name»); it grants no tools or access. «/name» runs any built-in skill explicitly; a user skill with the same name replaces it, a disabled one switches it off. `autoSkills=false` turns the automatic choice off. Every skill has a typical request in `tests/skill-requests.cjs` that must shortlist it.

**Skill packages.** All skills of [anthropics/skills](https://github.com/anthropics/skills) (Apache 2.0) and [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) are bundled in `src/skill-library/packages` with their files and licences (`SOURCE` names the commit). Each has a Russian description in `packages/ru.json` for the choice; the model gets SKILL.md, the reference texts it names and the list of its files. Petya does not run the scripts itself. `code-review` and `retro` of mattpocock are `matt-code-review` and `matt-retro`.

**One-click connections.** Telegram connects with one «Подключить»: Petya shows a QR code to scan in the Telegram app (Settings → Devices → Link Desktop Device), asks for the two-step password after the scan if there is one, and loads the chats; ticking a chat saves the choice. The app's api_id and api_hash are asked once when the build has none and stay after disconnecting; phone-code login remains as a fallback. The QR code is drawn by `src/vendor/qrcode.cjs` (qrcode-generator 1.4.4, MIT). Google Play connects by signing in with Google in the browser (Desktop OAuth client from `integration-clients.json`, loopback redirect with PKCE, scope `playdeveloperreporting`); the service account key is kept under «Другой способ».

**Materials and meetings.** The materials page groups records by app (meetings, Slack, Telegram, mail, Jira, Confluence, Notion, notes) with their size, shows a meeting as one record with its duration, recording and transcription progress, and deletes a record or a whole meeting with its audio (`src/features/materials.cjs`, `src/ui/materials.js`). The list redraws only when something changed, so an opened record stays open. Meeting fragments are transcribed in the background while the meeting goes on; a recognition error during the meeting no longer stops the recording. Text Whisper makes up on silence — another alphabet while Russian was asked for, or stock video captions — is dropped (`hallucination()` in `src/speech-transcript.cjs`), and such saved transcripts are flagged on the page. Slack loads in the background by default, one request a minute per method, and without a channel list it takes the channels the user is a member of.

**Chat fixes.** A version picked from Petya's question is saved in the chat as the user's message, and «19.3» picks «1.19.3» (dots inside numbers are kept). «Сделай скрин из слака» takes a screenshot of that app's window without the model, shows it in the chat and adds it to the attachments; macOS screen recording is asked for first. Slack cards show people and channels by name, links by their labels and attached files with «Посмотреть», and «В обсуждение» opens the Slack app (`slack://channel?team=…&id=…&message=…`). With strong language allowed, Petya no longer opens replies with a stock word: the prompt names the words and starts of the last replies to avoid. «Покажи график по закрытым задачам» draws closed issues per day or week from Jira in the chat; the Jira results card left the growth page.

**Learning from the chat.** «Проверяй почту каждые 5 минут», «каждое утро в 9 присылай сводку» make a recurring command that runs in its own chat «По расписанию» through the background pipeline; «перестань проверять почту» stops it, «какие у меня повторы» lists them, and «Обучение» shows each with a live countdown, pause, run now and delete (`src/features/recurring.cjs`, `src/ui/learning-page.js`). A correction in the chat («нет, я имел в виду …») is saved at once and the corrected request answered. «Сделай скилл: …» makes Petya write a skill for himself; skills with files install from a folder or a .zip/.skill archive (`src/skill-library/installed.cjs`), and skills in a project folder (skills/, .claude/skills, .agents/skills) are used for that project's chats (`src/skill-library/project-skills.cjs`). The manual phrase and mail-skill forms are out of sight; those are taught in the chat. «Чему я научился» is written in Petya's own words, editable by the user, and recurring commands count toward the level. Meeting transcripts mark the user's microphone as «Вы» and the meeting sound as «Собеседники».

**Who talks in a meeting.** During a local Zoom recording Petya reads Zoom's own window every 2 seconds (`watch-macos --speakers`: tile labels, the active speaker, the participant list; read only) and gives each fragment of the meeting sound the name shown talking most during it (`src/zoom-speakers.cjs`). The transcript shows «Вы» for the microphone and the speaker's name, or «Собеседники» when Zoom showed none; the last window texts are kept in `zoom-speakers-sample.json` in the company folder to tune the parser.

**Corrections in any words; team filled neatly.** «Я имел ввиду не это, а …», «не то, мне нужны …», «ты не так понял, я хотел …» are learned and answered; «не так надо было, надо списком» or «я про баги в iOS» redo the last request with that; a bare «не то», «мимо», «я не это имел в виду» makes Petya ask what was meant and take the next message as the answer (a «нет» to Petya's own question is just an answer). Zoom names are matched to the team (`src/team-match.cjs`: either alphabet, initials, aliases, Jira names, email logins, device names) and shown with the role. «Polina — тестирование и пм» is saved as role «QA-инженер, менеджер проекта» and responsibilities «Тестирование, управление проектом»; the quote check runs on the user's words first. When people are left without a role, Petya asks for them and takes «Имя — роль» lines as the answer. The built-in skill `team-roster` holds the same rules for the model. A conflict question offers «Оставить «…»» / «Заменить на «…»»; the free-text button is «Ответить» and stays disabled until there is text.

**Zoom names in «Команда».** Each member has «Имя в Zoom» (several through a comma). Empty means Petya matches the name himself and shows which one as the hint; names seen in meetings are offered in the list; a chosen name wins over the automatic match. Transcript noise is dropped too: a word or two in another alphabet («哎»), sounds written as words («Cough.», «(смех)») and English stock phrases on Russian silence («Thank you.»).

**Cleaner meeting transcripts.** Qwen3-ASR gets the conversation language (it guessed and heard Russian as Czech or Chinese). The microphone also hears the meeting from the speakers: a microphone fragment that repeats the meeting sound within 20 seconds is that echo and is left out of the transcript and of the context for answers. Text in Czech or Polish letters is dropped like other made-up text.

**Meeting summaries and Zoom's letters.** A few minutes after a meeting Petya writes its summary — discussed, decided, who does what, and what was not discussed (raised without a decision, or the previous meeting's open tasks nobody came back to) — from the transcript without echo and made-up fragments (`src/features/meeting-summary.cjs`). If Zoom mailed its own transcript or summary within 48 hours (Gmail, `from:zoom.us`; a .vtt attachment is read as text), the letter is stored with the meeting and the summary is rewritten with it. The summary sits on top of the meeting record on the materials page («Сделать сводку» if there is none yet), and «сводка по последней встрече» / «что обсудили на встрече» answer with it.

**Team from Jira and Slack.** «Возьми имена в Jira, потом по ним должности в Slack и заполни команду» fills the team from Jira assignees and their Slack profile titles. Steps that feed each other («потом», «по этим именам», «оттуда») are no longer split into parallel agent parts or answered one by one by unrelated handlers; a team-directory request is checked before the agents offer.

## 0.9.1 — agent chats in the sidebar, list follow-ups, Windows CI

**Agents.** Agent chats sit under the chat that started them as a collapsible «Агенты · N» sub-list that folds itself when they are done and read; they go to the archive, come back and move to another project with their parent. An agent's chat always keeps its own answer, even when the pipeline also answered in another chat. «Ответить одним сообщением» answers every planned part and joins them into one reply; the combined answer has no greetings or forms of address.

**List follow-ups.** Questions about the list just shown are answered from it: «Какие из этих задач сделать сначала?» orders 3–5 open items with a reason each; «А какие из них на ревью / в работе / на паузе / не начаты?» filter by status groups («Owner Review» and «QA Review» count as review). Closed items are skipped, a partly shown list is named as such, and the latest list in the chat is used even after an empty answer. Jira task lists show open tasks first.

**Bugs.** When the current version has no open bugs, the answer also names the project's open bugs without a version and lists the five most recently updated.

**Windows.** Every push builds the installer on Windows in CI, checks its package against `src/` and starts the unpacked app for the tray check; a version tag publishes `Petya-Setup.exe` as a GitHub release. Fixed on the way: every IPC call was rejected when the app path contained a Windows short name (`RUNNER~1`), the bundled Ollama setup script was not found by makensis on Windows, the build lock used POSIX-only `fcntl`, and package verification read sources as cp1252.

**Privacy.** Recording Zoom meetings is off by default again and is never switched on by an update; installations that a one-off migration had switched on are switched back off once.

**Long dialogues.** A list follow-up after the conversation moved to another chat uses the project's latest list; weather answers «нет, в Казани» / «а завтра?» and no longer falls back to Google; «Что важно не забыть?» lists the «Важно» marks. A team-fill conflict answered by voice («замени») is saved again.

**Live check.** `PETYA_LIVE_ONLY=<regex>` runs only matching scenarios; turns record the peak number of simultaneous local generations; new scenarios cover agents across projects, list follow-ups and long mixed dialogues.

## 0.9.0 — agents, «Важно», live self-check

**Conversation quality.** Answers that repeat themselves are regenerated or replaced; self-corrections inside one phrase («Альфа, нет, Бета», «создай задачу, нет, не создавай») are applied before routing; names («зови меня Алекс») are kept exactly; Petya always says «ты» — model answers pass a deterministic rewrite of «вы/ваш/проверьте», with the user's gender from the name or the setting; an unsure tool router hands the turn to the dialogue model instead of asking «which tool?».

**Chats.** Many chats answer in parallel (background jobs with the full pipeline); answers stream as they are written; a compact one-line progress shows the current step and expands into «Ход работы», which stays behind the answer's hover row; each chat can pick its own local model.

**Petya's agents.** «Раздай агентам …», «сделай параллельно …» or a numbered list split into 2–6 background chats with a live plan card and one combined answer; requests over several areas get an offer («Раздать агентам» / «Ответить одним сообщением», the choice can be remembered); actions that change data are never started automatically.

**«Важно».** The user marks a message or its part (button on selection, star in the hover row, «запомни как важное: …»); marks go into every answer of the chat or the whole project.

**Work data.** «Мои задачи» across all projects with status filters and follow-ups («а из todo?», «а просроченные?», «покажи закрытые на мне»); Git status is short, branches/history/version are recognised in plain words; «Что нового в Slack?» summarises synced messages and falls back to reading the Slack window; a Jira draft can be made from the chat («создай задачу по этому обсуждению»); weather (Open-Meteo, wttr.in) and Bank of Russia rates come without a web search; a weekday morning brief («присылай сводку по утрам в 9:30»).

**Stability.** One context size for every local-model request and at most three generations at once (Ollama had grown to ~40 GB); a crashed Ollama runner restarts Ollama («Перезапустить Ollama» in connections); whisper-server processes left by a killed Petya are stopped on start.

**Code.** `main.cjs` is split into `src/*-setup.cjs` modules and feature modules in `src/features/` (defaults, validation, services and IPC per feature, see AGENTS.md); a live self-check (`PETYA_LIVE_CHECK`, 80 requests against the real model and services) cleans up after itself.

## Recognition fix (0.5.1)

When the app opens and before capturing the microphone/meeting, Petya checks that Whisper is ready. The automatic check waits for the model to load and connects automatically; concurrent requests share a single launch. If the server is unavailable and paths to `whisper-server` and the model are set, the app starts it locally, waits until it is ready, and only then begins recording. The whisper.cpp card has «Запустить распознавание» (Start recognition). A failed connection, a timeout, model loading, and an invalid path are shown as clear messages.

On this Mac the runtime is installed next to the sources: `runtime/whisper-build/bin/whisper-server` and `runtime/models/ggml-base.bin`. As long as `Petya.app` is in Projects/Peter, these files are detected automatically. If you move the app, specify full paths in the connections. The model and server are not included in the installer; Windows needs a Windows whisper-server.exe and a multilingual model. The selected paths are saved in the settings. Auto-start supports the standard `/inference` and loopback only.

Petya shuts down the server it started when it exits. An already running external server is used without restarting and is not stopped. The microphone stays off when the app starts.

## Connection buttons (0.5)

Each service has its own card and connect action. Slack, Notion, Jira, Ollama and whisper.cpp: «Подключить» (Connect) opens the settings, «Сохранить и проверить» (Save and check) saves only this service's fields and checks access. Confluence has a separate check using the shared Atlassian credentials. Settings are saved even if the check fails; the error is shown in the card. A saved token by itself does not count as a verified connection.

Slack checks authorization and reading of the specified channels; Notion checks search of accessible pages; Jira checks the user and the selected project; Confluence checks page search. The checks do not create or modify issues. Access to an individual issue/document and write permissions may differ and are checked when an action is performed. Ollama shows the installed models; whisper.cpp checks `/health`.

The Zoom button checks that a system audio track is available and releases the capture immediately. It does not authorize a Zoom account and does not start transcription. To record a meeting, use «Слушать встречу Zoom» (Listen to Zoom meeting).

**OAuth sign-in via the browser is not connected yet:** it requires registered Slack, Notion and Atlassian apps and an implementation of a local OAuth flow. The buttons that open a service's settings lead to the corresponding console rather than imitating OAuth. For now, cloud services are connected with tokens. A client secret must not be included in a distributed exe/app.

To prepare OAuth: register apps in [Slack](https://api.slack.com/apps), [Notion](https://www.notion.so/my-integrations), [Atlassian](https://developer.atlassian.com/console/myapps/); use the prepared localhost callback URLs for a personal pilot; configure minimal read permissions for Slack/Notion/Confluence and the necessary Jira permissions. For Slack, desktop PKCE without a client secret is prepared. The local Notion/Atlassian option requires verifying the registered callbacks and storing the owner's own secrets in Keychain/DPAPI; a shared secret must not be distributed with the app. Registration and publication of the apps have not been done in the current version.

## Notion documentation (0.4)

In «Подключения» (Connections), enter a Notion internal integration token with the **Read content** permission. In Notion, connect the integration to the required pages via the **Connections** menu. The token is stored encrypted by OS facilities and is not returned to the UI. An empty field keeps the token; a separate checkbox deletes it.

Documentation search queries Confluence and Notion, shows the source of each page, and lets you select up to five documents from both sources. The text of the selected pages is passed to the local model, and links are added to issue descriptions. Notion can be used for search without connecting Jira; creating issues requires Jira.

Limitations: the Notion API searches **by titles**, not by full content. The first four keywords of the context or of the refined query are used, with up to two pages of results per word. The ten most relevant documents are read, including nested blocks and tables (up to four levels, eight block requests and 18,000 characters per document). Limited results and incomplete text are flagged. Nested pages are searched separately; file contents, databases and comments are not indexed. There is no semantic index yet.

A Notion access error or rate limit is shown next to the results; accessible Confluence documents remain visible. If a page could not be read, it is not added to the context. The integration is read-only (POST is used exclusively for search). Request limits are respected with a queue; after HTTP 429, repeat the search later.

API: [search by titles](https://developers.notion.com/reference/post-search), [reading blocks](https://developers.notion.com/reference/get-block-children).

## History, edits and rollback (0.3)

The «История» (History) section shows single issues, batches, edits and the result of each step. Select the issues you need, write what to change, and click «Подготовить правку» (Prepare edit). For example: «Переназначь вторую задачу на Машу и перенеси её в следующий спринт» ("Reassign the second issue to Masha and move it to the next sprint"). Ollama proposes changes to the summary, description, assignee, fix version and sprint. An ambiguous request returns questions; add to the text and retry. Before sending, the before/after values are shown. Statuses and arbitrary fields cannot be edited yet.

- «Откатить эту правку» (Roll back this edit) restores the previous values of the affected fields, including the original ADF of the description. Works without the model.
- «Откатить создание» (Roll back creation) **permanently deletes** the selected issues from Jira after a separate confirmation. The previous keys cannot be restored. Delete permissions are required; sub-tasks are not deleted.
- Before a rollback, the saved snapshot, modification time, creation label and absence of sub-tasks are checked. External changes block automatic rollback. For old records without a snapshot, rolling back creation is unavailable.
- Before writing, the current values are re-checked. Jira does not provide an atomic transaction here: a gap remains between the check and the write. A batch may complete partially; the history shows this, and there are no automatic retries of requests with an unknown outcome. After a failure with an unknown result, reconcile with Jira.
- A closed sprint, a released/archived version or an unavailable assignee cannot be restored. Petya shows an error without substituting the value.
- The last 100 records with original and new values are saved in `batch-history.json`, encrypted with Electron safeStorage (Keychain / DPAPI). An old log is read and rewritten in encrypted form on the next save. «Очистить память» (Clear memory) does not delete this log.

0.3 checks: 12 history tests in addition to the 23 existing ones; the UI smoke test checks batch creation, a text edit with preview, and rollback against test API responses. No real issues are modified during the checks.

## Documents, decomposition and planning (0.2)

Example commands:

- «Петя, найди документацию по этой фиче». ("Petya, find the documentation for this feature.")
- «Петя, декомпозируй эту фичу». ("Petya, decompose this feature.")
- «Петя, заведи несколько задач для реализации этой фичи». ("Petya, create several issues to implement this feature.")

After a discussion is selected, the planner opens. For an ordinary single draft, the «Найти документы / декомпозировать» (Find documents / decompose) button is available.

1. **Documents:** search for Confluence pages on the same Atlassian Cloud site using words from the selected discussion; you can refine the query and restrict the space key in the connections. The Atlassian API token and email from Jira are used; the token's permissions must include reading Confluence. Up to 10 results are shown, with excerpts and links. Select up to 5 documents: their text and links will go into the decomposition. This is a lexical CQL search, not a vector index. Other document stores are not connected yet.
2. **Decomposition:** the installed Ollama model drafts 2–12 editable issues (material larger than the model window is read in parts by several agents — see «Decomposition of any size» above) with a description, criteria, questions and dependencies. Without the model, you can assemble a batch of 1–12 issues manually. Links to the selected documents are added to the generated descriptions. Dependencies are saved as text; Jira issue links and the Epic and sub-task hierarchy are not created yet.
3. **Board and sprint:** the project's Scrum boards and active and future sprints are loaded. A single board/single active sprint is filled in automatically; otherwise a choice is required. A board ID can be set for a permanent board. Kanban without sprints is not supported by this batch scenario.
4. **Version:** `fixVersions` is filled in. «Текущая» ("Current") is either the unreleased version ID explicitly set in the connections or the project's only unreleased, unarchived version. If there are several options, Petya asks you to choose rather than guessing by name or date.
5. **Assignees:** the project's assignable users are loaded (up to 1000 results); there is a separate search by name. The «Кто за что отвечает» (Who is responsible for what) field helps the model match roles to people. An unknown ID is rejected; an issue without a selected assignee is not sent. The model's suggestions must be reviewed, especially when names match.
6. **Sending:** a single button starts sequential creation of the whole batch, with assignee and version, followed by adding each created issue to the sprint via the Agile API. Permissions to create issues, assign, change the version and plan the sprint are required. If the project scheme requires additional fields, Jira will reject the creation. The state of each issue is displayed separately.

Retrying a batch skips already completed actions. If an issue was created but moving it to the sprint failed, only the move is retried. If the result of a creation is unknown, the batch stops: creation must not be retried automatically. Check Jira; issues are tagged with the label `petya-<UUID пакета>` for reconciliation. A batch is not an atomic transaction and does not roll back issues that were already created. After the first request, its contents cannot be changed.

The `batch-history.json` log in userData keeps the last 100 creation records as well as related edits: project, site address, issue fields, keys, statuses and errors. It is encrypted by OS facilities. Issue descriptions may include excerpts from discussions and documents; tokens are not written to the log. After a restart the log is visible, but automatic continuation of a batch is not supported — reconcile with Jira first. Clearing the context does not delete the log. While the app is running, saved unfinished batches keep the issue texts in memory for retries.

## Running

Requires Node.js 22+.

```sh
npm ci
npm start
```

Configure services in the «Подключения» (Connections) section. Without them, you can add a transcript manually and go through the scenario up to an editable draft with a text command.

### Speech recognition

Install and build [whisper.cpp](https://github.com/ggml-org/whisper.cpp). In its directory:

```sh
bash models/download-ggml-model.sh base
cmake -B build
cmake --build build --config Release -j
./build/bin/whisper-server -m models/ggml-base.bin --host 127.0.0.1 --port 8080
```

On Windows, use the corresponding whisper-server.exe and the upstream build instructions. A multilingual model is required, not `.en`. The default address in Petya: `http://127.0.0.1:8080/inference`.

Turn on the microphone and say the full command, then pause: «Петя, заведи задачу в Jira для реализации этой фичи» ("Petya, create a Jira issue to implement this feature"). If you say only «Петя» ("Petya"), the app waits up to 12 seconds for the next utterance. Choosing the context and reviewing the draft are still done with the mouse.

Speech is split at pauses, with a maximum of 15 seconds per fragment, and converted to WAV mono 16 kHz. All recognition runs on localhost, including wake-word detection. This is not a separate lightweight wake-word model: CPU/GPU load and latency depend on Whisper. If the queue overflows, recording stops with an error. Audio is not written to disk. Before the wake word, the microphone transcript is not included in memory, except when meeting mode is on.

### Zoom / meeting

Click «Слушать встречу Zoom» (Listen to Zoom meeting). **All system audio** is captured, not a specific app. The video track is needed for the system capture API; frames are not processed or saved. Your own utterances get into the context if you also turn on the microphone. Use headphones to reduce echo.

On macOS, system audio via CoreAudio Tap requires macOS 14.2+ and OS permission; the specific behavior depends on the Electron/OS version. On Windows, loopback is used. If the audio track is missing or ends, the app reports an error. Real Zoom capture must be verified on both target OSes; this is still an experimental path, not a Zoom SDK integration. The fallback is importing `.txt` / `.vtt` in the «Контекст» (Context) section.

Utterances from one session are grouped. A command considers only already transcribed context whose recording end time is no later than the start of the command. Utterances still in the recognition queue are not included in the current snapshot. For a meeting longer than the memory limit, the tail is kept. There is no speaker separation, topic segmentation or connection to Zoom Cloud.

### Slack

Enter an OAuth token and up to 5 channel IDs. Access to the channels and the scopes `channels:history` / `groups:history`, depending on channel type, are required. The «Обновить Slack» (Refresh Slack) button loads up to 15 messages per channel for the last 24 hours. Thread replies, pagination, real-time events and OAuth login are not implemented yet. Error 429 is shown to the user; there are no automatic retries.

### Jira Cloud

Requires the address `https://company.atlassian.net`, an email, a regular API token, a project key and an issue type ID. Scoped tokens via the Atlassian gateway are not supported yet. The issue type ID depends on the project. Creation uses REST v3 and ADF; projects with additional required fields are not supported yet.

An issue is sent only after clicking «Создать задачу в Jira» (Create Jira issue). An indeterminate network error blocks re-sending the same draft: check Jira first. Creating a single issue is also recorded in the persistent log. Retrying the same ID is blocked after a restart; a new command with a new ID is not recognized as a semantic duplicate.

### Local language model (optional)

Install Ollama, download the chosen model and enter its name. The default API is `http://127.0.0.1:11434/api/chat`. The model formats the selected discussion into a JSON draft. Without it, a transparent template with the original context is used. A model error is not masked by a successful result.

Context search is currently heuristic: query words, time, and grouping of meeting utterances. When there are several plausible sources, a choice is shown. This is not yet a full semantic memory or a general-purpose agent; issue creation and limited edits via the history are available. Source data has no access to tools.

## Storage and management

- Tokens are encrypted with Electron safeStorage (Keychain / DPAPI) and are not returned to the UI. Settings are stored in `app.getPath('userData')/settings.json`.
- Context and drafts are kept only in RAM (except for the batch result log described above), up to 200 fragments; the last 24 hours are considered for search. «Очистить память» (Clear memory) deletes the context and drafts.
- Closing the window leaves the app in the tray. The tray menu lets you turn off recording or quit. After screen lock/sleep, recording stops and is not resumed automatically.
- The microphone and meeting capture are off at startup. There is no auto-launch, signed releases or auto-update yet.
- Recognition and the LLM allow loopback HTTP only. Slack and Jira are called from the main process over HTTPS; the renderer is isolated, without Node.js or arbitrary IPC.

## Testing and building

```sh
npm test
PETYA_SMOKE_TEST=1 npm start # macOS / Linux: UI smoke test without external actions
npm run pack
npm run dist:mac
npm run dist:win
```

The single command `python3 scripts/build.py` rebuilds macOS and Windows. `--mac` and `--win` select the platform. The only finished builds are `Petya.app` and `Petya-Setup.exe` in the project root. A new build replaces the current one; backup and versioned copies are forbidden. Temporary files are kept in the system temp directory and cleaned up automatically. Concurrent builds are blocked.

macOS is signed with a permanent Developer ID Application certificate and includes Whisper and the model. Before replacement, the completeness of the sources, the signature and the Whisper launch are checked. The build is not notarized. The Windows package is checked for completeness of the sources inside ASAR; installation and launch must be checked on Windows. The single-current-build rule is set out in `AGENTS.md`.

Tests cover wake word boundaries, ambiguity, the time cutoff, meeting grouping, endpoint locality, ADF and WAV. Manual acceptance: microphone permissions, real Zoom audio, pause from the tray, sleep/lock, Slack 401/429, sending to a test Jira project, timeout after sending. These checks require connections and real devices.

0.2 checks: 10 original tests + 13 planner tests; the UI smoke test covers document search, decomposition, editable issues and batch sending against test responses. Real Atlassian permissions, project scheme constraints, issue assignment and visibility on the Scrum board need to be verified on your test project. A board filter may hide an issue even after it has been added to the sprint.

## Next steps

1. Semantic search and extraction of individual topics/decisions within a meeting; full Slack threads and background events.
2. A separate wake-word detector, streaming STT, voice clarification and cancellation.
3. Slack/Jira OAuth, Jira required-field schemes and an extended action history.
4. Auto-launch, signed installers and testing of audio capture on macOS/Windows.

## API documentation

- [Electron Tray](https://www.electronjs.org/docs/latest/api/tray), [system audio capture](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [whisper.cpp server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server)
- [Slack conversations.history](https://api.slack.com/methods/conversations.history)
- [Jira REST v3 issues](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

- [Confluence CQL search](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/)
- [Jira assignable users](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/)
- [Jira sprint API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/)
- [Jira project versions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-versions/)

### Handoff to the Claude and Codex apps (0.6)

Commands: «Петя, заведи клоду задачу, пусть реализует эту фичу» ("Petya, give Claude a task to implement this feature");
«Петя, заведи таски в Jira, все которые на меня — отдай кодексу» ("Petya, create the Jira issues and hand all the ones assigned to me to Codex").
In Подключения (Connections), check the installed app. Sign-in is done in Claude/Codex itself.
A direct command assembles the selected discussion and the first three documents found into an editable prompt.
For a compound command, first review the Jira plan, assignees, sprint and version; after creation, Petya
reconciles the current issues and the current user's accountId and hands the matching issues over in a single prompt.
Unfinished issues without a key are not handed over. Repeating the batch send command does not duplicate the handoff.

The official deeplink interfaces open a new chat and fill in the input field but do NOT send the prompt:
click send in the agent app. If the prompt is too long for a link, the full text
is copied to the clipboard: paste it into a new chat and send it. The content is not truncated.
The handoff history is encrypted by OS facilities; the status does not mean the agent has started or finished the work.
Cancelling and continuing execution happen in the agent app. Automating the send button is not implemented yet.
The Jira history and its rollback do not cancel work already sent to the agent.

Protocol documentation:
- https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link
- https://learn.chatgpt.com/docs/reference/commands#chats

### Background sources and memory (0.7)

In Подключения (Connections) → «Память и фоновая работа» (Memory and background work), set a retention period of 1–7 days (7 by default),
Slack auto-refresh and Zoom auto-transcription. Automatic reading/capture is off initially.
Context is saved encrypted by OS facilities, survives restarts and is purged by the retention period.
The same period applies to the text of agent prompts and local Jira snapshots: once it expires,
rollback via Petya is unavailable; issue keys and statuses remain for the history and to protect against re-creation.
Data already sent to Jira/Claude/Codex is not deleted by this setting.

Slack: a user token and 1 to 20 IDs of selected channels/conversations (C…, D…, G…). The corresponding
channels:history, groups:history, im:history, mpim:history are required. The API is used, so the Slack window
can be closed. Loading is paginated (15 messages), including thread replies; the 1/5/15-minute intervals
set the start of a pass, while the actual speed depends on Slack's limits. The conservative interval
between requests to the same method is 61 seconds; Retry-After is respected. The initial load of a busy
week may take a long time. A pass looks for root messages within the retention period:
new replies to older threads not yet known to Petya may not get into the context.
Deleting a message in Slack does not automatically delete the already downloaded local copy — it
disappears when the retention period expires or after clearing memory. Access errors are shown in the status.

Zoom: detection of a window of the us.zoom.xos (macOS) / Zoom.exe (Windows) process, without reading other apps' windows.
The standard titles «Zoom Meeting», «Zoom Webinar», «Конференция Zoom» (Zoom Meeting) and
«Вебинар Zoom» (Zoom Webinar) are supported, or a selected exact title. Two consecutive detections start
capture; the window disappearing for three checks (~15 seconds) stops it. This is detection by
window, not an integration with the Zoom meeting state: a non-standard title requires configuration.
The «Проверить открытые окна Zoom» (Check open Zoom windows) button lets you select a window during a test meeting.
macOS requires screen/system audio recording permission; your own voice needs microphone access.
Text is saved, not audio/video. All system audio is captured, not just Zoom.
Stopping from the tray, locking and sleep pause auto-start until the meeting window disappears.

Native macOS helper: `native/watch-macos.swift`, built with `npm run build:native:mac`.
Windows uses local PowerShell/Win32 EnumWindows, without additional libraries.
Slack documentation: https://docs.slack.dev/reference/methods/conversations.history/
and https://docs.slack.dev/reference/methods/conversations.replies/.


### Windows EXE with automatic Ollama installation (0.8.0)

`npm run dist:win` includes an Ollama installation script in Petya's EXE.
On a new Windows computer, the installer automatically downloads the official
OllamaSetup.exe version 0.40.14 (1.68 GB), verifies the SHA-256 from the GitHub Release
and the Ollama Inc. digital signature, then runs a silent installation.
An internet connection and free space for Ollama are required. Both apps are installed for
the current user. An Ollama already installed in the standard folder,
on PATH or registered in HKCU/HKLM is kept without updating.
On error, you can retry; log: `%TEMP%\Petya-Ollama-install.log`.
Uninstalling Petya does not remove Ollama or its models.

Language models are not included: after installation, click «Запустить Ollama» (Start Ollama),
choose and download a model, then check the connection in Petya.
On macOS, Ollama installation remains separate.
Official installer sources and license: https://github.com/ollama/ollama

### Check on open (0.8.1)
On startup and when the window is reopened, Petya checks the saved connections and updates the cards
and the sidebar. Repeated openings within 30 seconds are merged; one error does not affect
the other services. The check does not save form fields and does not override the result of manual configuration.
Claude and Codex are combined into the «ИИ» (AI) card with separate checks of the app installations.
The automatic check does not start recording or local servers. For Zoom, OS permissions are checked;
real capture of the audio track is still checked with a separate button.

### Zoom window search (0.8.2)
The search button no longer calls CGRequestScreenCaptureAccess in a separate helper.
When the helper's status and the main app's status disagree, Petya's permission
and window titles from Electron are used; windows are filtered by IDs belonging to the Zoom process.
If macOS does not yet apply an already enabled permission to the running instance, the UI
suggests fully quitting Petya and opening it again, without requesting the permission again.

### Actual check of window access (0.8.3)
An explicit window search no longer stops just because of a negative preliminary
CoreGraphics/Electron status: it checks the available windows through the main app's API.
Zoom not running or having no windows is not treated as a permission denial. The background check
does not itself trigger an access request; a successful manual search is remembered until the app quits.
The button is disabled during the search, and a manual search is not overridden by the result of the background check.
On this Mac, the signed build was verified without recording audio: access confirmed, 6 Zoom windows found.

### System audio capture on macOS (Electron 43)
For Electron 39–44, before the app starts,
`MacCatapLoopbackAudioForScreenShare` is disabled: ScreenCaptureKit is used with the permission
«Запись экрана и системного звука» (Screen & System Audio Recording). This works around the situation where CoreAudio Tap
returns an ended audio track even though screen capture is already permitted.
In Electron 45 this flag has been removed; an update requires a repeat hardware test.
Source: https://releases.electronjs.org/pr/53646
The connection check and listening use the same check for a live audio track;
if there is no track, all received tracks are closed. After an update, the old build must be
fully quit. Automated tests do not confirm real
system audio recording: it should be verified manually with the macOS permission.


### Asana — OAuth and tasks

In «Подключениях → Asana» (Connections → Asana), click «Подключить Asana» (Connect Asana), compare the code in the browser, allow access and choose a workspace. Users do not need their own keys. The Petya app is available for any workspaces (subject to Asana administrators' restrictions).

The «Asana» section loads projects and tasks with next-page buttons. Creating tasks and changing the name, description, due date and completion mark are available. A preview is shown before writing; changes are sent only after a separate confirmation. External changes after the preview block the write. An indeterminate send result is not retried automatically — check Asana first. The preview is single-use, valid for 10 minutes and does not survive a restart. The comparison before writing is not an atomic lock on the Asana side.

A selected task can be added to the local context and used in Petya's existing scenarios. Voice routing of commands directly to Asana, assigning assignees, custom fields, comments, deleting and rolling back tasks are not implemented yet. Asana tasks are handled in a separate section.

OAuth scopes: workspaces:read projects:read tasks:read tasks:write. The server stores tokens encrypted; Asana uses a long-lived refresh token, which may be absent from a refresh response. Disconnecting deletes Petya's connection record; the permission can also be revoked in Asana.

### Choosing Jira projects by context

In the settings, select the projects available to Petya. There is no need to choose and switch a common working project: Petya determines the project separately for each draft. An explicit key or name in the command takes priority. Next, the discussion title, text, links and mentions of Jira issues are considered. If there are no matches, the configured local model matches the meaning of the discussion against the names and descriptions of the selected projects. The model's suggestion is accepted only for an allowed project, with high stated confidence and a verifiable quote from the context; this is a heuristic, not a guarantee of the correct choice.

When there is ambiguity, Petya shows a question with projects right in the current scenario. If the project has neither a single type nor the standard type Task / Задача (Task), the type is clarified separately. The choice is pinned to the draft; its project is visible before sending. Assignees, boards, sprints and versions are loaded for this project. History, rollback and handoff to an agent use the project of the created issues. Removing a project from the allowed list or changing the site blocks the old choice. Old single-project settings are used only to migrate the list of allowed projects.

Checks: `node tests/jira-routing.cjs`, `node tests/jira-selection.cjs`, `PETYA_SMOKE_TEST=1 electron .` (includes project clarification and pinning it to the draft).

### macOS toggle enabled, but no access
On this Mac the cause was confirmed by the tccd log: `Failed to match existing code
requirement for subject com.petya.desktop and service kTCCServiceScreenCapture`.
The old build's permission was tied to its cdhash, while the current build is signed
with a permanent Developer ID. Restarting does not replace the old signature requirement.
You need to remove only the old Petya entry in «Запись экрана и системного звука» (Screen & System Audio Recording),
add the current Petya.app and grant access again. Other permissions
are not reset. Subsequent builds must keep the same Developer ID.
Capture now limits waiting to 20 seconds, blocks a repeat request
while the previous one is still pending in the OS, and closes the stream if it arrives after the timeout.

Verified 2026-11-03 on macOS 15.6 in the installed signed Petya.app:
after replacing the outdated permission entry, the app shows «2 из 2» (2 of 2),
and the manual check obtains a live audio track and finishes the capture with the status
«Доступ к системному звуку проверен. Прослушивание выключено» (System audio access verified. Listening is off).
Speech recognition from a real meeting was not performed in this check.

### Optional modules

In «Подключениях → Модули Пети» (Connections → Petya's modules), select Slack, Notion, Asana, Jira, Confluence or Claude / Codex. The choice is saved immediately; a card for authorization appears below. Voice, local processing, memory and audio capture are available without external integrations. In a new profile, external modules are off. On update, saved Slack, Notion, Asana and Atlassian connections stay enabled.

Unchecking a box hides the card and status, disables the automatic check and new requests to the service; for Slack it also resets the sync queue. A request already sent may complete. Settings, tokens and previously loaded context are kept. Jira and Confluence are enabled independently and use shared Atlassian authorization. If the documentation modules are disabled, issue preparation uses the selected local context.

Checks: `node tests/modules.cjs`, `npm test`, `PETYA_SMOKE_TEST=1 electron .`.

Confluence is checked separately from Jira: with OAuth, Petya reconciles the site's current permissions via Atlassian accessible-resources. If Confluence was not allowed at sign-in, the card offers to reconnect instead of showing HTTP 404. Having Jira access does not imply Confluence access; the check takes into account separate resource records for the same site. The Confluence button starts a new sign-in if the permission is missing.

Automatic meeting: manual title selection has been removed. Petya recognizes standard Zoom windows, a visible floating call window and (if Accessibility has already been granted) the leave/end meeting buttons. A hidden service window is not considered a call. During a command, the system audio transcription queue waits for processing to finish; the current meeting becomes the default context. Audio files are not saved. Analysis for issue preparation runs on command; there is no separate automatic summary report yet.

### Running from the tray

Petya starts without an open window and stays in the tray (the macOS menu bar). There is no icon in the Dock or the Windows taskbar. The window opens by clicking the icon or via «Открыть Петю» (Open Petya). Closing and minimizing hide the window; background work continues. To quit completely, use «Выйти» (Quit) in the tray menu.

### End of a voice command and automatic work

With the microphone on, say «Петя» ("Petya"), then the command. Petya collects the parts of the phrase and starts processing after roughly 2–3 seconds of silence, having waited for the whole recognition queue. A short pause and the slicing of audio into fragments do not start separate tasks. If the phrase ends with «для» ("for"), «чтобы» ("so that"), «и» ("and") and similar connectives, Petya waits for the continuation. This is end detection by pause and simple speech cues, not flawless understanding of whether a thought is complete. «Отмена» ("Cancel") while the phrase is being collected cancels it.

Voice creation commands immediately create a Jira issue, or an Asana task when Asana is explicitly named, without reviewing a draft. The project is chosen by context. If there is no context, a sufficiently detailed command serves as the issue description. An ambiguous project, discussion, issue type and required questions are clarified in the window and a notification; you can answer by voice, with a name or with the option number. After clarification, execution continues. For a Jira batch, a missing sprint, version and assignees are also clarified. If the required options do not exist in the service itself, the project settings need to be fixed.

Text commands keep manual sending. A request that has already been sent is not cancelled by a voice command. An error with an unknown write result does not trigger an automatic retry. Automatic voice creation in Asana uses the same single-use server-side preview as manual sending. Handoff to the Claude/Codex apps keeps the existing scenario.

Checks: `node tests/voice-turn.cjs`, `node tests/asana.cjs`, `PETYA_SMOKE_TEST=1 electron .` (automatic write to a mock Jira without clicking a button).

### «Петя, делай» ("Petya, do it")

An explicitly named executor takes priority: «Петя, делай через Claude» ("Petya, do it via Claude") or «Петя, делай через Codex» ("Petya, do it via Codex"). For it, limits are not checked and there is no automatic substitution. If the app is unavailable, Petya offers options. Automatic selection by limits applies only when no executor is specified.

The short command creates one Jira issue from the selected context and prepares a handoff to an agent with a link to the issue, the description and the discussion. Jira is not created again when choosing an agent or continuing a deferred handoff. The handoff is saved in the encrypted agent history. If the context is insufficient, Petya shows a notification and offers to describe the task, choose a discussion, add text/a link, refresh Slack or defer.

If no executor is specified and only one app is available, the task is handed to it immediately without checking limits. If both are available, with fresh limit data Claude has priority; if the remaining share of at least one active limit is 20% or less, Codex is chosen. Data older than five minutes or without an active window is considered unknown. In that case a choice of Claude / Codex / defer is shown. If an agent is not installed or the module is off, Petya offers to connect it.

Sending does not require draft confirmation. Codex: the official local App Server (`thread/start` with the working folder, then `turn/start`), with the existing CLI authorization; additional permission requests are not approved automatically. Claude on macOS: a signed Accessibility module reads the Projects list, opens the selected project, checks for an empty new chat, fills in the prompt and clicks Send message. Petya must be granted Универсальный доступ (Accessibility) once; the button is in the AI connection. On Windows, automatic sending to Claude is not available yet — the task is saved with a message about the limitation.

The executor's project is determined separately from the Jira project: by an explicit name in the command, then by context, or by the local model with high confidence and a supporting quote. The Codex catalog includes the working folders of its chats and saved projects; the Claude catalog is read from the app. With several matches or no confident match, Petya offers to choose a project. Having only one project is not in itself a basis for choosing it. The choice is saved for this task.

The «отправлена» ("sent") status is set after Codex responds that the turn has started or after the sent message with a unique marker appears in the new Claude chat. This does not mean the work is finished. A timeout after the handoff has started leaves the status «результат неизвестен» ("result unknown") without re-sending. No real sends are made during automated tests.

For automatic selection based on real Claude Code limits, you can connect the adapter `assets/claude-usage.cjs` as `statusLine.command` (for example, `node /полный/путь/к/assets/claude-usage.cjs`). Do not replace an existing statusLine without preserving its behavior. The adapter receives Claude Code's official JSON and saves only percentages, reset times and the observation time in `claude-usage.json` inside Petya's data directory; neither tokens nor prompts are copied. On this computer the adapter is not connected yet, so the unknown-limit selection applies. Documentation: https://code.claude.com/docs/en/statusline .

Checks: `node tests/do-command.cjs`, UI smoke — creating one issue and choosing Codex without duplication.


### Dialogue, topics and spoken answers

Petya separates explicit creation/handoff commands from questions and ordinary utterances. «Посмотри сколько багов по последней версии» ("Check how many bugs there are in the latest version") reads Jira without creating issues. By default, the latest released version by `releaseDate` and the «Затронутые версии» (Affects versions) field are used; the answer names the project, the version, the counting criterion and a link to the JQL. All pages of results are counted. If the project or release is ambiguous, Petya offers options. «Исправленные в версии» ("Fixed in version") uses `fixVersion`. Follow-ups like «а сколько критичных» ("and how many critical ones") take the selected project and version into account.

«Посмотри ANR в Google Play» ("Check ANR in Google Play") reads Android vitals via the [Play Developer Reporting API](https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/vitals.anrrate). The Google Play module is optional. To connect it, enable the API in Google Cloud, grant the service account permission to view app information in Play Console, and import the JSON key in the Google Play card. The key is stored via the OS secret store and is not returned to the UI. Petya uses only the reporting scope; there is no app publishing. If the key or permissions are missing, it reports the connection status and does not invent statistics.

The ANR report names the last available day from `freshnessInfo`, the America/Los_Angeles time zone, the overall and user-perceived ANR rate, and the 7-day weighted figure. Empty rows and a missing metric are not turned into zero. You can specify the day («за вчера» ("for yesterday") or YYYY-MM-DD) and a numeric `versionCode`. The report does not substitute an event count for the rate.

Topics and the answer history are saved separately in the encrypted `dialogue-memory.json`; the retention period matches the memory setting. Returning: «вернёмся к багам» ("let's go back to the bugs"), «продолжим про ANR» ("let's continue about ANR") or choosing a topic in the dialogue. You can start a new topic; the local model also recognizes topic changes and answers ordinary questions without tools or external changes. Without a configured local model, the deterministic Jira/ANR reports are available, along with a message about connecting a model for free-form dialogue. Clearing memory also deletes the topic history.

A voice question gets a spoken answer from the system speech synthesizer. While speaking, recognition of Petya's own speech is suppressed; after the answer, the microphone accepts a follow-up without repeating «Петя» ("Petya") within a short window. The «Остановить ответ» (Stop answer) button interrupts speech. The answer text and links remain in the dialogue.

### Phrase training in the installed app

In the «Обучение» (Training) section, the user saves their own phrase templates and chooses an action. Variants are entered one per line; case and trailing punctuation are ignored. The variables `{delay}`, `{message}`, `{query}` are available. «Проверить без выполнения» (Check without running) shows the recognition result without creating reminders or calling external services. A skill can be edited, disabled or deleted. No ready-made user phrases are preinstalled.

Current actions: a reminder, a predefined answer, reading Jira bugs and Google Play ANR. This is template training, not a change to the model's weights. Arbitrary instructions for external executors are not connected yet.

Skills and timers are written atomically to the encrypted `learned-skills.json` inside Electron userData, separately from the APP/EXE. Changes take effect immediately, without rebuilding. Clearing the dialogue context does not delete skills and reminders. Timers use absolute time and are checked once a second and after wake-up; overdue ones fire on startup. When the app is fully quit, notifications are impossible until the next launch. The OS must allow notifications. The delivery status is recorded before display so that notifications are not duplicated after a restart; a crash between recording and display may cause a notification to be missed.

### Recognizing and understanding utterances

Capture keeps 350 ms before the start of speech, uses a threshold that accounts for background noise, and applies automatic microphone gain. Saying «Петя» ("Petya") again within an unfinished command does not delete the previous words. The last-utterance field shows the whole assembled command. In the whisper.cpp settings you can enter names and work terms: the vocabulary is passed to the local Whisper as `prompt`; audio is not sent to external services.

For rephrased Jira/Google Play read requests, the configured local model is used. The router requires a JSON Schema and checks the allowed fields and confidence; it cannot choose a write action. The format has been checked against the Ollama documentation: https://docs.ollama.com/capabilities/structured-outputs . Capture tests use synthetic PCM data; they check that fragments are preserved, but do not replace an accuracy assessment on the user's voice.

### Clarifying a misunderstood phrase

When parsing is uncertain/invalid, the local model is unavailable, or it responds `understood=false`, Petya consults Claude/Codex. The user can start a consultation with the button next to the command. This requires the AI module to be enabled and an installed CLI with a completed sign-in. For Claude, Claude Code is used; Claude Desktop alone is not enough. The «Спрашивать Claude/Codex, если Петя не понял» (Ask Claude/Codex if Petya did not understand) setting disables the external consultation.

The disputed phrase (up to 4000 characters) and the last four messages of the current topic only (up to 3000 characters) are sent, without audio. The answer is signed with the assistant's name, shown, and spoken for voice requests. It is not passed back to the task planner. If Whisper returned no text, Petya asks to repeat: the assistant is not asked to guess the missing speech.

An explicitly chosen assistant is not replaced by another one. With one available CLI, it is chosen; with two, the state of Claude's limits is used, and with unknown limits Claude/Codex/defer is offered. The consultation runs from a temporary empty folder; Claude gets an empty set of tools/MCP, Codex gets a read-only sandbox with shell, browser, apps, JS and multi-agent disabled. The user's MCP configuration is not loaded. The timeout is 90 seconds; the request is cancelled when the app quits. Tests use mock CLIs; real availability of the subscription and limits is checked at request time.

### Corrections, personal vocabulary and task results

The phrase «Ты неправильно понял — я имел в виду [правильная фраза целиком]» ("You misunderstood — I meant [the full correct phrase]") adds a clarification to the current conversation and offers to save an exact phrase mapping. A permanent rule is saved with the «Запомнить исправление» (Remember correction) button or by saying «запомни» ("remember"). For an incomplete correction, Petya asks you to spell it out. The rule does not change an issue that has already been created.

«Обучение → Личный словарь и исправления» (Training → Personal vocabulary and corrections) lets you add, change, disable and delete names/abbreviations or whole-phrase corrections. The scope is all projects or a Jira key. The project is determined from an explicit key (taking common abbreviations into account) or the active topic. A project rule takes precedence over a general one. Substitution respects word boundaries and ё/е, and is not applied in cascade. If a substitution turns an ordinary phrase into a new write command, Petya suggests saying the whole command. Names remain text for the service's ordinary recipient resolution; a vocabulary entry does not confirm the recipient's identity. Applied rules are visible in «Как Петя понял фразу» (How Petya understood the phrase). The data is saved in the existing encrypted learned-skills.json without rebuilding.

«Чем закончилась та задача?» ("How did that task end?"), «Статус задачи KEY-123» ("Status of task KEY-123") and the «Проверить результат» (Check result) button in the «Агенты» (Agents) section read the task log. An ambiguous request offers a choice; the current project and the last checked task are taken into account. For Codex, the exact threadId/turnId is requested via thread/read, and execution events save the answer and status. The answer clearly distinguishes a fresh check from the last saved record. For Claude, only the handoff log is available so far: Petya does not claim completion without confirmation and offers to open the chat. Reading the status does not create an issue and does not repeat the handoff. Results are purged together with the task context according to the retention period.

### Notifications, explanations, summary and undo

The AI connection now has the «Сообщать об изменениях поручений» (Notify about task changes) setting. Petya checks active Codex tasks once a minute, no more than five per pass, with no parallel passes. Notifications appear on completion, error, interruption, a needed decision or a new access problem. An unchanged state stays silent; markers are saved between launches. Completed tasks are no longer polled. Events and background polling share a common deduplication mechanism; a late "in progress" response does not override an already confirmed completion. For Claude, background reading of the result is not supported yet.

«Почему выбрал этот проект?» ("Why did you choose this project?") shows the saved reason for choosing the Jira project and the executor's project, as well as the context source or quote when it is known. The rationale is not invented after the fact. Storing the explanation does not create a fake dialogue and does not change the selected context. Quotes are deleted according to the history retention period.

«Что у нас сегодня?» ("What do we have today?") (also a separate button) collects reminders, unfinished tasks, records of Jira issues created today and saved Slack messages from today. Dates and data boundaries are stated. The scenario does not claim to read email, the calendar or the current Jira status, or to cover Slack completely; this summary does not have such sources yet.

«Отмени последнее действие» ("Undo the last action") and the button in «Обучении» (Training) roll back the last supported local change: creating/cancelling a reminder, adding/changing/deleting a skill or a vocabulary rule. A log of the last 30 changes is stored encrypted together with the training data. Before a rollback, the state is compared; an already delivered reminder and changed data are not rolled back. If a task handoff or a Jira change happened after the local action, Petya does not silently skip it to undo an older action: it explains the limitation and offers to open the history. Created external issues are not deleted, and the executor's work is not recalled.

### Local project context

Say «Работаем над проектом Название» ("We're working on project Name"), then in «Настройки → Сервисы → Локальный проект» (Settings → Services → Local project) choose the project and its folder. The binding is stored in the encrypted project memory separately for each company. In this project's dialogue, Petya rereads the files before an ordinary answer and passes a selection to the configured Ollama model. «Обновить контекст» (Refresh context) shows the read time and the list of sources; «Отключить» (Disconnect) removes the binding, not the files.

The root README, AGENTS.md, package.json, pyproject.toml, Cargo.toml and text source files whose names match words in the question are read. Git provides the list of tracked and non-ignored new files. Without Git, only the root files are available. The selection is limited to 8 files, 14,000 characters of text and 100 structure paths. Hidden directories, dependencies, builds, known secret file names, binary files and symbolic links are excluded. This is not a full index and does not guarantee detection of secrets inside an ordinary source file. Commands from the project are not executed. A new topic not bound to the project does not get its folder; there is no automatic handoff of source code to Claude/Codex.
