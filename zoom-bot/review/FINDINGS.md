# Security findings and disposition

Assessment date: 2026-11-05. Scope and scanner output are in SCAN-RECORD.md and evidence/. This is first-party assessment, not an independent penetration test. No finding was suppressed in scanner configuration.

## SAST: 8 initial findings, 5 remaining

- **AES-GCM tag length (2 findings): remediated hardening.** The broker and recorder already extract fixed 16-byte tags from their encrypted format. Both now also set `authTagLength: 16` in `createDecipheriv`. Tampered/truncated recorder data is rejected in tests. Existing data format and credentials remain compatible. Final Semgrep output no longer flags these calls.
- **nginx header inheritance (1 finding): remediated configuration.** The HTTP staging template used `add_header Content-Type`; it now uses `default_type` and `charset`. This template is not the deployed HTTPS virtual host. The final scan no longer reports it.
- **Image installer subprocess arguments (3 findings): reviewed, no shell injection demonstrated.** `src/setup-images.py` runs a locally created venv interpreter with an argument array and default `shell=False`. Package names/versions and Python program text are constants; model path is a separate argument. The installation directory is user-selected local input. This requires trusting the local installation directory; it does not grant a remote meeting participant command execution. Outside the Zoom feature; retained in raw output, not silently ignored.
- **Opaque iframe postMessage (1 finding): reviewed design constraint.** `src/ui/model-frame.js` sends only selected model bytes/format to `frame.contentWindow` for a fixed local `model-viewer.html`, once on load. The frame has `sandbox=allow-scripts` without same-origin, so it has an opaque origin. Wildcard target origin is necessary for this isolated frame design. The payload does not contain Zoom credentials or meeting state. This is not a general cross-origin messaging audit; retained as a documented design limitation.
- **Loopback HTTP (1 finding): disclosed transport limitation.** The worker calls the OAuth broker on literal `127.0.0.1:8787`, not a user-supplied URL. The broker and recorder listen only on loopback; external traffic terminates TLS at nginx. Local host compromise can expose tokens. No end-to-end TLS or independent acceptance of this residual risk is claimed.

## DAST: 1 initial finding, 0 in bounded re-scan

Wapiti flagged missing X-Frame-Options on the public root. CSP already used `frame-ancestors 'none'`. Added `X-Frame-Options: DENY` at the deployed nginx boundary and repeated the same seven-page unauthenticated scan. Zero findings means only that these selected modules found no issue in this limited surface. OAuth consent, authenticated record/download/ack paths and native UI are not DAST-covered. Those access controls have separate functional negative tests, not a substitute pentest.

## Release limitations requiring follow-up

- Server Node 18 was detected and replaced for both services with official Node 22.23.4 LTS after broker/provider/recorder tests passed on that runtime. Both services are active; see evidence/deployment.txt.
- Failed/unacknowledged audio has no automatic expiry. Broad release requires an explicit retention decision and implementation or owner acceptance of manual operations; not implicitly accepted here.
- The owner-approved updated privacy notice is published at https://auth.petya-app.ru/privacy.
- No independent penetration test, incident drill or continuously scheduled scan exists.
- Full meeting capture/transcription acceptance and Windows live detection remain pending; prior external-meeting attempt returned Zoom SDK code 63.
- The owner adopted the newly documented policies on 2026-11-05. They do not establish a historical audited program.
