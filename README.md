# Петя

Голосовой помощник для macOS и Windows (Electron, версия 0.8.3). Живёт в трее, отзывается на «Петя» и работает с контекстом: встречей в Zoom, Slack, Jira, Confluence, Notion, почтой, Telegram и локальными проектами. Распознавание речи и языковая модель работают локально (whisper.cpp / Qwen ASR, Ollama).

Что умеет — кратко:

- **Диалог голосом и текстом** с темами, памятью разговора и ответами голосом.
- **Работа с задачами:** создание и поиск задач Jira, статус проекта, нагрузка команды, дубликаты.
- **Контекст:** встреча (системный звук), каналы Slack, документы Notion/Confluence, почта Gmail/Outlook, Telegram.
- **Поручения:** подготовка сообщений и задач с подтверждением, управление приложениями на компьютере, поиск в интернете, разбор логов и вложений.

Подробная история возможностей по версиям — в [docs/HISTORY.md](docs/HISTORY.md).

## Запуск

Нужен Node.js 22.12+.

```sh
npm ci
npm start
```

Сервисы настраиваются в приложении, в разделе «Подключения». Для ответов нужна локальная модель Ollama (по умолчанию `qwen3:4b`, рекомендуется `qwen3.5:9b`), для голоса — whisper.cpp (см. [историю, раздел «Распознавание речи»](docs/HISTORY.md#распознавание-речи)).

## Тесты

```sh
npm test                               # модульные и сценарные тесты, без сети (запускаются и в CI)
node tests/long-dialogue-live.cjs      # живые длинные диалоги на локальной Ollama
PETYA_TEST_MODEL=qwen3.5:9b node tests/long-dialogue-live.cjs
npm run test:dialogues:live            # другие живые проверки — см. scripts в package.json
```

GitHub Actions запускает `npm test` на каждый push.

## Сборка

Только через `python3 scripts/build.py` (`--mac`, `--win` или обе платформы без флага). Результат — единственные актуальные билды `Petya.app` и `Petya-Setup.exe` в корне проекта; правила сборки и подписи — в [AGENTS.md](AGENTS.md).

## Устройство

| Где | Что |
|---|---|
| `src/main.cjs` | главный процесс Electron: окна, IPC, маршрутизация реплик |
| `src/dialogue*.cjs`, `src/answer-*.cjs` | диалог, запрос к модели, разбор и защита ответов |
| `src/*-routing.cjs`, `src/work-*.cjs` | распознавание намерений и рабочие сценарии (Jira, команда) |
| `src/slack*.cjs`, `src/gmail*.cjs`, `src/telegram.cjs`, … | интеграции |
| `src/ui/` | интерфейс (renderer, без доступа к Node.js) |
| `oauth/` | OAuth-шлюз и регистрация приложений ([REGISTRATION.md](oauth/REGISTRATION.md)) |
| `native/` | нативные помощники macOS (Swift) |
| `docs/` | описания модулей и отчёты проверок |
| `tests/` | тесты; `*-live.cjs` и `*-smoke.cjs` требуют Ollama или Electron |

## Данные и безопасность

Токены хранятся через Electron safeStorage (Keychain / DPAPI). История диалогов хранится в папке данных приложения (`app.getPath('userData')`). Модель и распознавание принимают только локальные адреса. Секреты OAuth (`src/integration-clients.json`, `oauth/local/`, `.signing/`) в git не попадают.

## Для агентов

Правила работы в проекте — в [AGENTS.md](AGENTS.md): сборка, иконки интеграций, контекст Slack, качество ответов и совместная работа.
