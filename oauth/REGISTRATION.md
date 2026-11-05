# Petya's shared OAuth apps

The user connects a service with a button and grants access in the browser. They do not need to register their own apps or enter tokens. Client secrets and refresh tokens are stored only on the server; encrypted connection tokens are stored separately for each service. The desktop app stores an opaque connection key via safeStorage and obtains an access token for direct API requests.

Server: https://auth.petya-app.ru, RUVDS 194.87.110.60. Entry point: oauth/server/gateway.cjs. Until DNS/HTTPS are ready, the public nginx returns 503. The client sources have been updated; the installed app has not been replaced yet.

## Registration

`node scripts/prepare-oauth.cjs https://auth.petya-app.ru <новая папка>` (`<новая папка>` = new folder) generates the parameters, without registration and without secrets.

| Service | Callback | Permissions |
|---|---|---|
| Atlassian | /oauth/atlassian/callback | Jira and Confluence search, list below |
| Slack | /oauth/slack/callback | channels:read, groups:read, channels:history, groups:history, im:history, mpim:history; user scopes only |
| Notion | /oauth/notion/callback | Read content; no write access and no email reading |

Server variables: PUBLIC_ORIGIN, TOKEN_ENCRYPTION_KEY, ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, ATLASSIAN_SCOPES, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET. Do not include secrets in builds, the repository or logs.

Slack uses confidential OAuth V2 over HTTPS and mandatory rotation of user tokens. Installation may require approval by the workspace administrator. Distribution across workspaces and the Marketplace are configured separately after an end-to-end test.

Notion uses OAuth with page selection by the user. Capability: Read content. Page permissions are limited to the user's selection. Tokens are refreshed and the new pair is saved; if expires_in is absent, a refresh is performed once an hour on access.

Atlassian: Resource-level 3LO; site selection from accessible-resources. The callback and 10 API scopes are saved in the console; offline_access is additionally requested at login. The secret was reissued by the owner and installed on the server. Distribution is not enabled yet; a real login has not been tested.

| Feature | Scope to configure |
|---|---|
| Jira: issues, projects, versions | `read:jira-work` |
| Jira: creating, editing and deleting on rollback | `write:jira-work` |
| Jira: profile and assignees | `read:jira-user` |
| Jira Software: sprints | `read:sprint:jira-software`, `write:sprint:jira-software` |
| Jira Software: board list | `read:board-scope:jira-software`, `read:project:jira` |
| Jira Software: moving back to the backlog | `write:board-scope:jira-software` |
| Jira Software: issue snapshot | `read:issue:jira-software` |
| Confluence: CQL search with page text | `search:confluence` |
| Authorization renewal | `offline_access` |

[Jira 3LO](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/), [Board](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/), [Sprint](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/), [Agile issue](https://developer.atlassian.com/cloud/jira/software/rest/api-group-issue/), [Backlog](https://developer.atlassian.com/cloud/jira/software/rest/api-group-backlog/), [Confluence CQL](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/).

## Local services

Zoom supports a separate Meeting SDK participant through the user-managed Petya application described below; local system-audio capture remains optional. Ollama and Whisper run locally; they do not require OAuth or keys.

## Tests

The general test suite and UI smoke pass. New tests: invalid state/cookie, callback replay, one-time claim, encrypted storage, rotation under concurrent requests, isolation of providers and connections, disconnection, prevention of credential substitution from the renderer. Mocks do not replace an end-to-end login with the providers.

Official documentation: [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/), [Slack rotation](https://docs.slack.dev/authentication/using-token-rotation/), [Notion OAuth](https://developers.notion.com/docs/authorization).

App identifiers: Atlassian 20c1cb45-4b70-42ab-8bb4-aac4e0259dd3; Slack A0CEDB1HFD3; Notion 40dd872b-594c-81b7-8b7a-0037d20d3c37. The Notion app was created with a public installation scope and Read content permissions, without write access, comments or user profiles.


Asana: API app Petya, client ID 1220193688170618. Callback https://auth.petya-app.ru/oauth/asana/callback. Four permissions: workspaces:read projects:read tasks:read tasks:write; Full permissions and Delete are turned off. Manage distribution: Any workspace, saved. The secret is in ASANA_CLIENT_SECRET on the server; ASANA_CLIENT_ID is set. Adapter oauth/server/asana-provider.cjs, separate encrypted storage asana.enc. Refresh requests keep the previous refresh token if Asana did not return a new one. The public policy has been updated with Asana. Regression tests and UI smoke passed.

The updated Petya.app with the same Developer ID signature is installed on the Mac; backup copy Petya-before-asana-20261103.app. The regular build stopped because of insufficient disk space; its temporary directory was deleted. The update was prepared via an APFS clone of the installed package with src replaced and re-signing; codesign --verify --deep --strict succeeded.

While testing in Safari, two bugs in the shared broker were fixed: no-referrer caused Origin:null on the form POST (now same-origin, without sending Referer to external sites); CSP form-action self blocked the form's external redirect (now, after the check, an explicit noreferrer link to the provider is shown). The state/cookie/form and foreign Origin checks were not weakened. The OAuth tests passed after both changes; the update has been deployed.

The end-to-end Asana test is complete: login from the installed Petya.app via Safari, code match, confirmation of the four agreed permissions, callback, saving of the Azur Games connection. In the Asana section, the first page of projects (ASO Tasks selected) and the first page of tasks loaded successfully; the buttons for further pagination are displayed. No real tasks were created or modified. Creation/modification, conflict, retry and connection change were tested on a mock API; a real time-based access token refresh has not been tested yet.

## App icons

04.11.2026: the icon `assets/app-icon.png` was set in the consoles of Slack (A0CEDB1HFD3), Notion (40dd872b-594c-81b7-8b7a-0037d20d3c37), Atlassian for Jira/Confluence (20c1cb45-4b70-42ab-8bb4-aac4e0259dd3) and Asana (1220193688170618). Saving and display were checked in the services' interfaces; Atlassian was additionally checked after a page reload.

## Zoom Meeting SDK participant (2026-11-05)

- Development app: [Petya](https://marketplace.zoom.us/develop/applications/_hd32AsWRJi5vBoZmhd_vA/information?mode=dev), user-managed, Ready for local test.
- Petya icon saved for light and dark modes. Meeting SDK and meeting-bot use case enabled.
- Scopes: `user:read:user`, `user:read:token`. Strict callback: `https://auth.petya-app.ru/oauth/zoom/callback`.
- API and Marketplace terms were accepted with explicit user approval. App credentials are installed in the server's protected environment files, not this repository.
- SDK Linux x86_64 7.1.5.4432 compiled on the existing server using the pinned official sample and Petya adapter. OAuth broker and recorder systemd services are active. Recorder route: `https://auth.petya-app.ru/zoom-bot/`.
- End-user OAuth authorization, macOS Accessibility permission, host recording permission, and a live end-to-end meeting test remain required. Development availability is not Marketplace publication or production approval.

### External Zoom beta review (2026-11-05)

Production OAuth callback, contact details and technical design are prepared. With explicit owner approval, the architecture PNG and security disclosures were sent to Zoom, including the absence of formal SSDLC, SAST/DAST and independent penetration-test reports. The external beta sharing request is **Request in Review**; external availability is still LIMITED. The live services continue using development credentials. Approval, production credential activation and live recording acceptance remain outstanding. See `zoom-bot/review/SECURITY-REVIEW.md` for the disclosed limitations.

Desktop recording jobs now retain their original encrypted connection across reauthorization. Explicit retry can recover an unavailable/failed job without automatically replacing active work. Controller, HTTP reauthorization and MCP-client tests passed. The current `Petya.app` was rebuilt with `scripts/build.py --mac`; package, tray-launch and Developer ID signature checks passed.
