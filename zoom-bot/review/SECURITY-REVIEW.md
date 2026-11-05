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
