# Общие OAuth-приложения Пети

Пользователь подключает сервис кнопкой и разрешает доступ в браузере. Регистрировать собственные приложения или вводить токены ему не нужно. Client secrets и refresh tokens хранятся только на сервере, зашифрованные токены подключений — отдельно для каждого сервиса. Desktop хранит непрозрачный ключ подключения через safeStorage и получает access token для прямых API-запросов.

Сервер: https://auth.petya-app.ru, RUVDS 194.87.110.60. Точка входа: oauth/server/gateway.cjs. Пока DNS/HTTPS не готовы, публичный nginx возвращает 503. Исходники клиента обновлены, установленное приложение ещё не заменено.

## Регистрация

`node scripts/prepare-oauth.cjs https://auth.petya-app.ru <новая папка>` генерирует параметры, без регистрации и без секретов.

| Сервис | Callback | Права |
|---|---|---|
| Atlassian | /oauth/atlassian/callback | Jira и поиск Confluence, перечень ниже |
| Slack | /oauth/slack/callback | channels:read, groups:read, channels:history, groups:history, im:history, mpim:history; только user scopes |
| Notion | /oauth/notion/callback | Read content; без записи и чтения email |

Переменные сервера: PUBLIC_ORIGIN, TOKEN_ENCRYPTION_KEY, ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, ATLASSIAN_SCOPES, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET. Секреты не включать в сборки, репозиторий или журналы.

Slack использует confidential OAuth V2 через HTTPS и обязательную ротацию user tokens. Установка может требовать одобрения администратора workspace. Распространение между workspace и Marketplace настраиваются отдельно после сквозного теста.

Notion использует OAuth с выбором страниц пользователем. Capability Read content. Права на страницы ограничены выбором пользователя. Токены обновляются с сохранением новой пары; при отсутствии expires_in обновление выполняется раз в час при обращении.

Atlassian: Resource-level 3LO; выбор сайта из accessible-resources. Callback и 10 API scopes сохранены в консоли; offline_access дополнительно запрашивается при входе. Секрет перевыпущен владельцем и установлен на сервер. Distribution ещё не включён, реальный вход не проверен.

| Функция | Scope для настройки |
|---|---|
| Jira: задачи, проекты, версии | `read:jira-work` |
| Jira: создание, правка и удаление при откате | `write:jira-work` |
| Jira: профиль и исполнители | `read:jira-user` |
| Jira Software: спринты | `read:sprint:jira-software`, `write:sprint:jira-software` |
| Jira Software: список досок | `read:board-scope:jira-software`, `read:project:jira` |
| Jira Software: возврат в backlog | `write:board-scope:jira-software` |
| Jira Software: снимок issue | `read:issue:jira-software` |
| Confluence: CQL поиск с текстом страниц | `search:confluence` |
| Продление авторизации | `offline_access` |

[Jira 3LO](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/), [Board](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/), [Sprint](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/), [Agile issue](https://developer.atlassian.com/cloud/jira/software/rest/api-group-issue/), [Backlog](https://developer.atlassian.com/cloud/jira/software/rest/api-group-backlog/), [Confluence CQL](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/).

## Локальные сервисы

Zoom получает системный звук через разрешения ОС. Ollama и Whisper работают локально; OAuth и ключи для них не требуются.

## Проверки

Общий набор тестов и UI smoke проходят. Новые тесты: неверный state/cookie, повтор callback, одноразовый claim, зашифрованное хранение, ротация при конкурентных запросах, изоляция провайдеров и подключений, отключение, запрет подмены credentials из renderer. Моки не заменяют сквозной вход у провайдеров.

Официальные инструкции: [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/), [ротация Slack](https://docs.slack.dev/authentication/using-token-rotation/), [Notion OAuth](https://developers.notion.com/docs/authorization).

Идентификаторы приложений: Atlassian 20c1cb45-4b70-42ab-8bb4-aac4e0259dd3; Slack A0CEDB1HFD3; Notion 40dd872b-594c-81b7-8b7a-0037d20d3c37. Notion создан с публичной областью установки, правами Read content, без записи, комментариев и профилей пользователей.


Asana: API app Petya, client ID 1220193688170618. Callback https://auth.petya-app.ru/oauth/asana/callback. Четыре права: workspaces:read projects:read tasks:read tasks:write; Full permissions и Delete выключены. Manage distribution: Any workspace, сохранено. Секрет в ASANA_CLIENT_SECRET на сервере; ASANA_CLIENT_ID установлен. Адаптер oauth/server/asana-provider.cjs, отдельное шифрованное хранилище asana.enc. Запросы refresh сохраняют прежний refresh token, если Asana не вернула новый. Публичная политика дополнена Asana. Регрессионные тесты и UI smoke прошли.

На Mac установлена обновлённая Petya.app с прежней Developer ID подписью; резервная копия Petya-before-asana-20261103.app. Обычная сборка остановилась из-за места на диске; её временный каталог удалён. Обновление подготовлено через APFS clone установленного пакета с заменой src и повторной подписью, codesign --verify --deep --strict успешен.

При проверке Safari исправлены две ошибки общего брокера: no-referrer создавал Origin:null у POST формы (теперь same-origin, без отправки Referer внешним сайтам); CSP form-action self блокировал внешний редирект формы (теперь после проверки выводится явная noreferrer-ссылка на провайдера). Проверки state/cookie/form и чужого Origin не ослаблены. OAuth-тесты прошли после обоих изменений; обновление развёрнуто.

Сквозная проверка Asana завершена: вход из установленной Petya.app через Safari, совпадение кода, подтверждение четырёх согласованных прав, callback, сохранение подключения Azur Games. В разделе Asana успешно загружены первая страница проектов (выбран ASO Tasks) и первая страница задач; кнопки дальнейшей пагинации отображаются. Реальные задачи не создавались и не изменялись. Создание/изменение, конфликт, повтор и смена подключения проверены тестами на mock API; реальное обновление access token по времени пока не проверено.

## Иконки приложений

04.11.2026: в консолях Slack (A0CEDB1HFD3), Notion (40dd872b-594c-81b7-8b7a-0037d20d3c37), Atlassian для Jira/Confluence (20c1cb45-4b70-42ab-8bb4-aac4e0259dd3) и Asana (1220193688170618) установлена иконка `assets/app-icon.png`. Сохранение и отображение проверены в интерфейсах сервисов; Atlassian дополнительно проверен после перезагрузки страницы.
