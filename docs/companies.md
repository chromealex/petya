# Companies

The switcher on the left shows the current company. «Управление компаниями» (Manage companies) lets you add a company or rename the current one. The existing installation becomes «Компанией 1» (Company 1): data is not moved or overwritten. New profiles receive only the addresses and names of local models and the speech recognition paths; work connections must be configured separately.

The following are stored separately for each company: service settings and tokens, team, context, dialogs and attachments, Jira and assignment history, training, app data (reminders, journal), build watches and browser cookies. Switching company restarts the same app instance, without additional builds. The selection is kept between launches. The shared Claude/Codex apps and their accounts do not change; information about their limits remains shared.

Before switching, save changes to the team and connections, finish the request and stop listening. External work of agents already started continues. Background checks and timers of inactive companies are paused until you return to them; overdue reminders are processed on return. Conversations and materials are saved to the selected company: Petya does not automatically determine the organization of an open Slack window or the current meeting.

The list of companies is in companies.json in the existing userData. The default company uses the existing folder; the others use companies/<random ID>. The data folder is fixed for the lifetime of the process, including asynchronous operations that are finishing. Chromium sessionData is set before ready and is also separated by company. If the list is corrupted, startup stops without overwriting data.

## Connections

The «Подключения» (Connections) section shows the company explicitly. Slack, Jira/Confluence, Asana, Notion, Gmail and Google Play accounts, as well as selected projects/channels and enabled modules, belong to its profile. Sign-in through the system browser uses that browser's own session: when authorizing, choose the right work account. OAuth connections are created separately; disconnecting removes the selected connection, not another company's connection. Revoking access externally on the provider's side may affect other apps/sign-ins according to that provider's rules.

## Delete all companies and start over

Companies → «Удалить все компании и начать заново». The first company keeps its data in the app's root folder
next to app-wide files, and Electron holds its session files open, so the removal is two-phase
(`src/company-reset.cjs`): the button writes `reset-companies.json` and restarts Petya; at the next start, before
the company list is read, everything except the app-wide `KEEP` list (downloaded models and runtimes, installed
extensions, interface language, window size, macOS access state, Chromium's `Local State`) moves into one
`.removed-companies-<time>` folder, which goes to the Trash once the app is ready. The company list and the
introduction start fresh: one company, onboarding from the first step. Add a new app-wide file or folder in the
user data folder to `KEEP`, or a reset moves it to the Trash too.
