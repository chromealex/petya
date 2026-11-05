# Seven-correction continuation

This experiment continues the five-block v7 adapter on seven reviewed failures: negative upper-bound direction, inclusive upper bounds, revoked and proposed values remaining open, unapproved export formats, cancellation of renaming while retaining icon changes, and complete two-question drafts with strict exclusions. The directory example was conservatively graded in v7: its vague wording is an explicitness/clarity issue, not proof that its contents would actually change.

Training mixes 280 historical rehearsal rows with eight copies of each of the seven corrected completions and 28 variations. The 364 rows contain 195 distinct prompts: 168 numeric, 164 draft and 32 general presentations per epoch. Two fixed epochs at learning rate 0.00003 continue all five existing adapted blocks from v7, resetting optimizer state. No production prompt or application behavior changes. `../requirements-draft-v7/train.py` is reused unchanged, with `--layers 5 --attention --mlp`. CPU-only preparation uses `python3 prepare.py`; actual MLX training requires the configured Python environment and GPU access.

`protocol.json` freezes hashes and gates. `check.jsonl` contains 24 numeric cases, 12 seven-turn drafts and eight constrained general smoke checks. Numerical histories vary from one to seven turns. Drafts include approved versus proposed formats, partial cancellation, one versus two open questions, topic changes, negative requirements and exact boundaries. New cases are synthetic and related to training families, so improvement cannot establish general intelligence or broad live-dialogue readiness.

Before any evaluation, historical-prompt auditing found one reused arithmetic question. It was replaced and the new hash committed; no model output informed the change. All 44 final prompts are disjoint from 414 historical prompt signatures in the top-level requirements-draft fixture datasets. The training file was unchanged by this audit.

Evaluation reloads saved weights, excludes the reference completion, uses the same short task prompts and deterministic no-thinking diagnostic generation as v7, and records model/data/config hashes. This does not change live chat sampling or its repeat guard. `scoring.py` rejects duplicate keys, non-finite JSON, missing draft fields and non-string questions. The focused parser tests cover false positives that ordinary `json.loads` would permit. Semantic draft review is manual and non-blind: all constraints and unresolved questions must survive, but reference wording is not required. A logically equivalent exclusion counts. A complete new draft must also pass schema validation.

The narrow improvement gate requires all seven corrections semantically correct after reload, no numeric/general regression relative to both base and v7, and higher complete-draft coverage than both on new cases. Release additionally requires every targeted check to pass and broader deployment validation; no adapter is automatically installed or named a production petya-v1 by these scripts. These are research fixtures, not a new application or MCP capability.

## Initial continuation result and retention regression

The fixed two-epoch continuation acquired all seven corrections semantically (six exact JSON matches, one equivalent question wording). On the 44 reserved cases, base/v7/v8 numeric scores were 18/24, 16/24 and 20/24; complete draft scores were 1/12, 5/12 and 6/12; general scores were 8/8 for all. Every output passed schema validation. Detailed non-blind semantic judgments are in `results/manual-review.json`.

This met the narrow new-case improvement gate but a subsequent rehearsal check exposed a regression: one of the original eight corrections converted a negative lower bound into an upper bound. Only 7/8 old corrections remained exact. The candidate is therefore not a stable replacement. The now-inspected 44-case check becomes development evidence for later training. Ten new failed cases were preserved with corrections, including four numeric failures and six incomplete/incorrect drafts.

## Stabilization protocol

A further fixed pass starts from the initial v8 adapter with learning rate 0.00002. Its 520 rows comprise the original 364, eight copies of each original correction (64), six copies of each newly observed correction (60), and 32 balanced directional, interval-inclusion and zero/no-decision contrasts. This avoids reinforcing only upper-bound examples. `confirmation.jsonl` reserves 16 new numeric, eight seven-turn draft and eight general cases before stabilization inference. `stabilization-protocol.json` records hashes and gates. Compare against base, v7 and initial v8; do not select checkpoints using these answers.

`acquisition.jsonl` separately checks the original eight, current seven and newly observed ten correction targets. These are training/rehearsal evidence only. Production release remains blocked until both retention and broader new-case behavior are adequate.

## Final stabilization result: no release

After standard reload, the stabilized adapter exactly reproduces all 25 acquired correction targets: the original eight, the requested seven, and the ten failures from the initial v8 check. This repairs the detected retention regression. Acquisition alone is insufficient.

| Model | New numeric | Complete new drafts | General smoke |
| --- | --- | --- | --- |
| Base | 9/16 | 2/8 | 7/8 |
| v7 parent | 14/16 | 5/8 | 7/8 |
| Initial v8 | 13/16 | 6/8 | 7/8 |
| Stabilized v8 | 15/16 | 5/8 | 7/8 |

The predeclared improvement gate **fails**: stabilized draft coverage does not exceed v7, and it is lower than initial v8 on this separate confirmation. Numeric performance improves, but the evidence shows a task tradeoff rather than a stable overall improvement. Both v8 artifacts remain experimental and neither is promoted or released as petya-v1. A previous gain on the initial 44-case set must not be presented as a successful final confirmation.

All confirmation answers, manifests, per-case semantic reviews and totals are in `confirmation-results`. The five remaining cases are preserved in `remaining-corrections.jsonl`: one inclusion error, three draft failures (cancelled rename, unclear retention of content, inverted address exclusion with omitted recipient exclusion), and one sorting failure also present in the baselines. The content-retention judgment is explicitly conservative; clear equivalent wording is accepted. All stabilized confirmation outputs pass JSON structure checks, so valid schema does not imply valid requirements.

The first pass took about 382 seconds for 728 steps; stabilization took about 298 seconds for 520 steps. Both trained 2,457,600 parameters, with peak MLX allocation below 9.6 GB. Parent/data/weight hashes are verified. Five focused scorer tests pass. Only research files changed; no build, application prompt, live sampling, runtime model selection or MCP capability changed.

Next training should broaden contrastive multi-turn data for independent decisions (keep one change while cancelling another, excluded recipients versus hidden fields, required fields versus suggested substitutions), retaining balanced numeric examples. Repeating the same corrections alone has now demonstrated memorization with incomplete transfer. A new held-out set and broader live-dialogue validation remain necessary before release; the precise source of every transfer failure is not established by these experiments.
