# Separate Zoom participant service

Status: implementation and protocol tests pass; Linux SDK 7.1.5.4432 is compiled and the service is installed on the existing server. End-user OAuth authorization and a live meeting acceptance test are still required. Do not treat a successful API test as a successful Zoom recording.

## Requirements

- Linux x86_64, Node.js 18.19+ (22+ recommended), PulseAudio with a null sink, and the official Zoom Meeting SDK for Linux.
- A user-managed Zoom General App with Meeting SDK enabled, `user:read:user` and `user:read:token` scopes, and exact OAuth callback `https://auth.petya-app.ru/oauth/zoom/callback`.
- Host permission to record, waiting-room admission when required, and Zoom's current external-meeting authorization requirements. On-behalf authorization may require the authorizing user to remain in the meeting. This cannot promise recording after that user leaves. See [Zoom OBF requirements](https://developers.zoom.us/docs/meeting-sdk/obf-faq/).
- The existing Petya OAuth broker on localhost:8787. Keep Zoom secrets in its protected environment file, never in source control.

## SDK adapter

Clone the [official sample](https://github.com/zoom/meetingsdk-headless-linux-sample) at `c10031ec1b901494f30d1c6e7d075b6da3f83718`. Download the licensed Linux SDK from the app's Embed page and install it according to the sample instructions. Run `python3 zoom-bot/prepare-sdk.py /absolute/path/to/sample` from the Petya root. The adapter disables video, sends PCM to fd 3, reports recording/end markers, and exits on meeting completion. Build using the sample's Linux dependencies and single-job compilation on small servers. SDK compatibility must be verified against the downloaded release; the patch intentionally fails on unexpected sample source.

## Service configuration

Run `node zoom-bot/server/server.cjs` under a dedicated service account. It binds only to 127.0.0.1:8790. Expose it behind HTTPS, with request body and response buffering limits; keep the OAuth broker's existing routes intact. Required environment:

- `ZOOM_STORAGE_KEY`: independent 32-byte random key encoded as 64 hex characters.
- `ZOOM_TENANTS` (optional): JSON mapping SHA-256 hashes of random bearer credentials to company identifiers. Credentials must contain 40–200 base64url characters. Never store bearer credentials in public config.
- `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`: the General App's credentials, also configured on the OAuth broker.
- `ZOOM_SDK_BINARY`: absolute executable path to the patched SDK sample.
- `ZOOM_DATA_DIR`: protected persistent directory (default `/var/lib/petya-zoom`).

By default the desktop uses its encrypted Zoom OAuth connection as its recorder credential. The service validates it with the local broker and isolates jobs by connection hash; no API key needs to be copied by the user. Optional explicit tenant credentials remain supported.

The SDK receives a private config under `/dev/shm` and deletes it after exit. The service encrypts audio and metadata with AES-256-GCM, supports one active recorder by default, and isolates requests by company. ASR runs on the desktop only after the meeting ends. Successful acknowledgment deletes server audio. Unacknowledged or interrupted recordings require operator retention management; do not remove the encryption key while recovery is needed.

## Acceptance checks

Run `tests/zoom-bot.cjs`, `tests/zoom-bot-server.cjs`, and the real MCP client in `tests/mcp.cjs`. Before deployment, additionally verify live OAuth login, waiting-room admission, recording permission, end-of-meeting completion, full transcript recovery after a desktop restart, company isolation, and zero local microphone capture. Windows UIAutomation and actual Zoom information controls need platform testing.
