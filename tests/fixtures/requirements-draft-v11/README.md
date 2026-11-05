# Exact names and independent decisions

This experiment starts from the v10 repaired thirteen-block adapter. It addresses the seven saved v10 failures with literal UI names, independently approved/cancelled name and color changes, recipient/field prohibitions, complete report delivery, and explicit procurement scope exclusion. This is research data and saved adapters, not a new application capability or deployed petya-v1 release. Live prompts, dialogue roles, sampling, repeat protection and MCP remain unchanged.

`prepare.py` freezes 424 presentations: four copies of the prior 38 acquisition targets, sixteen copies of seven current corrections, two copies of 64 new variants, and 32 seeded numerical/general rehearsal examples. The 64 variants contain 32 independent rename/color combinations, 16 recipient/field combinations, eight scope exclusions and eight literal-copy corrections. All 45 old/new acquisition targets are checked after ordinary model reload. Acquisition is deliberately separate from unseen evaluation.

`protocol.json` records data hashes, fixed seed, one epoch, learning rate 0.00001 and the unchanged thirteen-block parent architecture. Training reuses `../requirements-draft-v7/train.py`; normal inference reuses `../requirements-draft-v8/evaluate.py`. The full environment pins are in `evaluation-requirements.txt`. The training data is not changed during the run.

The 32 reserved cases contain sixteen multi-turn drafts, eight numeric bounds and eight general checks. Drafts independently vary two rename/color orders and four recipient/phone states, then check scope exclusion, print exclusions, failure-only notification and repeated interval corrections. Signatures are disjoint from historical top-level fixtures and training prompts. One grammatical correction to reserved user replies was committed before any inference, without changing training data. References and literal metadata never enter model requests.

`literal_check.py` requires the explicitly declared labels in the description, preserves case, Russian ё and leading zeros, and rejects nearby identifiers and prefix matches. Canonically equivalent Unicode forms count as equal. Six tests cover these boundaries and malformed duplicate-key JSON. Literal presence does not establish correct rename/cancellation decisions.

Draft review is manual, non-blind and against the frozen rubric. Complete success requires schema validity, literal-name checks where declared, all final decisions, all preserved fields and exclusions, and only genuinely unresolved questions. Reopening an explicitly settled decision fails even when the description is correct. All raw answers and individual reasons are preserved; grammatical awkwardness alone is not a failure. Naming one recipient does not by itself explicitly preserve a stated exclusion of another. A reference to showing the whole preceding report to an additional recipient is credited, whereas specifying only some report fields for that recipient is not. Display-only wording does not preserve an explicit boundary excluding a separate procurement task.

`summarize.py` checks full case coverage and manifests before combining exact numerical/general results, literal checks and semantic judgments. Report base, immediate parent and historical v8 alongside the candidate. The narrow improvement gate requires acquisition 45/45, more complete new drafts than base and parent, and no numeric/general regression. Reliability on cancellations/prohibitions requires every targeted member to pass; a small related synthetic sample cannot establish broad live-dialogue reliability or release readiness.

## Result and promotion decision

Training completed all 424 updates in 515.5 seconds, adapting 6,094,848 parameters with approximately 16.9 GB peak allocation. All losses and saved tensors passed finite checks. The saved artifact is `adapter`; its parent, training data and weight hashes are recorded in `adapter/training.json`. The first acquisition subprocess inherited an x86 execution preference and could not import ARM MLX; it failed before model inference. Explicit `/usr/bin/arch -arm64` execution fixed the launch without retraining or dependency changes.

After ordinary reload, all 45 acquisition answers exactly match their references: the requested seven fixes and all 38 prior targets. `selection.json` was committed before candidate fresh-case inference. No acquisition repair or candidate selection based on fresh answers occurred.

| Model | Exact label coverage | Complete new drafts | Numeric bounds | General checks | Rename/color | Recipient/field |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 8/8 | 1/16 | 4/8 | 8/8 | 0/8 | 0/4 |
| Immediate v10 parent | 5/8 | 6/16 | 7/8 | 8/8 | 3/8 | 1/4 |
| Historical v8 | 4/8 | 7/16 | 6/8 | 6/8 | 2/8 | 2/4 |
| Candidate v11 | 8/8 | 11/16 | 6/8 | 8/8 | 7/8 | 1/4 |

The base model's low complete-draft score includes reopening already settled decisions or introducing unrelated open questions; literal copying alone is substantially stronger. Individual explanations preserve this distinction. These are new prompts, so their scores cannot be compared directly with the different v10 fresh set. All four models pass schema validation on all 32 outputs.

The candidate improves exact copying and seven of eight independent name/color states, preserves the explicit scanner-procurement exclusion and retains repeated interval corrections. It does not solve recipient/field interactions: allowing owner delivery is ignored, or an explicit delivery exclusion disappears when phone visibility changes. One both-cancelled name/color state still applies the cancelled color. The failure-only notification omits the hidden-operator requirement and introduces email without agreement.

Numeric case `n1` remains wrong in both parent and candidate. More seriously, `n3` regresses: the agreed upper bound 96 becomes 95. Thus the no-regression gate fails despite a gain from 6 to 11 complete drafts. The candidate is preserved as an experimental artifact but **is not promoted or released as petya-v1**. Live application model selection is unchanged. Exact retention of 38 prior training targets does not imply no regression on unseen tasks.

`remaining-corrections.jsonl` saves five draft failures and two numerical failures with corrected references, observed answers and reasons. None trained this candidate. The next experiment should balance numerical rehearsal and vary recipient/exclusion decisions across longer histories and final-question wording, with another newly reserved check set. Some current report-training variants correlate permission state with final-question wording; this is a plausible transfer limitation, not an established causal explanation. These results do not isolate data balance, wording, or adaptation depth as a cause.

Validation includes six literal-check tests, five strict-scoring tests, script parsing, frozen data hashes, exact acquisition coverage, adapter/parent/config hashes and inference manifests. `results/summary.json` records the failed promotion gate explicitly; `results/manual-review.json` retains all non-blind judgments for review.
