# Petya Zoom review material — 2026-11-05

Prepared for Zoom's application review. This document contains architecture and operational details, but no credentials, tokens, meeting links, user transcripts, or audio.

## Data protection and transport

OAuth access/refresh tokens, connection identifiers, meeting job metadata and audio segments are encrypted with AES-256-GCM on the private server. Keys are stored in root-protected environment files on that server; this is not an external KMS. Desktop credentials, meeting state and company memory use OS-backed Electron safeStorage. Recorder access is isolated by OAuth connection, and an active job retains its original credentials across reauthorization.

Server audio is deleted after successful desktop acknowledgment. Failed or unacknowledged audio currently requires operator retention management. Public REST/OAuth endpoints use HTTPS with nginx restricted to TLS 1.2/1.3, and SDK media uses Zoom transport security. Localhost connections between the reverse proxy, broker, recorder and local speech runtime use HTTP. No Zoom webhooks are subscribed, so webhook-signature validation is not applicable to the implemented flow.

The service is hosted at RUVDS in Russia. The desktop uses Electron, Node.js, a Swift Accessibility observer on macOS and Windows UIAutomation. Server components are nginx, Node.js, the official Linux Meeting SDK 7.1.5.4432 and a patched official headless sample. C++ dependencies include CLI11, jwt-cpp, OpenSSL, GLib, X11 and OpenCV. PulseAudio provides a virtual device; recording does not use the desktop microphone. ASR runs on the desktop after meeting completion. Company memory can be accessed from multiple chats and through separately permissioned MCP tools.

## Verified evidence and limitations

Automated controller, HTTP protocol, OAuth refresh/isolation, retry and MCP tests pass. The SDK compiles and the server services start. A live attempted join did not produce audio; full recording acceptance remains pending. Windows meeting detection has not been live-validated.

The owner confirmed that no formal SSDLC documentation, SAST/DAST reports or independent penetration-test reports are available. No certifications are claimed. This diagram and functional tests are not substitutes for an independent security audit.

## External distribution

The Zoom development app supports only local/internal testing. The production configuration is prepared. On 2026-11-05 the technical-design form and architecture diagram were submitted, and the external beta sharing request reached the verified Marketplace status **Request in Review**. External sharing remains LIMITED pending Zoom approval. This is not approval for arbitrary external accounts or full Marketplace publication. The live server still uses development credentials; production credentials must not be activated until the applicable access and review requirements are resolved.

## Approval boundary

After an initial automatic approval-review block, the owner explicitly authorized sharing this security material and the architecture diagram with Zoom. The technical-design form received the architecture, technology and data-protection descriptions, including missing audits and operational limitations; the PNG was uploaded. The external-sharing request was submitted and its Request in Review status was observed. No secrets or meeting content were included.

## Live diagnostic follow-up (2026-11-05)

A retry reached OAuth/OBF token retrieval but the Meeting SDK rejected the join with `MEETING_FAIL_UNABLE_TO_JOIN_EXTERNAL_MEETING` (63), defined in the installed official SDK's `meeting_service_interface.h`. No audio was produced. A test meeting hosted by the developer account is still required. The service now preserves safe, stage-specific errors and numeric SDK failures instead of overwriting them with a generic worker-exit message. UI and existing MCP status/retry paths use the same result.

## Review remediation follow-up (2026-11-05)

Zoom returned the external beta request with "App Beta - Insufficient Evidence". No more detailed reviewer explanation was available. New first-party SSDLC/security/incident/vulnerability documents and original Semgrep/Wapiti reports are now prepared; see SUBMISSION-README.md and SCAN-RECORD.md. This supersedes the earlier statement that no SAST/DAST output was available, but no independent audit or pentest is claimed. The initial policies are pending owner adoption, the revised privacy notice is not yet public, and the expanded materials have not been re-submitted.
