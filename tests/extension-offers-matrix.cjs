// Offers do not confuse extensions: with nothing added, each app's typical requests offer exactly that app,
// and neighbours' subjects or ordinary talk offer nothing wrong. All real offer.cjs files take part at once.
const assert=require('node:assert/strict');
const offers=require('../src/features/extension-offers.cjs');
const all=offers.load();
const ids=new Set(all.map(o=>o.id));
const settings={};
function offered(text){const d=offers.decide(offers.candidates(text,{offers:all,settings}));return d?d.one?[d.one.offer.id]:d.tie.map(r=>r.offer.id):[];}
// app → requests that must offer exactly it
const own={
 sql:['покажи схему таблицы events','SQL-запрос: сколько игроков дошли до 10 уровня за неделю','топ стран по числу матчей в ClickHouse','сколько платящих в BigQuery за вчера','какие таблицы в базе данных'],
 'search-all':['найди везде про матчмейкинг','где обсуждали оплату в Китае','поиск по всему: лиги','поищи везде насчёт релиза 2.3'],
 'regex-cron':['объясни регулярку /^a+$/','составь крон на каждый будний день в 9','что значит cron */15 * * * *'],
 crashes:['какие крэши за неделю','топ крэшей','новые крэши после релиза 1.4.2','сколько падений вчера'],
 // Crash sources: each by its own name; accepting one also adds «Крэши».
 sentry:['что в Sentry за сутки','покажи Sentry','топ крэшей в сентри'],
 crashlytics:['что в Crashlytics за неделю','покажи крашлитикс','крэши в Firebase','топ крэшей в файрбейс'],
 'google-play':['крэши в Google Play','крэши в гугл плей за неделю','покажи падения в Google Play'],
 'store-reviews':['что пишут в отзывах','отзывы в App Store за неделю','жалобы игроков в Google Play','плохие отзывы после обновления'],
 calendar:['что у меня сегодня в календаре','найди час с Машей и Олегом на этой неделе','когда я свободен в пятницу','поставь встречу с Олегом в четверг в 15:00'],
 'ci-builds':['статус CI','последние сборки в GitHub Actions','что с билдом на андроид в CI'],
 'pull-requests':['какие PR ждут моего ревью','мои пулл-реквесты','что в PR 123'],
 'disk-usage':['чем забит диск','сколько места свободно на диске','что можно почистить на диске'],
 dependencies:['какие пакеты устарели','есть ли уязвимости в зависимостях','npm audit'],
 'build-size':['почему билд вырос','сравни размер этих двух apk','из чего состоит ipa'],
 localization:['что не переведено в локализации','проверь локализацию','недостающие ключи на немецкий'],
 zoom:['запиши встречу в Zoom','покажи мои встречи в зуме','что было на созвоне в Zoom'],
 'google-meet':['созвон в Meet','запиши созвон в мите','поставь созвон в гугл мит с Олегом','запиши встречу в Google Meet','подключись к созвону через Meet'],
 teams:['встреча в Teams','запиши встречу в тимсе','поставь встречу в тимс на завтра','что было на звонке в Microsoft Teams'],
 discord:['что нового в дискорде','баги из дискорда за неделю','покажи частые вопросы игроков','отправь в Discord: сервер перезапустится в 18:00'],
 mattermost:['что нового в Mattermost','что обсуждали в канале dev в маттермосте за неделю','перескажи тред про релиз в Mattermost','найди в Mattermost сообщения про оплату','отправь в маттермост: билд готов'],
 'vk-teams':['что нового в VK Teams','что писали в вк тимс за неделю','перескажи тред про оплату в VK Teams','найди в VK Teams про сборку','отправь в VK Teams: билд готов'],
 support:['что жалуются в поддержку','тикеты про оплату за неделю','ответь на тикет 1234','покажи тикеты в Zendesk'],
 'sprint-planning':['спланируй спринт','что влезет в следующий спринт','какая у нас скорость','кто перегружен в спринте','velocity команды'],
 standup:['собери стендап','что вчера делала команда','у кого блокеры','настрой стендап на 10:30'],
 adr:['запиши решение: переходим на Addressables','оформи ADR про переход на Addressables','какие решения принимали про сеть','противоречит ли это решению про сеть','какие архитектурные решения у нас есть'],
 'doc-freshness':['проверь свежесть документации','какая документация устарела','найди устаревшую документацию','что в README устарело'],
 retro:['подготовь ретро','что пошло не так в спринте','ретроспектива спринта','подведи итоги спринта','проведём ретро'],
 'ad-revenue':['сколько заработали на рекламе вчера','eCPM по сетям','какой формат приносит больше','упала выручка с rewarded','выручка с рекламы за неделю'],
 competitors:['что нового у конкурентов','добавь в конкуренты Clash of Clans','у кого вырос рейтинг','какие механики добавили в обновлениях'],
 'who-knows':['кто разбирается в сетевом коде','к кому идти по магазину','кто писал PlayerController','кто последний трогал инвентарь','кого спросить про матчмейкинг'],
 glossary:['собери глоссарий проекта','проверь термины в локализации','добавь в глоссарий сундук','что у нас значит мана','покажи глоссарий'],
 metrics:['DAU за неделю','ретеншн D1 D7 D30','сколько новых игроков вчера','как выручка после ивента','DAU из AppMetrica'],
 appmetrica:['подключи AppMetrica'],
 grafana:['что на дашборде лиг','какие дашборды есть','покажи графану','что в Grafana по матчмейкингу','https://dashboards.wombyte.net/d/c9e4b7f6-9caf-428d-a93f-578ec4be556f/leagues?viewPanel=2'],
 'ab-test':['значим ли тест','посчитай A/B','сколько нужно игроков для теста','есть ли SRM'],
 focus:['фокус на 50 минут над картой уровня','помодоро 4 раза','сколько я сегодня сфокусировался','помоги сосредоточиться'],
 naming:['придумай название для ивента на Хэллоуин','имена для героев-гномов','как назвать фичу с сундуками','название игры про бункер'],
 'meeting-prep':['подготовь меня к встрече','что обсуждали с Олегом в прошлый раз','о чём следующая встреча','повестка на синк'],
 'meeting-hints':['подсказывай на встречах','включи подсказки на встрече','подсказки во время созвона','хочу подсказки на созвонах'],
 'patch-notes':['напиши патчноут к версии 1.5','что нового для стора','чейнджлог между v1.4 и v1.5','анонс обновления для игроков'],
 docker:['что запущено в докере','логи контейнера api','почему падает контейнер postgres','перезапусти redis','сколько места занимает докер'],
 'http-client':['дерни GET https://api.example.com/v1/users/42','отправь POST на /login с телом {"email":"a@b.c"}','проверь, отвечает ли staging','какой статус у health-check прода','импортируй curl https://api.example.com/v1/ping'],
 'screenshot-task':['сделай баг из скриншота','скрин в задачу','заведи баг по этому экрану'],
 converter:['сожми видео до 10 МБ','конвертни png в webp','сделай гифку из видео','переведи docx в pdf','уменьши картинки в папке до 1024'],
 reminders:['какие у меня напоминания','поставь напоминание на завтра','покажи мои напоминания'],
 journal:['что я сегодня сделал','итоги недели','план на завтра','запиши в дневник: идея с картой'],
 'code-review':['сделай код-ревью','проверь мои изменения','ревью ветки перед пулл-реквестом','посмотри мой дифф','отревьюй мой код'],
 profiler:['разбери профайлер','что жрёт кадр','сравни профайл до и после','почему фризы','разбери gfxinfo'],
 playtest:['разбери плейтест','где игрок застрял','моменты фрустрации в этом видео'],
 mentor:['что мне автоматизировать?','что я делаю руками','где я теряю время','покажи, что мне стоит автоматизировать'],
 'release-checklist':['готов ли релиз 1.5','чек-лист релиза','что мешает выпустить версию 2.0','можно ли выпускать 1.5','релизный чек-лист'],
 anomalies:['что необычного вчера','есть аномалии за неделю?','покажи аномалии','что необычного в метриках','какие аномалии вчера'],
 mentor:['что мне автоматизировать?','что я делаю руками','где я теряю время','покажи, что мне стоит автоматизировать'],
 'google-drive':['найди в гугл диске план релиза','последние файлы в Google Drive','открой Google Docs','найди презентацию про Китай в гугл диске','прочитай https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit','сохрани это в Google Docs'],
 'google-sheets':['что в гугл таблице баланса','открой Google Sheets','найди лучника в гугл таблице','покажи https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0'],
 'config-balance':['сверь баланс с конфигами','что поменялось в балансе с прошлой версии','проверь конфиги юнитов','почему урон лучника в игре не как в таблице'],
 'tone-check':['как это звучит: КТО СЛОМАЛ БИЛД?!','смягчи сообщение: опять забыли обновить доку','проверь тон ответа игроку','не слишком резко: ревью нужно до пятницы, без вариантов','перепиши помягче: опять забыли обновить доку'],
 // «документы про монетизацию» is offered as file search too (names), but an added «Метрики игры» also claims «монетизац»;
 // the chat tries «Поиск файлов» first (directory order) — see docs/apps/file-search.md.
 'file-search':['где презентация про Китай с графиком LTV?','найди скрипт, который сохраняет прогресс','документы про монетизацию','в каком файле считается урон?','поищи заметки про онбординг'],
 logs:['покажи логи сервера за последний час','ошибки оплаты в логах за час','логи сервиса payments за последний час','что в Loki за сутки','найди ошибки в Кибане','логи пода api за 15 минут'],
 kubernetes:['что с подами в кубере','покажи поды в k8s','почему падает под в kubernetes','какие поды в CrashLoopBackOff','статус деплоймента в кубере'],
 'ua-campaigns':['сколько потратили на закупку трафика за неделю','какой CPI по сетям','покажи расходы на рекламные кампании вчера','какой ROAS за неделю','сколько стоит установка по сетям'],
 monitoring:['что с серверами','всё ли живое','какие алерты горят','аптайм за неделю','почему лежит api','инциденты за неделю','что в Prometheus','найди все адреса серваков в проекте','какие сервера использует игра'],
 subscriptions:['за что я плачу каждый месяц','что продлится на этой неделе','сколько уходит на сервисы','какие у меня подписки','когда истекает домен'],
 'time-tracking':['на что ушёл день','сколько я сидел в Unity на этой неделе','время по задачам','куда ушло время на этой неделе','запиши время в Jira'],
 absences:['кто в отпуске на этой неделе','кто у нас на больничном','отпуска команды','график отпусков','когда Маша вернётся из отпуска'],
 'one-on-one':['подготовь 1:1 с Олегом','запиши итоги 1:1 с Машей','что обсудить на встрече один на один','что я обещал на 1:1','повестка на one-on-one с Ваней'],
};
// phrases that must not offer a given app (neighbours' subjects and ordinary talk)
const not={
 sql:['напиши SQL-миграцию для таблицы players','что такое JOIN','база знаний по проекту','найди в базе знаний про лиги','создай таблицу users в базе','сколько новых игроков вчера','DAU за неделю','найди в таблице выручку'],
 'search-all':['найди файл config.json','найди в интернете про лиги','найди в таблице выручку за октябрь','найди человека, который знает Unity','кто знает про матчмейкинг','найди в Confluence про лиги','что обсуждали на встрече'],
 crashes:['ANR за неделю','упала сборка','сервер упал','падение продаж за неделю'],
 // ANR stays the Google Play ANR card (a core reader, no offer); Firebase products other than Crashlytics are not it.
 sentry:['ANR за неделю','какие крэши за неделю','упала сборка'],
 crashlytics:['Firebase Analytics за неделю','настрой Firebase Remote Config','Firebase Auth не пускает','ANR в Crashlytics','упала сборка в Firebase App Distribution'],
 'google-play':['ANR в Google Play','ANR за неделю','отзывы в Google Play','жалобы игроков в Google Play','зависания в гугл плей','упала сборка'],
 'store-reviews':['сделай код-ревью','ревью PR #42','перфоманс-ревью','отзыв о кандидате','фидбэк по встрече'],
 calendar:['сводка встречи','что решили на встрече','срок задачи','календарь отпусков','дни рождения'],
 'pull-requests':['отзывы в App Store','задачи на ревью в Jira'],
 'ci-builds':['готов ли релиз 1.5','почини билд','размер сборки','сколько весит билд'],
 'disk-usage':['место встречи','свободное место в спринте','диск в Google Drive'],
 dependencies:['зависимости между задачами','эмоциональная зависимость','от чего зависит дедлайн'],
 'build-size':['размер команды','размер экрана','сборка упала'],
 localization:['переведи эту фразу','перевод денег','перевести задачу в другой статус'],
 'regex-cron':['регулярно созваниваемся','регулярные встречи по понедельникам'],
 // «Напомни …» is never an offer (Petya's own recurring commands and dialogue answer it); a reminder to a colleague,
 // birthdays and meetings are neighbours.
 reminders:['напомни в 16:00 позвонить','напомни Ивану про отчёт','дни рождения','поставь встречу в 16:00','проверяй почту каждые 5 минут','напомни, что мы обсуждали'],
 // A game devlog, log files and changelogs are not the personal journal; nor are meeting or sprint results.
 journal:['дневник разработки','журнал логов','журнал изменений','итоги встречи','итоги спринта','план релиза','что я сделал не так'],
 // Zoom by name only: zooming a picture or the screen is not the meeting app, and meetings in general are Petya's.
 zoom:['зум фото','увеличь картинку','сделай zoom in на графике','приблизь изображение','зум камеры','запиши встречу','слушай встречу','сводка встречи','созвон в Meet','встреча в тимсе'],
 // Meet and Teams by name only: «meeting», «митинг», «митап», meetings in general, the calendar and Zoom are not them.
 'google-meet':['митинг протеста','митап по Unity','сводка встречи','Zoom','запиши встречу в Zoom','поставь встречу с Олегом завтра','what is the meeting about','meetup в пятницу','что у меня сегодня в календаре','встреча в Teams','тимлид на встрече'],
 teams:['митинг протеста','митап по Unity','сводка встречи','Zoom','запиши встречу в Zoom','поставь встречу с Олегом завтра','созвон в Meet','тимлид сказал','тимбилдинг в пятницу','команда в Slack','teams в слаке','что нового в VK Teams','перескажи тред в вк тимс'],
 // Discord by name: the user's own client, coding with discord.js, other messengers and support tickets are not it.
 discord:['дискорд не работает','как подключить discord.js','напиши бота для дискорда','что нового в слаке','что пишут в телеграме','тикеты про оплату','что жалуются в поддержку'],
 // Mattermost by name: Slack, Telegram, Discord and VK Teams requests, building plugins and running the server are not it.
 mattermost:['что нового в слаке','что пишут в телеграме','что нового в дискорде','что нового в VK Teams','отправь в Slack: билд готов','напиши плагин для mattermost','mattermost не работает','установи mattermost','webhook в mattermost','что обсуждали в канале dev','найди везде про оплату'],
 // VK Teams by name: ВКонтакте posts and ads (marketing), Microsoft Teams, other messengers and building bots are not it.
 'vk-teams':['опубликуй пост во вконтакте','что пишут в группе вконтакте про акцию','реклама вконтакте за неделю','таргет в вк','встреча в тимс','что было на звонке в Microsoft Teams','что нового в слаке','что пишут в телеграме','что нового в Mattermost','отправь в Discord: сервер перезапустится','напиши бота для vk teams','vk teams не работает'],
 // Player tickets: vendors' support, Petya's help, cheering up, store reviews and tracker tickets are not it.
 support:['поддержка Unity','техподдержка Пети','отзывы в сторах','поддержи меня','создай тикет в Jira','частые вопросы игроков в дискорде','поддерживает ли Unity webp'],
 // Sprint planning: running sprints, weekend plans, a task's work plan and team workload right now are not it.
 'sprint-planning':['спринт в беге','планы на выходные','план работ по задаче','загрузка команды','кто перегружен','какая скорость интернета'],
 // Standup: comedy, getting up, meeting summaries and the meeting in the calendar are not it.
 standup:['стенд-ап комедия','встань','сводка встречи','во сколько стендап','сходим на стендап шоу'],
 // Architecture decisions: equations, a meeting's decisions, deciding for the user and ADR in finance are not it.
 adr:['реши уравнение','запиши решение уравнения','какие решения приняли на встрече','что решили на встрече','прими решение за меня','курс ADR Яндекса','помоги решить задачу по математике'],
 // Documentation freshness: outdated packages, deprecated APIs, writing or finding docs and news are not it.
 'doc-freshness':['какие пакеты устарели','устаревшие зависимости','найди устаревшие API в коде','обнови документацию','найди документацию по Unity','свежие новости','напиши документацию'],
 // Retro: retro styles, «ретроград», planning the next sprint, a failed build and a meeting summary are not it.
 retro:['ретро музыка','ретро-стиль в пиксель-арте','ретроград Меркурий','включи ретро игры','спланируй спринт','почему упала сборка','что пошло не так с билдом','сводка встречи','что такое ретроспектива'],
 teams:['митинг протеста','митап по Unity','сводка встречи','Zoom','запиши встречу в Zoom','поставь встречу с Олегом завтра','созвон в Meet','тимлид сказал','тимбилдинг в пятницу','команда в Slack','teams в слаке','что нового в VK Teams','перескажи тред в вк тимс'],
 // Ad revenue is earnings from ads shown in our games: buying users, turning ads off and purchases are not it.
 'ad-revenue':['что необычного вчера','есть аномалии за неделю?','реклама игры','маркетинговые кампании','запусти рекламу в TikTok','сколько потратили на рекламу','отключи рекламу','покупки в приложении','выручка от покупок в приложении','падение продаж за неделю'],
 // Competitor games: a contest, a chess opponent, devices and our own store rating are not it.
 competitors:['конкурс','конкурс рисунков','конкурент в шахматах','сравни iPad и iPhone','отзывы в App Store за неделю','конкурентные преимущества'],
 // A person search only: factual «кто знает» questions, «кто ты», roles and the team directory are not it.
 'who-knows':['кто знает, когда релиз','кто ты','знаешь ли ты, что такое мана','заполни команду из Jira','кто тестировщик в команде','кто написал Войну и мир','кто знает где ключи'],
 // The project's own words only: general definitions, other products' glossaries and localization files as such are not it.
 glossary:['что такое REST','глоссарий Unity','проверь локализацию','что не переведено в локализации','купи билет в терминале','термины договора аренды'],
 // Team metrics and velocity are Jira's, crashes / reviews / ANR other apps', server metrics nobody's here.
 metrics:['что необычного вчера','есть аномалии за неделю?','метрики команды','велосити команды','крэши за неделю','отзывы за неделю','ANR за неделю','метрики сервера','подключи AppMetrica','что на дашборде лиг','DAU в графане'],
 // Grafana by name, a dashboard link or dashboards as the subject: not game metrics words (those stay «Метрики игры»'s
 // until panels are mapped), not Grafana being down, not «нарисуй график» (charts) and not PromQL without Grafana.
 grafana:['DAU за неделю','ретеншн D1 D7 D30','метрики игры за месяц','графана не открывается','не могу войти в графану','нарисуй график продаж','rate(http_requests_total[5m]) в prometheus','покажи лиги за неделю'],
 appmetrica:['DAU за неделю','ретеншн D1 D7 D30','крэши в AppMetrica'],
 'ab-test':['тест упал','напиши тесты','проверь тест на регулярку','упали тесты в CI','запусти тесты'],
 // Camera or input focus and a team planning «to focus on bugs» are not focus sessions.
 focus:['фокус камеры в Unity','давай сфокусируемся на багах','фокус на задаче','фокус-группа в пятницу','перерыв в работе сервера'],
 // Code names are the coder's, renaming a task is Jira's, «назови сумму» is arithmetic.
 naming:['как назвать переменную','переименуй задачу','назови сумму','как называется игра про бункер','придумай название ветки'],
 // Hints during a meeting: its summary, recording, preparing for it, a new event and «подскажи …» questions are not them.
 'meeting-hints':['сводка встречи','запиши встречу','слушай встречу','подготовь меня к встрече','подскажи, как поставить встречу','включи подсказки в коде','что решили на встрече','напомни о встрече','поставь встречу с Олегом в четверг в 15:00','подсказка к задаче в Jira'],
 // Preparing for a meeting is not its summary, the day's agenda, a new event or recording.
 'meeting-prep':['сводка встречи','что у меня сегодня','поставь встречу с Олегом в четверг в 15:00','запиши встречу','что решили на встрече','запомни повестку следующей встречи: релиз'],
 // Release notes from sources; changes written in the message go to the skills, meeting notes and Slack news elsewhere.
 'patch-notes':['готов ли релиз 1.5','чек-лист релиза','заметки встречи','что нового в Slack','напиши патчноут для игроков: исправили зависание магазина, добавили ивент','переведи эту фразу','сводка встречи'],
 'http-client':['API Jira','как работает REST','запрос в поддержку','отправь запрос в поддержку','отвечает ли Маша на письма','статус задачи в Jira'],
 docker:['docker-образ для Python','место на диске','контейнер в Unity UI','перезапусти компьютер','контейнер с грузом пришёл'],
 zoom:['зум фото','увеличь картинку','сделай zoom in на графике','приблизь изображение','зум камеры','запиши встречу','слушай встречу','сводка встречи'],
 // A plain screenshot is Petya's computer control; store screenshots and bugs in code belong to others.
 'screenshot-task':['сделай скриншот','скриншоты стора','баг в коде','заведи баг в Jira'],
 // Subscribing to channels, signing, extending a sprint, prices and followers are not paid subscriptions.
 subscriptions:['подпишись на канал релизов','подпиши договор','отпишись от рассылки','продли спринт','сколько стоит Unity Pro','сколько у меня подписчиков','забронируй переговорку'],
 // The clock, focus sessions, the journal of what was done, build and meeting durations, money are not time tracking.
 'time-tracking':['который час','сколько времени','сколько я сегодня сфокусировался','что я сегодня сделал','сколько времени займёт сборка','время встречи с Олегом','учёт расходов за месяц','сколько я был в отпуске'],
 // Currency, text translation and shortening an answer are not files.
 converter:['конвертер валют','переведи текст','сожми ответ','переведи задачу в другой статус','переведи 100 долларов в рубли'],
 // Code review of my changes: the concept, store reviews, people's reviews, PR lists, Jira tasks on review and showing a diff are not it.
 'code-review':['что такое код-ревью','перфоманс-ревью','отзывы в App Store','какие PR ждут моего ревью','задачи на ревью в Jira','покажи diff','ревью сотрудника','годовое ревью','что в PR 123'],
 // A user's or Slack profile and browser devtools are not a game capture.
 profiler:['профиль пользователя','профайлер памяти браузера','профиль в Slack','открой мой профиль','разбери плейтест','тест упал'],
 // Meeting videos are the meetings app's, GIFs the converter's, failing tests CI's.
 playtest:['разбери видео созвона','сделай гифку','тест упал','разбери профайлер','почему фризы'],
 // The user's own habits: a mentor for a subject or a junior, the day's plan, the recurring list and automating a build are not it.
 mentor:['наставник по Unity','ментор для джуна','найди наставника','что мне делать сегодня','какие у меня повторы','что можно автоматизировать в сборке Unity','автоматизируй деплой','что у меня сегодня в календаре'],
 // Readiness of a release as a whole: its notes, crashes or reviews after it, its date and other checklists are not it.
 'release-checklist':['напиши патчноут к версии 1.5','новые крэши после релиза 1.4.2','плохие отзывы после обновления','когда релиз?','чек-лист переезда','статус CI','готов ли отчёт'],
 // Unusual days in the data: weather, gifts, ad revenue drops (the ad app's view) and plain metrics are not it.
 anomalies:['аномальная жара','необычный подарок','придумай необычное имя','упала выручка с рекламы','аномалии eCPM','DAU за неделю','какие крэши за неделю','странный сон'],
 // Google Drive by name or a Docs/Slides/Drive link only: spreadsheets, the computer's disk, local files, «search everything» and other Google products are not it.
 'google-drive':['что в гугл таблице баланса','покажи https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0','чем забит диск','сколько места на диске','найди скрипт сохранения','документы про монетизацию','найди везде про релиз','что у меня сегодня в календаре','сохрани файл на диск','крэши в Google Play','найди документ про онбординг'],
 // Google Sheets by name or link only: tables in answers, Excel/CSV files, reconciling with configs and localization are not it.
 'google-sheets':['таблица умножения','сделай таблицу сравнения тарифов','открой csv с продажами','сверь баланс в гугл таблице с конфигами','что не переведено в локализации','что в таблице'],
 // Game balance against configs only: CI/server configs, Petya's settings and money balance are not it.
 'config-balance':['конфиг CI','настройки Пети','баланс на карте','конфиг nginx','какой у меня баланс на карте','проверь конфиг nginx','баланс работы и жизни','сверь бюджет с планом'],
 // Petya's own voice, spelling, «тонкий клиент», the mood of reviews or of the community and sending itself are not it.
 'tone-check':['тон голоса Пети','поменяй тон голоса','проверь орфографию в письме','тонкий клиент','какая тональность отзывов','настроение игроков в дискорде','смягчи свет в сцене','отправь в Discord: сервер перезапустится в 18:00','попроси команду проверить билд','как звучит мой голос'],
 // Own files only: the web, «search everything», trackers, wikis, chats, disk space and writing code are others'.
 'file-search':['найди в интернете отзывы о Unity 6','поиск по всему про релиз','найди задачу в Jira про сохранения','найди страницу в Confluence про релиз','какие файлы занимают больше всего места','чем забит диск','сожми видео до 10 МБ','напиши скрипт сохранения прогресса','найди время для встречи','найди коммит про сохранения'],
 // Server logs: Docker containers, CI builds, Unity, git, chats, sign-in and monitoring (alerts, server health) are not it.
 logs:['логи контейнера api','логи сборки в CI','что с серверами','какие алерты горят','лог чата','логин не работает','логистика заказов','git log за неделю','Editor.log в Unity','сервер упал','метрики сервера'],
 // Kubernetes: Docker, pod logs (the logs app), monitoring, dialogue lines, store releases and «под Windows» are not it.
 kubernetes:['что в докере','перезапусти контейнер redis','логи пода api','что с серверами','какие алерты горят','реплики персонажа в диалоге','собери под Windows','выкатка в Google Play','подпиши договор'],
 // Buying users: ad revenue in our games, starting or stopping ads, marketing in general and purchases are not it.
 'ua-campaigns':['сколько заработали на рекламе вчера','eCPM по сетям','выручка с рекламы за неделю','запусти рекламу в TikTok','отключи рекламу','маркетинговые кампании','покупки в приложении','расходы на обед','что в Unity'],
 // Server health only: competitors / mentions monitoring, the screen, this computer's uptime, a calendar alert, logs,
 // Kubernetes objects, Docker containers, office or computer addresses and API requests belong to others.
 // The user's own leave and HR questions, travel, the calendar's meetings and sprint capacity are not the team's absences.
 absences:['отпуск в Турции','куда поехать в отпуск','сколько дней отпуска осталось','как оформить отпуск','я в отпуске','хочу в отпуск на море','что у меня сегодня в календаре','спланируй спринт','ёмкость спринта с учётом отпусков','кто перегружен'],
 // Games and sports, scores, scale, promises about tasks and other meetings' prep or summaries are not 1:1s.
 'one-on-one':['1 на 1 в игре','бой один на один','счёт 1:1','масштаб 1:1','мои обещания','мои обещания по задачам','подготовь встречу с заказчиком','сводка встречи','что решили на встрече','подготовь вопросы к собеседованию'],
 monitoring:['мониторинг конкурентов','мониторинг упоминаний бренда','второй монитор не работает','настрой яркость монитора','аптайм компьютера','поставь алерт в календаре','логи сервиса api за последний час','что с подами в kubernetes','почему падает контейнер postgres','что запущено в докере','адрес офиса','IP моего компьютера','проверь, отвечает ли staging','какие эндпоинты в openapi проекта','что нового у конкурентов','метрики команды']
};
const problems=[];
for(const [id,phrases] of Object.entries(own)){
 if(!ids.has(id))continue;
 for(const p of phrases){const got=offered(p);if(got.length!==1||got[0]!==id)problems.push('«'+p+'» → '+(got.join(', ')||'ничего')+', ожидалось '+id);}
}
for(const [id,phrases] of Object.entries(not)){
 if(!ids.has(id))continue;
 for(const p of phrases)if(offered(p).includes(id))problems.push('«'+p+'» не должно предлагать '+id);
}
// Ordinary talk offers nothing at all.
for(const p of ['привет','как дела?','спасибо, отлично','посчитай 2+2','что такое крэш-репорт?','расскажи анекдот'])if(offered(p).length)problems.push('«'+p+'» → '+offered(p).join(', '));
assert.deepEqual(problems,[],'\n'+problems.join('\n'));
console.log('Extension offers matrix: '+all.length+' offers, own requests offer exactly their app, neighbours and small talk offer nothing wrong passed');

// Installed but not connected: each app's request is claimed by that app only (it answers with the question
// where to connect); no other app's chat turn takes it. Service apps only — local apps would scan the disk.
(async()=>{
 const apps=['crashes','store-reviews','calendar','ci-builds','pull-requests','regex-cron','discord','support','sprint-planning','standup','ad-revenue','competitors','metrics','ab-test','meeting-prep','patch-notes','grafana','reminders','journal','code-review','mentor','profiler','playtest','release-checklist','anomalies','sql','search-all','google-drive','google-sheets','config-balance','meeting-hints','tone-check','file-search','logs','ua-campaigns','monitoring','absences','one-on-one','mattermost','vk-teams','retro','adr','doc-freshness'].filter(id=>ids.has(id));
 const features=Object.fromEntries(apps.map(id=>[id,require('../src/extensions/'+id+'/feature.cjs')]));
 const wrong=[];
 for(const id of apps)for(const phrase of own[id]){
  const claimed=[];
  // As in src/features/extension-ui.cjs: an app whose `claims(command)` holds is asked first and alone.
  const first=Object.entries(features).filter(([,f])=>typeof f.claims==='function'&&f.claims(phrase));
  for(const [other,f] of first.length?first:Object.entries(features)){
   const topic={id:'t',title:'Чат',messages:[]};
   const s={settings:Object.fromEntries(apps.map(a=>['extension_'+a,'true'])),requestProgress:{report(){}},modules:{enabled:()=>true},
    dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}},
    attachments:{list:()=>[]},clarifications:null,
    async request(){throw Object.assign(Error('нет сети в тесте'),{code:'ENOTFOUND'});}};
   let reply=null;try{reply=await f.turn(s,phrase);}catch(e){reply={error:e.message};}
   if(reply)claimed.push(other);
  }
  if(claimed.length!==1||claimed[0]!==id)wrong.push('«'+phrase+'» → '+(claimed.join(', ')||'никто')+', ожидалось '+id);
 }
 assert.deepEqual(wrong,[],'\n'+wrong.join('\n'));
 console.log('Installed apps: each request claimed by its own app only ('+apps.length+' apps) passed');
})().catch(e=>{console.error(e);process.exit(1);});
