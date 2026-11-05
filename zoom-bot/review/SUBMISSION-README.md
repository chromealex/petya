# Petya Zoom security review package

Prepared 2026-11-05. The owner adopted the procedures and explicitly approved publication of the updated privacy notice and submission of this package to Zoom. Status: **authorized for re-submission**. This package does not claim Zoom approval, independent audit or full live recording acceptance.

## Included evidence

- Newly documented secure-development lifecycle.
- Three security artifacts: security policy, incident response, and vulnerability management.
- Original Semgrep SAST and Wapiti DAST JSON reports, initial and final.
- Source hashes, reproduction commands, findings dispositions and execution limitations.
- Updated privacy notice published at https://auth.petya-app.ru/privacy; architecture diagram from the earlier submission.

The PDF is an explanation and policy bundle. The original machine-generated scan results are separate files in evidence/ and must accompany it where Zoom accepts that format. Do not replace the native scanner output with only this PDF.

## Proposed reviewer response

We have prepared new SSDLC, security, incident-response and vulnerability-management documentation, along with original SAST and bounded unauthenticated DAST outputs. We remediated explicit AES-GCM tag-length configuration and HTTP header findings and documented the remaining contextual findings. The package transparently states scan coverage, manual retention limitations and missing live recording acceptance. No independent penetration test is claimed. Please identify any additional evidence or authenticated test coverage required for this application's external beta approval.

This is the authorized reviewer response; submission outcome is recorded separately. Production credentials and real meeting content are not included. New procedures have not been presented as historical audited practices.

## Outstanding gates

The owner adopted these newly documented procedures and approved this disclosure on 2026-11-05. The updated privacy notice has been published. Authenticated DAST and independent penetration testing are not provided. A live meeting test remains pending. These limitations can affect Zoom's decision; re-submission is not a guarantee of approval.
