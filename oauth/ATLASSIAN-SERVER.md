# Shared Jira + Confluence sign-in for Petya

Status: the Petya OAuth app has been created in Atlassian (Resource-level); the server side is deployed; shared sign-in is not ready yet: waiting for DNS delegation, HTTPS and OAuth setup in the Atlassian console. ID: 20c1cb45-4b70-42ab-8bb4-aac4e0259dd3.

A single Petya app in the Atlassian Developer Console, OAuth 2.0 (3LO), Resource-level: the user selects the site. The client secret is not included in desktop builds. Hosting the server and accepting the developer terms require the owner's decision.

## Flow

1. The desktop app creates a one-time sign-in session on the authorization server and opens the system browser.
2. Atlassian shows the consent screen for Jira and Confluence. The callback on the HTTPS server checks the state and the session binding.
3. The server exchanges the code for tokens and encrypts them in persistent storage. The app secret is kept in the hosting's secret environment.
4. The desktop app receives the result over the protected one-time session. With several sites, the user selects a site from accessible-resources.
5. Jira requests use api.atlassian.com/ex/jira/{cloudId}; Confluence — api.atlassian.com/ex/confluence/{cloudId}. The current Basic auth is kept until OAuth is ready.
6. The server sequentially refreshes the rotating refresh token, atomically saves the new pair and handles access revocation. Signing in again is required when the refresh token is revoked/expired.
7. Disconnecting deletes the server-side tokens and the local connection. Before publication, the following are checked: user isolation, invalid state, callback replay, sign-in cancellation, site change and concurrent token refresh.

## Hosting

RUVDS server RU2780310: 194.87.110.60, Ubuntu 24.04 LTS, 1 vCPU / 1 GB RAM / 20 GB HDD, 710 ₽ for the first month. Paid by the user; auto-renewal is disabled. The domain petya-app.ru is registered with Selectel. The administrator's phone number is verified. The A record for auth.petya-app.ru points to the server, but as of 03.11.2026 19:46 MSK the authoritative .ru servers still return NXDOMAIN.

The broker is deployed in /opt/petya-auth/gateway.cjs; the systemd service petya-auth runs as the user petya-auth and listens only on 127.0.0.1:8787. The storage /var/lib/petya-auth/tokens.enc is encrypted with AES-256-GCM, the key is in /etc/petya-auth.env (0600). The Atlassian client secret was reissued by the owner and installed. The gateway serves Atlassian, Slack and Notion; the identifiers and secrets of all three apps are installed. nginx publicly returns 503 until HTTPS is configured. The encrypted file storage is designed for a single process, with a limit of 10 000 connections; before scaling, migration to a transactional DB and setup of external backups are required.

The OAuth client has been added in src/atlassian-oauth.cjs and integrated into the desktop sources. The connection secret is stored via safeStorage; the client secret and refresh token are not passed to the desktop app. The installed Petya.app has NOT been updated yet. The full set of previous tests and the new routing and broker tests pass. End-to-end sign-in by a real user has NOT been verified yet.

The host SSH key changed during the initial server preparation; it was verified via the RUVDS emergency console: SHA256:fwXrMWya6H26xDCC/DFFVJtwrMTjkMHKWyjRtxCFufI. known_hosts was updated only after verification. The Mac administrative key was installed with the user's explicit permission.

The Atlassian callback and 10 API scopes are saved. The user confirmed access and storage of the secret on the server. Next steps: wait for NS in .ru; obtain an HTTPS certificate; configure distribution; open the HTTPS proxy; end-to-end test of sign-in/refresh/disconnect; build and install the desktop app.

During the initial transfer of the old client secret, TextEdit saved temporary documents to iCloud. The documents were deleted, the user was notified and reissued the secret. Only the new secret was installed on the server, via a pre-created local /tmp file with 0600 permissions; the file was deleted after the transfer. The old secret was never used by the server.

Required server variables: PUBLIC_ORIGIN, ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, TOKEN_STORE, TOKEN_ENCRYPTION_KEY. Do not commit secrets or print them to logs. DB backups and safekeeping of the encryption key are required.

## Registration parameters

The script scripts/prepare-oauth.cjs <HTTPS origin> <output directory> creates atlassian-registration.json with the callback and the requested scopes. This is a file for filling in the console, not a manifest for automatic registration. offline_access is requested in the OAuth URL to obtain a refresh token.

Publication for other users comes after a working server, a test sign-in, distribution setup and filling in the owner's real details/privacy policy, if Atlassian requires them.

Official documentation: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/

Slack: the Petya app A0CEDB1HFD3 has been created in workspace T702E73EX (Azur Games), the callback and six user scopes are saved, rotation is enabled. The Client ID/secret is installed on the server. Installation in Azur Games requires administrator approval. Public Distribution is not activated yet.

The UI smoke test has been updated for the OAuth buttons and the nested manual connection, and it passed. The scripts/local-mac.py build stopped: the current script requires a Developer ID Application certificate, and no suitable certificate was found. The installed app was not replaced.

Notion: OAuth app 40dd872b-594c-81b7-8b7a-0037d20d3c37 has been created, scope Public, callback saved. Update/Insert content are disabled, No user information is selected. The secret was installed on the server via a local /tmp file, and the file was then deleted. /health returns providers: atlassian=true, slack=true, notion=true; this checks that configuration is present, not end-to-end authorization.

Selectel: domain ACTIVE, NS a/b/c/d.ns.selectel.ru saved, no phone verification warnings. The authoritative .ru servers keep returning NXDOMAIN, so HTTPS and end-to-end sign-in remain blocked by delegation.

Public pages have been prepared in oauth/server/public (privacy, terms, contact, index), and routes have been added to the gateway. Owner Alex Silaev, support chrome.alex@gmail.com — provided by the user. The texts have NOT been published or deployed yet; awaiting the owner's review. Route, CSP and method checks and the Slack/Notion OAuth regression tests passed. When deploying the gateway, the public directory must now always be copied together with the JS files.

03.11.2026: the owner approved publication of privacy/terms/contact. The public directory and the new gateway were deployed to the server, and the service was restarted. Over HTTP, nginx exposes only /, /privacy, /terms, /contact; OAuth remains 503 until HTTPS. An external check by IP with Host auth.petya-app.ru returned HTTP 200 and a byte-for-byte match of all three approved files. DNS for auth.petya-app.ru at 1.1.1.1 still has no A answer; there is no certificate.

In Atlassian Distribution, Alex Silaev, chrome.alex@gmail.com, https://auth.petya-app.ru/privacy and /terms were filled in. After selecting Personal data = Yes, a mandatory declaration of implementing the Personal Data Reporting API appeared. It is NOT checked: the mechanism does not exist yet. The form is NOT saved, and Atlassian public access remains disabled. Before a truthful confirmation, it is necessary to implement tracking of accountId/data age, periodic reports, and deletion/update of all local copies according to API responses. Documentation: https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/ . Do not switch the declaration to No to bypass the requirement.

03.11.2026 20:32 MSK: DNS started working. A Let’s Encrypt certificate was obtained for auth.petya-app.ru (valid until 01.02.2027). oauth/server/nginx-https.conf is enabled, nginx -t succeeds. certbot.timer is active; a deploy-hook checks and reloads nginx after renewal. External HTTPS check with certificate verification: /privacy, /terms, /contact, /health — 200. Configuration for all three providers is present. A real OAuth sign-in has still not been verified; Atlassian public distribution is blocked by the missing Personal Data Reporting API, and Slack requires distribution setup/administrator approval.
