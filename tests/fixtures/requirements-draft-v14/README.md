# Balanced delivery permission and sorting directions

Continue from the v13 repaired adapter, addressing its remaining supplier-permission failure and descending-sort regression. The frozen 538-presentation run includes all 165 familiar cases twice, eight additional copies of each of six balanced controls (four supplier/visibility states and both sort directions on the failing array), 32 sorting variants twice, sixteen permission variants twice, and 64 numerical rehearsal cases once. Extra correction weight is balanced across contrasting decisions on identical factual values, avoiding the one-sided correction weighting that caused interference in v13.

`prepare.py` uses ARM Python 3.12 from the existing training environment. `protocol.json` freezes one epoch at 0.000005, seed 42 and thirteen adapted blocks. The unchanged v7 trainer and v8 evaluator are reused; live prompts, history roles, sampling, repeat guard, application model selection and MCP capabilities remain unchanged. This is an experiment, not an application feature or automatic petya-v1 release.

All 165 familiar targets (117 prior retention plus all 48 v13 fresh checks) must be correct after normal reload. The new independent set has 60 cases: twenty drafts, twenty numeric cases, sixteen sorting controls and four other general checks. Drafts cross eight exact-label/color states and eight permission/visibility states across both dialogue orders, plus notification privacy, scope exclusion and repeated correction. Sorting checks cover both directions, two phrasings, negative values, duplicates and decimals. Numeric checks retain exact negative values, one-sided limits, unapproved proposals and all interval inclusivity combinations. Fresh signatures are disjoint from historical fixtures and training.

Expected answers and literal metadata never enter model requests. Semantic draft review is manual and non-blind: paraphrases count, but all final decisions, exact labels, fields, recipients, explicit exclusions and only unresolved questions must survive. Strict literal checks preserve case, ё and leading zeros. `summarize.py` records paired gains/regressions, so higher totals do not conceal newly broken cases. Require all prior targets, all twenty fresh numeric cases, 8/8 labels, improved fresh drafts and no per-case regression against the parent. Every targeted decision must pass before claiming reliability. Small related synthetic checks do not establish broad live-dialogue reliability.

## GPU interruption and identical retry

The first run failed late in training with a Metal command-buffer GPU hang before final weights were saved. `results/failed-training.txt` preserves the error and last reported progress. No partial weights are evaluated or selected. A small fresh-process GPU matrix computation succeeds afterward. Retry uses the identical frozen data, seed, parent, optimizer and hyperparameters in a new temporary output directory, without parallel model evaluation. This is an execution retry, not selection among scored candidates.

## Final result

The identical execution retry completed all 538 updates in 529.1 seconds, training 6,094,848 parameters with approximately 16.9 GB peak allocation. All 32 logged loss intervals before the failed attempt's last reported step (512) match the successful retry. `results/execution.json` records both attempts; the failed attempt produced no saved candidate. Finite loss/tensor checks and data/parent/weight hashes passed. The selected artifact is `adapter`.

All 165 familiar targets exactly match after ordinary reload, including both requested fixes and all earlier numerical, label and permission corrections. No acquisition repair was needed. Selection was committed before candidate fresh inference. These are trained retention targets, not independent generalization evidence.

| Model | Complete new drafts | Numeric bounds | Sorting | Other general | Exact labels | Recipient/field |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 10/20 | 13/20 | 14/16 | 4/4 | 8/8 | 4/8 |
| Immediate v13 parent | 20/20 | 20/20 | 11/16 | 4/4 | 8/8 | 8/8 |
| Historical v8 | 9/20 | 14/20 | 7/16 | 4/4 | 8/8 | 1/8 |
| Candidate v14 | 20/20 | 20/20 | 14/16 | 4/4 | 8/8 | 8/8 |

The candidate passes 58/60 new cases versus its parent's 55/60. Automatic paired comparison records three gains and **no observed per-case regressions**. All numeric bounds, literal names, name/color decisions, recipient/field combinations, privacy, scope exclusion and repeated corrections pass. The parent already passed all twenty drafts, so this set supports retention, not a further draft improvement. The predeclared strict draft-improvement criterion therefore cannot pass at this ceiling; it is not silently redefined after observing results.

Two all-negative sorting cases remain: the array 54/-33/21 and the mixed/decimal controls improve, but the all-negative array -47/-9/-22 is still wrong under the concise ascending/descending phrasing. Its alternate phrasing passes. These two failures already occur in the parent; they are not new regressions. `remaining-corrections.jsonl` saves corrected references and actual outputs, neither used to train this candidate.

The numerical/literal/retention/no-regression checks pass, but the full fresh set is not perfect and broad reliability remains unproven. **petya-v1 is not released or deployed**, and live model selection is unchanged. The next focused repair should balance both sort directions and phrasings on all-negative arrays while retaining the now-passing numerical and dialogue cases. Before release, materially different dialogue structures and user-derived cases are still needed; success on these related synthetic families is insufficient evidence by itself.

Validation includes six literal-label tests, five strict-scoring tests, script parsing, frozen hashes, complete ID coverage, conflict-free training targets, historical/fresh prompt disjointness, inference manifests and adapter provenance. All sixty candidate answers pass schema validation. `results/summary.json` separates known-case retention, fresh transfer, unchanged draft ceiling, paired gains/regressions and release status. Manual semantic review is non-blind, with all judgments retained for inspection.
