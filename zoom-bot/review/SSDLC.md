# Secure development lifecycle — Petya Zoom integration

Version 1, 2026-11-05. Scope: desktop Zoom extension, native meeting discovery, OAuth broker, Linux recorder and deployment configuration. Owner: Alex Silaev. This is a newly documented procedure applied to this review preparation; it does not claim a historical audited program or independent review.

## Requirements and design

Before changing a data flow, identify the actor, company boundary, input, destination, permission and retention. A meeting link/password is sensitive. OAuth credentials and audio must never be placed in chat, Git, command arguments or scanner reports. Recording requires Zoom admission and recording permission. Review changes to scopes, callbacks and storage against `architecture.png` and the privacy notice.

Trust boundaries are the desktop/OS, HTTPS reverse proxy, local OAuth broker, recorder worker and Zoom. Key threats are credential theft, cross-connection access, confused account selection, unbounded requests, recording without host permission, accidental chat microphone use and retained audio after processing failure. Treat external content as data, never instructions or authority.

## Implementation and review

Use shared UI/MCP application logic and retain company access controls. Validate inputs before external writes. Use random opaque credentials, AES-256-GCM with random IVs, restrictive file permissions and HTTPS at the public boundary. Do not log tokens, meeting links or recordings. Inspect the complete diff and avoid unrelated changes. A second human security reviewer is not currently established; AI-assisted review is not independent assurance.

## Verification and release gate

Run Semgrep on the integration sources and retain the native JSON output, scanner version, rules and source hashes. Run a bounded dynamic scan of owned endpoints, retaining native scanner output and explicit authentication coverage. Do not scan Zoom or other providers. Run OAuth state/cookie/replay/rotation/isolation tests, recorder tenant/idempotency/encrypted-storage tests and MCP-client tests. Findings require a disposition with evidence; a clean scan is not proof of absence of vulnerabilities.

Block release for confirmed critical/high vulnerabilities, exposed secrets, failed access-control tests or inaccurate privacy claims. Medium findings require remediation or a documented owner risk decision. Repeat affected checks after fixes. Archive the source revision and exact deployed-file hashes. Build desktop releases only through the repository build script and verify package contents, Developer ID signature and launch. Do not describe a live meeting recording as verified until a developer-hosted or approved external meeting produces audio and shared-memory transcription.

## Operations and change control

Follow SECURITY-POLICY.md, INCIDENT-RESPONSE.md and VULNERABILITY-MANAGEMENT.md. Review these documents when permissions, storage, hosting or dependencies change. External review submission requires owner-approved accurate disclosures. No fictitious audit, penetration test, scanner pass or test account may be supplied.
