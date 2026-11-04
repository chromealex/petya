# Mail and Simple Telegram Sign-in

Petya has a shared «Почта» (Mail) section: Google / Gmail (including Google Workspace), personal Outlook.com / Hotmail and work / school Microsoft 365. Up to 20 accounts per provider are supported. On-premises Exchange and Microsoft national clouds are not supported yet.

A mail skill selects specific mailboxes or all connected accounts. Old Gmail identifiers and tokens are kept; Microsoft uses a separate encrypted storage in the company profile. A new profile does not receive other profiles' tokens. Results from different mailboxes are labeled separately, and an error in one does not hide the results of the others. Read-only, up to 20 inbox messages per run, text fragments without attachments. Gmail excludes the promotions/social categories and List-Unsubscribe, Microsoft only List-Unsubscribe.

## What else is required for one-click sign-in

Google is registered: project Petya Desktop (`metal-bonus-513622-h9`), a Desktop app OAuth client, Gmail API enabled, the only declared permission is `gmail.readonly`. The configuration is embedded in `src/integration-clients.json`. The app remains External / Testing; the test user is chrome.alex@gmail.com. Other mailboxes must be added to Google's test users before signing in. Google's public verification has not been passed.

Microsoft is postponed by the user's decision: the current personal account has no access to an Entra directory for registration. Telegram is not registered: my.telegram.org returned «Too many attempts. Please try again later». For these providers, additional manual settings are available for now. Passwords and user tokens are not written to `src/integration-clients.json`.

- `google`: `{ "client_id": "...apps.googleusercontent.com", "client_secret": "..." }` — OAuth Desktop app; enable the Gmail API, configure the consent screen and the gmail.readonly permission. The client secret of a desktop client is not a server secret: it is available in the distribution. For a public release, meet Google's verification requirements; in testing, add test users.
- `microsoft`: `{ "client_id": "UUID" }` — an app with personal Microsoft accounts and accounts in any organization. Platform Mobile and desktop applications, redirect `http://localhost/callback` (the port is chosen dynamically); delegated User.Read and Mail.Read, offline_access. No secret is needed. Some organizations require admin consent.
- `telegram`: `{ "apiId": 12345, "apiHash": "32 hex characters" }` — Petya's own app in Telegram API development tools. Do not use other people's or demo keys.

Google and Microsoft settings are also available in a collapsible section of the interface for the current company. Telegram shows a connect button, then the phone number, the code and, if needed, the 2FA password / email verification. With a registered app, the technical fields are not needed. Personal Telegram remains one per company; the list of selected chats does not change.

OAuth opens in the system browser, with PKCE and a one-time state. For Microsoft, the common endpoint and only Microsoft Graph are used. Tokens are not passed to a third-party broker. A real sign-in to a mail account and reading messages after the Google registration have not been tested yet. The interface test with the embedded Google client passed.

Provider documentation:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration
- https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- https://core.telegram.org/api/obtaining_api_id
