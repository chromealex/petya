# All-negative sorting with numerical and dialogue retention

Continue from v14's adapter to address the two remaining all-negative ascending/descending failures. The frozen 449-presentation run includes all 225 familiar cases once, eight additional copies of each of four controls on the failing array (two directions and phrasings), 48 negative-array variants twice, 32 prior mixed/general sorting variants once, and 64 numerical rehearsal examples once. Negative arrays cover integer magnitude, duplicates and decimals, with balanced directions and wording.

`protocol.json` freezes one epoch at 0.000005, seed 42 and thirteen adapted blocks. The unchanged v7 trainer and v8 evaluator run under the existing ARM Python 3.12 environment. GPU model jobs run sequentially after v14's Metal interruption; this operational choice does not change training data or inference criteria. Live prompts, dialogue roles, sampling, repeat guard, application selection and MCP capabilities remain unchanged. This is research, not an application feature or automatic release.

All 225 familiar targets (165 earlier targets plus all sixty v14 checks) must remain correct after ordinary reload. The sixty-eight new cases contain twenty drafts, twenty numeric bounds, twenty-four sorts and four other general checks. Five sorting arrays are entirely negative (including duplicates, decimals and three-digit magnitudes); one mixed decimal array guards against over-specialization. Drafts independently cross exact names/color and recipient/visibility states, plus privacy, scope exclusion and repeated correction. Numeric controls retain exact negative values, one-sided limits, unapproved proposals and four interval-inclusivity states. Fresh signatures are disjoint from historical fixtures and training.

Expected completions and label metadata never enter model input. Draft semantics are reviewed manually and non-blind against `rubric.json`; equivalent wording counts, but all agreed decisions, recipients, fields, exclusions, exact labels and truly unresolved questions must survive. Strict labels preserve case, ё and leading zeros. Paired comparison records every regression, separately from aggregate gains.

The gate requires complete retention, improved fresh sorting versus parent, no fresh draft or individual-case regression, numeric 20/20 and labels 8/8. A parent's perfect draft score may be preserved without claiming further draft improvement; this ceiling handling is declared before inference. Every targeted state must pass to claim full coverage of this set. Small related synthetic cases do not establish general live-dialogue reliability.

## Final result

Training completed all 449 updates in 335.6 seconds, adapting 6,094,848 parameters with approximately 16.9 GB peak allocation. GPU jobs ran sequentially and completed without an execution retry or acquisition repair. Finite losses, saved-tensor checks and parent/data/weight hashes passed. The selected artifact is `adapter`.

All 225 familiar targets exactly match after ordinary reload, including both original negative-sort failures and all prior permission, numeric and label corrections. Selection was committed before candidate fresh inference. These are trained retention targets, not unseen evidence.

| Model | Complete new drafts | Numeric bounds | Sorting | Other general | Exact labels | Recipient/field |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 9/20 | 17/20 | 18/24 | 4/4 | 8/8 | 4/8 |
| Immediate v14 parent | 19/20 | 20/20 | 18/24 | 4/4 | 8/8 | 7/8 |
| Historical v8 | 12/20 | 14/20 | 15/24 | 4/4 | 8/8 | 4/8 |
| Candidate v15 | 19/20 | 20/20 | 24/24 | 4/4 | 8/8 | 7/8 |

The candidate passes 67/68 fresh cases versus its parent's 61/68. All twenty all-negative sorts and four mixed-decimal controls pass, including both directions, both phrasings, duplicates and three-digit magnitudes. Numeric bounds, literal names, name/color decisions and the other general tasks remain correct. Automatic paired comparison records six gains and no observed per-case regressions.

One fresh prohibition failure remains: `report-1-01`. The parent sends the report to the prohibited buyer. The candidate both includes the buyer and says not to send to the buyer, without any correction qualifier. This contradictory specification fails; appending the correct prohibition does not cancel the contradictory delivery instruction. The same case was already wrong in the parent, so it is not counted as a new regression. `remaining-corrections.jsonl` preserves its reference, actual answer and reason; it was not used to train this candidate.

The narrow sorting/retention/no-regression experiment gate passes, but not every permission state does. **petya-v1 is not released or deployed** and live model selection remains unchanged. The next repair should preserve this fully passing numeric/sorting set while enforcing a single consistent recipient decision. Release evidence should also include materially different dialogue structures and user-derived examples; this small related synthetic sample does not establish broad reliability.

Validation includes six literal-label tests, five strict-scoring tests, script parsing, frozen hashes, complete ID coverage, conflict-free training targets, disjoint fresh prompts, inference manifests and adapter provenance. All 68 candidate outputs pass schema checks. `verify.py` reproduces the artifact and outcome checks; `summarize.py` reproduces scores and paired comparisons. `results/summary.json` separates trained retention, fresh transfer, remaining contradiction and release status. Draft semantic review is manual and non-blind.
