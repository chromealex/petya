# Почта и простой вход Telegram

В Пете общий раздел «Почта»: Google / Gmail (включая Google Workspace), личные Outlook.com / Hotmail и рабочие / учебные Microsoft 365. Поддерживается до 20 аккаунтов каждого провайдера. Локальный Exchange и национальные облака Microsoft пока не поддерживаются.

Почтовый навык выбирает конкретные ящики или все подключённые аккаунты. Старые идентификаторы и токены Gmail сохраняются; Microsoft использует отдельное зашифрованное хранилище в профиле компании. Новый профиль не получает чужие токены. Результаты разных ящиков подписаны отдельно, ошибка одного не скрывает результаты других. Только чтение, до 20 писем из входящих за запуск, текстовые фрагменты без вложений. Gmail исключает категории promotions/social и List-Unsubscribe, Microsoft — только List-Unsubscribe.

## Что ещё требуется для входа одной кнопкой

Google зарегистрирован: проект Petya Desktop (`metal-bonus-513622-h9`), OAuth-клиент Desktop app, Gmail API включён, единственное заявленное право — `gmail.readonly`. Конфигурация встроена в `src/integration-clients.json`. Приложение остаётся External / Testing; тестовый пользователь — chrome.alex@gmail.com. Другие ящики перед входом нужно добавить в тестовые пользователи Google. Публичная проверка Google не пройдена.

Microsoft отложен по решению пользователя: текущий личный аккаунт не имеет доступа к каталогу Entra для регистрации. Telegram не зарегистрирован: my.telegram.org вернул «Too many attempts. Please try again later». Для этих провайдеров пока доступны дополнительные ручные настройки. Пароли и пользовательские токены в `src/integration-clients.json` не записываются.

- `google`: `{ "client_id": "...apps.googleusercontent.com", "client_secret": "..." }` — OAuth Desktop app, включить Gmail API, настроить consent screen и разрешение gmail.readonly. Client secret настольного клиента не является серверным секретом: он доступен в дистрибутиве. Для публичного выпуска выполнить требования проверки Google; в testing добавить тестовых пользователей.
- `microsoft`: `{ "client_id": "UUID" }` — приложение с личными Microsoft accounts и аккаунтами любых организаций. Платформа Mobile and desktop applications, redirect `http://localhost/callback` (порт выбирается динамически); delegated User.Read и Mail.Read, offline_access. Секрет не нужен. Некоторые организации требуют согласие администратора.
- `telegram`: `{ "apiId": 12345, "apiHash": "32 hex characters" }` — собственное приложение Пети в Telegram API development tools. Не использовать чужие или демонстрационные ключи.

Настройки Google и Microsoft также доступны в раскрывающемся разделе интерфейса для текущей компании. Telegram показывает кнопку подключения, затем телефон, код и при необходимости пароль 2FA / проверку email. При зарегистрированном приложении технические поля не нужны. Личный Telegram остаётся один на компанию; список выбранных чатов не меняется.

OAuth открывается в системном браузере, с PKCE и одноразовым state. Для Microsoft используются common endpoint и только Microsoft Graph. Токены не передаются стороннему брокеру. Реальный вход в почтовый аккаунт и чтение писем после регистрации Google ещё не проверены. Проверка интерфейса с встроенным клиентом Google прошла.

Документация провайдеров:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration
- https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- https://core.telegram.org/api/obtaining_api_id
