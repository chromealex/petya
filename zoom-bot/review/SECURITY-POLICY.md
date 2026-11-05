# Security policy — Petya Zoom integration

Version 1, 2026-11-05. Newly documented project procedure; no certification or independent audit is claimed. Security owner and reporting contact: Alex Silaev, chrome.alex@gmail.com. Send reproduction steps and redacted evidence, never production passwords, tokens or meeting audio.

## Access and data handling

Production administrative access is through authorized SSH key access. Do not distribute production administrator accounts to reviewers or disable account MFA. Dedicated service identities run the OAuth broker and recorder. The recorder uses systemd restrictions including NoNewPrivileges, ProtectSystem and a restricted writable directory. Secrets remain in protected server environment files and OS-backed desktop storage, outside Git.

OAuth scopes are user:read:user and user:read:token. The strict callback is https://auth.petya-app.ru/oauth/zoom/callback. The broker binds browser sessions to a secure HttpOnly SameSite cookie, validates state, issues one-time claims and serializes token refresh. Recorder requests are scoped to the original connection; reauthorization must not substitute another connection into a job.

Public endpoints use TLS 1.2 or later. Local reverse-proxy/service communication is HTTP on loopback; this is a disclosed limitation, not end-to-end TLS. Server OAuth records, job metadata and audio segments use AES-256-GCM. Encryption keys are on the same server, not in an external KMS. Desktop memory and connection state use OS-backed safeStorage. This does not protect against a fully compromised authorized host.

## Recording and retention

The bot joins visibly as Petya, subject to Zoom host and account restrictions. It does not capture the desktop microphone. Audio remains encrypted on the recorder until post-meeting desktop transcription and acknowledgment; acknowledgment deletes audio. Failed/unacknowledged jobs currently have no automated expiration and require operator action. Metadata can remain after audio acknowledgment. Do not claim automatic cleanup or guaranteed retention periods that are not implemented. Review this gap before broad public release.

Company memory is shared across authorized chats and separately permissioned MCP access. Disconnecting OAuth does not itself remove imported memory or all recorder artifacts. Support-assisted server deletion must identify the correct connection/job without exposing another tenant's data and needs explicit approval before irreversible removal.

## Review and exceptions

Changes to access, encryption or destinations require review. Keep exceptions in the findings register with scope, rationale and owner decision; lack of a decision is not acceptance. Security scan results and architecture are confidential review material. No production credentials or real customer meeting content belong in the review package.
