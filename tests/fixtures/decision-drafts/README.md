# Multi-requirement Jira draft evaluation on Petya 0.8.3

Three synthetic topics have three endings each. Each note has two settled requirements and one condition whose value is deferred, accepted or changed. The direct arm calls the repository's composeDraft. The guided arm first extracts the named condition with the six demonstration turns from decision-values, then calls the same composer with the original note and an extra decisionAnalysis field in its context. Only the extractor is given the condition name. This is a best-case test of a known focus, not automatic discovery. Team and company are fixtures. Nothing is submitted to Jira.

The runner uses local Ollama with qwen3.5:9b, thinking disabled, temperature 0 and seed 42, alternating arm order. A preliminary run used permissive field validation; the recorded run uses the application's nonempty text and length checks. To repeat, run run.cjs with Electron as Node and a new JSONL output path.

For each final result we manually assessed the title, description and questions together. The focus must have the right status and final value, without prescribing a tentative value or reopening an approved one. Both independent requirements must be stated as requirements and not reopened in the questions. An invalid draft fails. Generic implementation questions are not an independent disqualifier. A complete pass requires both checks.

| Outcome | Direct | Guided |
|---|---:|---:|
| Focus correct in draft | 3/9 | 8/9 |
| Focus correct and both other requirements preserved | 0/9 | 1/9 |

All nine extractions matched their proposed value, final value and status. For the sample labels, the guided changed-value draft gave the correct seven-day retention but dropped the batch number and the requirement for two labels. The one complete guided draft kept TSV, the flight code and the hidden driver phone. In the deferred format case guided composition failed the application's text validation. These are repeated variants of three topics, with one scored generation per arm and note.
