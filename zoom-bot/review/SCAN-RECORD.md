# Scan execution record

Date: 2026-11-05. First-party preparation for Zoom external beta review. Do not represent these checks as independent certification or comprehensive penetration testing.

## SAST

Semgrep Community Edition 1.183.0. Rulesets: `p/security-audit` and `p/owasp-top-ten`, retrieved on scan date. Metrics and version check disabled. 304 rules, 421 scanned targets, no parse errors reported, about 100% parsed lines. Five files were excluded by Semgrep's built-in ignore patterns. Supported source languages only: binary SDK libraries and unsupported native-language analysis are not covered. Rule packs are registry-provided and can change; the report records executed rule IDs/metadata.

Input was a frozen snapshot of `src`, `native`, `oauth/server`, `zoom-bot/server`, SDK adapter script and npm manifests, excluding `integration-clients.json`, encrypted stores and Python caches. `source-manifest.json` records exact final snapshot hashes. The original archive SHA-256 is in provenance.txt. Scanned files were not uploaded to Semgrep; local scanner execution downloaded rules only. JSON reports are original scanner output, not hand-written summaries.

Command (same for initial and final output):

    semgrep scan --metrics=off --disable-version-check --config p/security-audit --config p/owasp-top-ten --jobs 2 --json --output REPORT /tmp/petya-review-source

Initial: 8 findings. Final: 5 findings, each individually discussed in FINDINGS.md. No blanket suppression or severity rewriting.

## DAST

Wapiti 3.2.3. Owned public target: https://auth.petya-app.ru/. Scope folder, one concurrent crawler task, maximum 120 seconds crawl and 30 seconds per module, 15 links/files limits. HTTPS certificate verification explicitly enabled. Automatic bug reports disabled. No browser credentials, Zoom OAuth tokens or customer data supplied. Providers' sites were not targets.

Command:

    wapiti -u https://auth.petya-app.ru/ --scope folder -m csp,http_headers,cookieflags,redirect,crlf -s https://auth.petya-app.ru/zoom-bot/health -s https://auth.petya-app.ru/oauth/zoom/callback -s https://auth.petya-app.ru/zoom/authorize --tasks 1 --max-scan-time 120 --max-attack-time 30 --max-links-per-page 15 --max-files-per-dir 15 --verify-ssl 1 --no-bugreport --store-session SESSION --store-config CONFIG -f json -o REPORT

Seven pages crawled. Initial: one low-severity missing X-Frame-Options finding. Final: zero vulnerabilities/anomalies/additional findings for the selected modules; the post-Node-upgrade scan is in wapiti-runtime-final.json. The initial command also selected `ssl`; Wapiti explicitly skipped that module because sslscan was unavailable. The final command omits it. Neither scan is a comprehensive TLS cipher audit. Cookie checks without an authorized login do not exercise authenticated session cookies. CRLF/redirect coverage is limited by the discovered input surface.

## Additional verification

OAuth broker security tests, provider refresh/isolation flows and encrypted recorder HTTP tests passed. AES-GCM corrupted tag/truncated data tests passed. These are first-party functional tests, separate from the original SAST/DAST reports. Deployment and runtime details are recorded in provenance.txt. Desktop source was not changed by this remediation; no desktop rebuild is needed for these server-only changes.
