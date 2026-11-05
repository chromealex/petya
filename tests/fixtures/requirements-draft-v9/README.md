# Cancellation and prohibition contrasts

This experiment continues the v8 stabilized adapter to repair five outstanding cases: lower-bound inclusion, a cancelled rename, explicit retention of address and content, hidden carrier address/forbidden recipient, and flat ascending JSON sorting. The content-retention example is a conservative clarity failure, not proof that the model would actually change content.

`prepare.py` builds 525 training presentations: 237 distinct historical prompts, four additional copies of the prior 25 correction targets, twelve copies of each new correction, and two copies of 64 new variations. The variations include all four independent rename/color decisions, all four recipient/hidden-field decisions, balanced interval inclusion and ascending/descending sorting (including duplicates and zero). Previously inspected v8 checks are training/development evidence, not new evaluation. No production prompt or runtime behavior changes.

One fixed epoch at learning rate 0.00002 continues the same five adapted blocks (2,457,600 trainable parameters), with optimizer reset and seed 42. Training reuses `../requirements-draft-v7/train.py`; evaluation reuses the strict `../requirements-draft-v8/evaluate.py` and `scoring.py`. Production sampling and repeat protection are unchanged. Greedy no-thinking generation is used only for controlled research comparisons.

`check.jsonl` reserves 40 new prompts before training and inference: 16 draft dialogs, 16 numeric conditions and eight general checks. Draft histories have five, seven or nine user/assistant turns. Two four-way groups test independent decisions on identical setups; other cases test topic return, pronoun reference, repeated correction, multiple reversals, hidden fields, exclusions and resolved questions. These are related synthetic families; even a passing result is not broad live-dialogue validation. New prompt signatures are disjoint from known historical fixture examples and the training set. `rubric.json` records the semantic requirements before output inspection.

`acquisition.jsonl` contains the requested five corrections and the prior 25, with unique identifiers. This separately tests acquisition and forgetting after standard weight reload. Correct semantic paraphrases count; exact JSON is recorded separately. Complete new drafts must preserve every agreed requirement and explicit exclusion, use the latest decision, avoid invented constraints or reopened questions, and pass strict schema checks. Manual semantic review is non-blind. All four members of each contrast group are reported individually; aggregate averages must not conceal a failed cancellation or prohibition.

The predeclared improvement gate requires all 30 acquisition cases semantically correct, more complete new drafts than both the base and parent model, and no numeric/general regression. Reliability across cancellations and prohibitions additionally requires every targeted member to pass. A partial gain does not authorize a petya-v1 release. All weights and results remain research artifacts; no new application/MCP capability is introduced.

## Retention repair before fresh-answer inspection

The initial adapter acquired all five requested corrections exactly but retained only 24/25 prior targets. The old `new-n23` case changed the exclusive lower bound (>36) into an inclusive one. Its acquisition answers are preserved in `results/initial-acquisition-*`.

The initially generated new-case answers were not inspected before choosing the repair. A separate precommitted repair protocol uses only acquisition evidence: one fixed epoch at 0.00001 over 264 presentations (six copies of all 30 acquisition targets, 64 decision contrasts, twelve extra copies of the failed old boundary and eight unique historical general examples). The original 40-case set remains reserved for evaluating the final repaired candidate. No held-out answer was used to choose this repair or its parameters. Both artifacts will be retained; the failed initial retention result must not be hidden.

## First reserved-check outcome and decision-polarity expansion

The repaired candidate retained all 30 acquired targets exactly. On the first 40-case check, it scored 16/16 numeric, 12/16 complete drafts and 7/8 general, versus the parent 15/16, 9/16 and 7/8. The base scored 9/16, 10/16 and 7/8. Although the narrow aggregate gate passed, all four rename/color combinations failed (the output collapsed toward changing the icon and retaining the name). All four recipient/field combinations passed. This is a subgroup reliability failure and cannot justify claiming that cancellations generally work. Descending sorting also remained wrong.

The now-inspected first check becomes development/training evidence. A further fixed one-epoch run at 0.00001 starts from the repaired adapter. Its 464 presentations comprise 120 old-acquisition replays, two copies of the 40-case development set, 128 balanced rename/color dialogs (four question polarities, both decision orders, four independent states, four sets of names), 64 recipient/field replays, 64 ascending/descending sorting variations and eight historical general examples. `decision-protocol.json` freezes parameters and hashes.

`confirmation.jsonl` is a new 32-case set: eight rename/color dialogs in two orders, four recipient/field combinations, four other long-dialogue checks, eight numeric cases and eight general checks. `confirmation-rubric.json` records the required states. Compare base, original v8, repaired v9 and the final decision-trained adapter on identical cases; assess retention separately on the original 30 acquisition targets. No automatic release or runtime change follows.

## Final confirmation and artifact decision

The final decision-polarity experiment is rejected. It reproduces only 29/30 acquired targets: `new-d-shift` omits the client recipient, although it retains the other fields and exclusions. This is a lost requirement, not merely different wording. The preceding `repaired-adapter` retains all 30 targets exactly (the requested five plus the prior 25) and remains an experimental artifact only. `candidate-status.json` records this decision and the exact retained weight hash. Production selection is unchanged.

On the separate 32-case confirmation:

| Model | Numeric | Complete drafts | General | Complete rename/color cases | Complete recipient/field cases |
| --- | --- | --- | --- | --- | --- |
| Base | 3/8 | 8/16 | 8/8 | 6/8 | 2/4 |
| Original v8 | 6/8 | 11/16 | 6/8 | 7/8 | 1/4 |
| Retained repaired v9 | 7/8 | 10/16 | 8/8 | 6/8 | 1/4 |
| Rejected decision v9 | 8/8 | 11/16 | 8/8 | 6/8 | 1/4 |

These are complete-requirement scores: a report with correct recipient restrictions but the wrong identifier still fails. Explicit final replacement instructions are credited even when an earlier clause names the old field. Harmless wording/inflection differences are accepted where the referent and final state are unambiguous; contradictions, omitted exclusions and reopened decisions are not. Individual judgments are preserved in `confirmation-results/manual-review.json` for review.

The initial improvement on the 40-case set did not establish reliable transfer: on the second set the retained candidate trails v8 in complete drafts, and the latest training loses a prior requirement. No claim that Petya now reliably preserves cancellations/prohibitions is supported. Neither v9 artifact is release-ready. The seven failures of the retained candidate on final confirmation are stored in `remaining-corrections.jsonl`; the rejected experiment's retention failure and raw responses remain available separately. These final cases were not trained on.

All three training artifacts are retained with verified parent/data/weight hashes and finite loss histories: 525 steps (~294 s), 264 repair steps (~142 s), and 464 decision steps (~271 s). The same 2,457,600 adapter parameters were trained; peak allocation was about 9.6 GB. The shared strict-scoring tests pass, research scripts parse, and frozen dataset hashes match. No application/MCP feature, live prompt, sampling setting, build or deployed model was changed.

Further progress requires improving generalization rather than treating memorization or one favorable aggregate as completion. Useful unresolved distinctions are latest versus earlier decisions under negative questions, independent field replacement versus disclosure, and maintaining the complete recipient set. This experiment demonstrates remaining limitations; it does not prove a unique causal explanation or a reliable next training recipe.
