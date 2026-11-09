# Почта (`src/extensions/mail`)

The mail app: letters as chat cards (important first, a reply draft opened in the mail service, a letter to a task)
and the **mail rules** — how Petya checks mail on request. It is the `gmail` service module of the catalog
(`"setting": "module_gmail"`, `"service": "gmail"`): adding «Почта» shows its connection card in «Настройки» (Google /
Microsoft accounts, read-only) and the rules tab on «Навыки».

## The mail connection

The app owns the mail service (moved from Petya's core in this lane; the settings keys and stored accounts are
unchanged, so nothing is migrated):

| File | What |
|---|---|
| `gmail.cjs`, `outlook.cjs` | Gmail REST v1 and Microsoft Graph v1.0 clients: loopback OAuth with PKCE, refresh, read-only mail, incremental consent (`start({scopes, email})`) for the apps that add scopes. |
| `gmail-accounts.cjs`, `accounts.cjs` | Up to 20 accounts per provider in `gmailCredential` / `microsoftCredential`; `MailAccounts` joins both. |
| `connection.cjs` | Creates the accounts for `setup` (the built-in OAuth clients of `src/integration-clients.json` are imported once) and the account IPC; the settings declaration: defaults, secrets, `limits` (200 000 characters each), `publicFlags` (`hasGmail`), `validate` (too many accounts is refused). |
| `settings.js`, `settings.css` | The «Почта» card in «Настройки» → «Сервисы» (`data-service="gmail"`, shown while the module is on). |

The accounts are created whether or not «Почта» is added and are returned as `services.mailAccounts`, the name other
apps have always read (Календарь, Google Диск, Google Таблицы, «Поиск по всему», «Записи из почты», a meeting service's
summary letters, `src/google-workspace.cjs`); reading mail checks the module (`check()` of the clients). Account IPC
(`window.petya.feature('mail', …)`): `accountStatus`, `accountStart`, `accountStartMicrosoft`, `accountCancel`,
`accountRename`, `accountDisconnect`, `accountImportGoogle` (the file comes from the system dialog),
`accountConfigureMicrosoft`, `accountGuide`.

## Mail rules

- **Teaching in the chat** (`rules.cjs`): «Научись проверять почту» starts a draft; the person says what to read
  («непрочитанные за три дня, рассылки пропускай, Полина важная»), picks accounts («аккаунт work@…», «все аккаунты»),
  «попробуй» runs it on the mail, «сохрани навык» saves it, «отмени обучение» drops the draft. The local model turns the
  words into the rule's fields (schema-checked); without a model the fields stay and the person is told.
- **Running**: a saved phrase («Что там в почте») runs its rule; a similar request is matched by the local model only
  when unambiguous; Petya's tool router may pick a rule by id (`mail.run`). «Проверь почту» with no rules offers the
  standard one («Добавить и проверить») or opens the mail in Petya's browser. Answers go to the «Почта Gmail» chat.
- **The tab** «Навыки» → «Почтовые правила» (`mail-rules.js`, `extension.json` `ui.tabs`): each rule with its phrases and
  what it reads (chips), «Проверить сейчас» (a trial run, nothing is saved), on/off, «Изменить» (the whole form), a red
  trash button with «Отменить», the unfinished teaching draft, «Новое правило». Shown only while «Почта» is added.
- **Read-only**: rules read and summarize; nothing is sent, deleted or marked read. Up to 20 rules, up to 20 letters per
  account per run.

## Storage and migration

The rules and the teaching draft are this app's own file, `<company data>/extensions/mail/rules.json`
(`{version:1, rules:[…], draft}`; written to a temporary file and renamed; an unreadable file is kept aside as
`rules.json.broken-<time>`). Before 0.16 they were Petya's learned-skills state (`recipes`, `mailDraft`).
`migrate.cjs` moves them once when the app is set up for a company (bundled apps are set up whether or not they are
added): same ids and contents, copied first and taken out of the old state only after the file holds them; a rule that
cannot move (invalid, or the 20-rule limit) leaves the old state as it is. The «Развитие» points stay: the app reports
its rules through a `growth-source` (`growth-source.cjs`, 40 points per rule that is on) under the key the core used,
so the events earned before the move stay active. Rule deletion is no longer in Petya's «отмени последнее действие»
log; the tab's «Отменить» replaces it.

## Hooks into Petya

- `feature.cjs` returns the service `mail` = `{rules(), turn(command), run(id, command)}` and `mailAccounts`.
- `chat-route.cjs` (`chat-route`, `src/features/chat-routes.cjs`): `mail.turn` at the place of the request pipeline mail
  requests always had (after web search and the service offers, before Petya's own shortcuts).
- `route-tool.cjs` (`route-tool`, `src/features/route-tools.cjs`): the tool router's `mail` — its line in the router
  prompt, the rule «Для mail выбери существующий recipeId…», the enabled rules as `choices` (the model's `recipeId`),
  `keepsClarify` for the router's question about which rule, and `run` (the connection offer first, then `mail.run`).
  The prompt is the same text as before while «Почта» is added; without the app there is no `mail` tool.
- `summary-section.cjs` (`summary-section`): the closing line of «Что у нас сегодня?» («Это не полная сводка почты и
  календаря…»), now under the heading «Почта и календарь» and only while «Почта» is added.
- Rule IPC (`window.petya.feature('mail', …)`): `list`, `save`, `remove`, `restore`, `toggle`, `dropDraft`, `test`.

## Tests

`tests/mail-skills.cjs` (teaching, persistence in the app file, delete and restore, trial, «Проверь почту» offer,
migration incl. a failed write and a full store, growth points kept), `tests/gmail-accounts.cjs`, `tests/app-cards.cjs`,
`tests/parallel-thinking.cjs`, `tests/outlook.cjs`, `tests/company-integrations.cjs`, `tests/core-mail-rules-guard.cjs`
(the core has no mail rule logic or text), `tests/core-mail-guard.cjs` (the core names no Gmail / Outlook outside the
service-module tables; the app owns the connection), the tab in `tests/apps-own-ui.cjs`, the card in `tests/smoke.cjs`. Gmail and Microsoft Graph are verified with stubbed responses; live mailboxes are not.
