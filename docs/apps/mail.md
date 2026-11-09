# Почта (`src/extensions/mail`)

The mail app: letters as chat cards (important first, a reply draft opened in the mail service, a letter to a task)
and the **mail rules** — how Petya checks mail on request. It is the `gmail` service module of the catalog
(`"setting": "module_gmail"`, `"service": "gmail"`): adding «Почта» shows the connection card in «Настройки» (Google /
Microsoft accounts, read-only; `src/mail-accounts.cjs`, `src/ui/mail-connection.js` stay Petya's connection) and the
rules tab on «Навыки».

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

- `feature.cjs` returns the service `mail` = `{rules(), turn(command), run(id, command)}`; Petya's request pipeline
  calls `mail.turn` where mail requests always went (after web search and the service offers), and the tool router reads
  `mail.rules()` for its `mail` tool. Without the app both return nothing and the request goes on to the dialogue.
- IPC (`window.petya.feature('mail', …)`): `list`, `save`, `remove`, `restore`, `toggle`, `dropDraft`, `test`.

## Tests

`tests/mail-skills.cjs` (teaching, persistence in the app file, delete and restore, trial, «Проверь почту» offer,
migration incl. a failed write and a full store, growth points kept), `tests/gmail-accounts.cjs`, `tests/app-cards.cjs`,
`tests/parallel-thinking.cjs`, `tests/core-mail-rules-guard.cjs` (the core has no mail rule logic or text), the tab in
`tests/apps-own-ui.cjs`. Gmail and Microsoft Graph are verified with stubbed responses; live mailboxes are not.
