# Learning to Check Gmail

In «Подключения» (Connections), enable Gmail. The first sign-in requires your own Google OAuth client of type **Desktop app**: enable the Gmail API, configure the consent screen, add your account to Test users (if the app is in Testing), download the client JSON and import it in the Gmail card. Then click «Войти через Google» (Sign in with Google). The password is entered only on Google's site. An External app in Testing may require signing in again after 7 days.

Say «Научись проверять почту» (Learn to check mail). Describe the period, unread/all messages, excluding mailing lists, priority senders and summary rules. Petya will show the resulting parameters. «Попробуй» (Try it) reads real mail; then you can refine the rules and repeat the check. «Сохрани навык» (Save the skill) saves the tested version. «Отмени обучение» (Cancel learning) cancels the draft. On «Навыки» → «Почтовые правила» (Skills → Mail rules), a tab of the «Почта» app shown while it is added, manual editing, testing, disabling and deletion (with «Отменить») are available, as well as saving without testing. No restart or rebuild is needed. The rules are the app's own data since 0.16 (docs/apps/mail.md).

This is the first supported composite skill: reading Gmail → filtering → summarizing. The tools are fixed in the app; the rules and phrases are user-defined. Learning does not install new integrations and does not execute arbitrary code. Other services need separate tools.

Exact phrases work without the model. Rules from conversational text, similar mail requests and summarizing are handled by the local Ollama. If summarizing fails, fragments of the found messages are shown. Each run checks at most 20 inbox messages; if there is a next page, the result is explicitly marked as a sample. Up to 1500 characters of the message's text part are taken for the summary (for HTML-only messages, the snippet). Attachments are not read. Skipping mailing lists excludes the promotions/social categories and messages with a List-Unsubscribe header; this is a technical filter, not an error-free mailing-list classifier.

OAuth uses PKCE S256, a random state and a temporary loopback listener on 127.0.0.1. Only gmail.readonly is requested. Tokens and the client are stored using OS encryption; they are not accessible to the renderer. Disconnecting deletes the tokens on the device while keeping the client configuration. Revoking the permission at Google is done in the Google account. The external Claude/Codex interpreter does not receive topic history containing mail skill results.

Tests: test OAuth callback, invalid state, token refresh, disconnecting, reading only via GET, learning/trial run/saving/restart/cancellation, UI smoke. A real sign-in and reading of the account require the owner's authorization and are not replaced by these tests.

Official documentation:
- [Google OAuth for Desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Listing Gmail messages](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Getting a message](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [OAuth refresh token expiration](https://developers.google.com/identity/protocols/oauth2)

## Multiple accounts

In the Gmail card, the «Добавить аккаунт Google» (Add Google account) button connects another mailbox while keeping the others. The address is determined through the Gmail profile; signing in again updates the existing connection. Each mailbox can be given a name («Рабочая» (Work), «Личная» (Personal)) and disconnected separately. Importing a different OAuth client changes the configuration for new sign-ins while keeping the client and tokens of previously connected mailboxes.

In the skill editor, select one or more accounts or enable «Все подключённые аккаунты, включая добавленные позже» (All connected accounts, including ones added later). Without a selection, only the single connected account is used; with several, clarification is required. In the learning dialogue, separate replies are available: «аккаунт Рабочая» (account Work), «аккаунты work@gmail.com, personal@gmail.com» (accounts work@gmail.com, personal@gmail.com), «все аккаунты» (all accounts). Names must be unique; if they match, specify the address.

The result is split by mailbox, with a limit of 20 messages per mailbox. An error in one connection is shown next to its address; the other results are kept. A disconnected account in a saved skill is not automatically replaced with another one. A previously saved single sign-in is migrated without deleting tokens; the address is determined at the first check.
