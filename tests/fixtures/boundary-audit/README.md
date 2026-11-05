# Auditing numerical bounds and reopened questions

Petya 0.8.3, local qwen3.5:9b. Replay uses the nine original paired drafts from the preceding evaluation. Seven additional synthetic probes use hand-written input drafts and predefined rubrics. These are isolated checks of the reviewer, not an independent end-to-end benchmark.

The first audit proposes edits to exact spans and cites the note verbatim. The patcher checks the cited text and the old span before applying edits, reverting the batch if validation fails. Source presence does not establish entailment. On crate-exact, for example, the model cited the correct sentence as grounds for deleting the exact-count requirement. On tour-max it deleted an implementation question even though the quote established only the limit. This latter issue is not penalized by the previous coverage rubric, which scores settled requirements and the changing value rather than optional implementation questions.

After inspecting the failures we tested a second policy on the same drafts. It rejects blank replacements for title and description spans and independently asks the model to answer each question from the note before removing it. The second stage reuses proposed text edits and may preserve redundant text. The probes require the intentionally unresolved question to remain in the questions field.

| Passing drafts | Input | Exact-span audit | Separate question verification |
|---|---:|---:|---:|
| Prior generated drafts | 7/9 | 7/9 | 7/9 |
| Hand-written probes | 3/7 | 4/7 | 7/7 |

The separate variant fixed the inclusion of 70 in a strictly-above-70 threshold and retained a genuinely deferred capacity question. It still accepted a fabricated minimum of one in the bakery draft, and kept the question reopening the settled tour size. The first variant removed the latter question but lost a different exact-count requirement. Manual assessment was unblinded. The separate variant's probe result was obtained on the same cases used to diagnose its predecessor.

Run run.cjs with a new JSONL path using Electron as Node; then pass that file and another new output path to check-questions.cjs. Both reuse the local harness from draft-coverage. results.json contains both raw passes and case-level assessments. Neither variant is enabled in the application.
