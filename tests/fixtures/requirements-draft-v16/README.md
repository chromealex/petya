# Consistent recipient decisions and reversed question polarity

Continue from v15's adapter to address the buyer-delivery contradiction. The frozen 541 presentations include all 293 familiar targets once, twelve additional copies of each of four recipient/visibility controls from the failing family, 44 consistency variants twice, 64 numerical rehearsal cases and 48 negative-sort variants. The 44 variants cover both question orders and final-question phrasings (32 cases), plus explicit repair of contradictory assistant drafts into one consistent decision (12 cases). Permission and visibility states are balanced.

`protocol.json` freezes one epoch at 0.000005, seed 42 and thirteen adapted blocks. GPU jobs run sequentially under ARM Python 3.12, reusing the unchanged v7 trainer and v8 evaluator. Live prompts, dialogue roles, sampling, repeat protection, application model selection and MCP capabilities remain unchanged. This is research, not an application feature or automatic release.

All 293 familiar targets (225 prior targets plus all 68 v15 checks) must remain correct after ordinary reload. The 76 new cases include 28 drafts, twenty numerical bounds, twenty-four sorts and four general checks. Eight drafts introduce reversed permission/visibility question polarity and changed wording, frozen before any inference; they are reported separately as `polarity`. Other drafts retain exact names, independent rename/color decisions, two permission orders, privacy, scope exclusion and repeated corrections. Expected completions and label metadata never enter model input. Fresh signatures are disjoint from training and historical fixtures.

Semantic draft review is manual and non-blind. Equivalent wording counts, but every agreed decision, recipient, field, explicit exclusion and literal label must survive. Contradictory instructions fail even if the final sentence contains the correct prohibition; adding a ban does not erase a simultaneous instruction to send. Questions may include only unresolved matters. Strict labels preserve case, ё and leading zeros. Paired comparisons prevent aggregate gains from hiding broken parent successes.

The gate requires complete familiar retention, improved fresh permission handling without any lost parent success, numeric 20/20, labels 8/8 and sorting preservation. All targeted states must pass before claiming complete coverage of this set. Small related synthetic data and non-blind review do not establish broad release readiness.

## Final result

Training completed 541 updates in 581.1 seconds, adapting 6,094,848 parameters with approximately 16.9 GB peak allocation. GPU jobs ran sequentially without retry or acquisition repair. Finite losses, tensor checks and parent/data/weight hashes passed. The artifact is `adapter`.

All 293 familiar cases retain their requirements after ordinary reload. Of these, 292 exactly match the reference JSON. `v16-failure-0-0` has identical description/questions and only expands the heading from a failure notification to an indexing-failure notification, accurately matching the source dialogue. This harmless difference is explicitly reviewed in `results/acquisition-review.json`; it is not reported as an exact match. The original buyer contradiction is fixed. Selection was committed before candidate fresh inference.

| Model | Complete new drafts | Numeric bounds | Sorting | Other general | Exact UI labels | Original report states | New polarity states |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Base | 14/28 | 15/20 | 17/24 | 4/4 | 8/8 | 5/8 | 2/8 |
| Immediate v15 parent | 25/28 | 20/20 | 23/24 | 4/4 | 8/8 | 8/8 | 5/8 |
| Historical v8 | 12/28 | 14/20 | 15/24 | 4/4 | 8/8 | 3/8 | 2/8 |
| Candidate v16 | 24/28 | 20/20 | 24/24 | 4/4 | 8/8 | 8/8 | 4/8 |

The candidate and parent both pass 72/76 fresh cases, but on different members: candidate fixes `sort-4-1-0` and regresses `polarity-0-00`. Numeric bounds, quoted UI labels and all familiar-format report decisions remain correct. All four controller/customer summaries retain the obsolete statement code instead of the agreed control code. The parent had three of those failures; its fourth answer explicitly said to use the control code instead of the old identifier and was credited before candidate inference. Candidate removes that replacement, creating a real regression. Literal UI-label coverage must not be confused with correct report-field identifiers.

The new wording/polarity family was frozen before any inference. It exposes a replacement weakness that was less visible in repeated report templates; it is not a post-hoc test chosen from candidate failures. `remaining-corrections.jsonl` preserves all four references, observed answers and reasons; none trained this candidate. Final recipient/visibility states are present in these answers, but wrong report content still makes the full task fail.

The no-regression and fresh-improvement gates fail despite acquisition of the requested fix and better sorting. **petya-v1 is not released or deployed**, and live model selection is unchanged. Preserve v16 as an experimental artifact rather than claiming a net model improvement. Next work should balance old/new field replacement under varied question wording while retaining sorting and permission decisions, and use more structurally diverse and user-derived dialogue checks before release.

Validation includes six literal-label tests, five strict-scoring tests, frozen hashes, full ID coverage, disjoint fresh prompts, conflict-free training targets, inference manifests and adapter provenance. All 76 candidate answers pass schema validation. `verify.py` checks the exact/semantic acquisition distinction and the explicit paired regression; `summarize.py` reproduces scores. Manual semantic judgments, including generous interpretation of explicit replacement qualifiers in baseline answers, are retained for review. This small related synthetic evaluation is non-blind and does not establish broad live-dialogue reliability.
