# Slack

The Slack app (`src/extensions/slack`, catalog switch `module_slack`) owns everything Petya does with Slack. The core
names no part of it; it plugs in through registries (`docs/extensions.md` §9–10).

| What | File | Plugs in through |
|---|---|---|
| Connection card (sign-in through the Slack app or a user token, channels, background sync) | `settings.js`, `connection-check.cjs` | `window.addConnectionCard`, `connection-check` |
| Settings `slackToken`, `slackCredential` (secrets), `slackChannels`, `slackAutoSync`, `slackInterval` | `feature.cjs` | feature `defaults` / `secrets` / `publicFlags` / `validate`; `connection-check.cjs` for «Сохранить и проверить» |
| Sync of the chosen channels and threads into the context memory | `sync.cjs` | `serviceJobs` (`slack`), IPC `syncSlack` |
| The open Slack thread being read (macOS `assets/native/slack-view`, Windows `view.ps1`) | `logs.cjs` | `serviceJobs` |
| «Попроси команду …», «… в #канал» (confirmed channel, mentions by role, receipts, verification) | `team-request.cjs`, `channel-route.cjs`, `recipients.cjs` | chat route `send`, IPC `slackRequestReply` |
| «Что нового в Slack?» | `digest.cjs` | chat route `digest`, capability `slack-digest` |
| Reading the Slack window when the API is unavailable | `screen.cjs` | chat route `screen` + `failure`, computer approvals `slackScreenRead`, `slackDigestScreen` |
| A context reference / build log question about the thread being read | `route-reference.cjs` | chat route `reference`, capabilities extending `build`, `context-look` |
| «Имена из Jira, должности из Slack» | `jira-people.cjs` | chat route `people` |
| Team fill: channel members, profile titles and contacts, deactivated accounts, the window | `roster.cjs`, `profiles.cjs` | `team-source` |
| Pictures and videos of synced threads | `media-source.cjs` | `media-source`, chat route `media` |
| Sharing a work report to a channel | `report-share.cjs`, `report-share.js` | IPC `reportShare*`, `window.offerReportShare` |
| Slack links open the Slack app; names of Slack users on cards | `open.cjs`, `message-cards.js` | feature IPC `slack.open` / `slack.names`, `window.petyaLinkOpeners` |
| The Slack row of «В сервисах» on «Команда» (member ID) | `team-identity.js` | `window.petyaTeamIdentities` |
| A project's Slack channel («запомни канал разработки #dev») | `feature.cjs` `projectBinding` | `src/project-memory.cjs` |
| Message cards, messenger and search sources, summary section, share-message | `message-*.cjs/js`, `messenger-source.cjs`, `search-source.cjs`, `summary-section.cjs`, `share-message.cjs` | their kinds |

Without the app added, Slack requests get the app offer (`src/features/extension-offers.cjs`) instead of a core
handler. Stored data keeps its place: the sent requests and report shares stay in the company's review state
(`review.json`: `slackRequests`, `reportShares`), synced threads in the context memory, the team's `slackId` in the
team records.

Still read from the core (later lanes): the build watchers and repair of Slack threads (`src/build-*.cjs`,
`src/review-assistant.cjs`), the OAuth client and help links (`src/service-oauth.cjs`, `src/connections.cjs` guides),
the company icon (`src/company-icon.cjs`), project memory's channel bindings (`src/project-memory.cjs`), the team
record's `slackId` (`src/team.cjs`, `src/team-enrich.cjs`, `src/team-fill.cjs`), the clarification fields
`slackRequestChoices` / `slackRequestReply` (`src/features/clarifications.cjs`, `src/ui/dialogue.js`).

Verified with stubs (unit and window tests); the Slack Web API calls are the same as before the move.
