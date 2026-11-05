# Wider adaptation with correction retention

Previous narrow-adapter experiments acquired examples but inconsistently transferred cancellations and explicit exclusions. Auditing the v9 training sets found no identical prompts with conflicting completions. This experiment changes adaptation depth from five to thirteen blocks, starting from the retained v9 `repaired-adapter`, not the rejected decision experiment. New LoRA contributions initialize to zero; existing parent tensors are checked for exact equality before updates. The base model is frozen. Recurrent training uses differentiable operations, with ordinary inference used after reload.

The one-example probe completed with a finite loss, 6,094,848 trainable parameters and approximately 16.1 GB peak allocation. `probe.json` preserves its metadata. Probe weights are not used as the training parent.

The fixed training run uses one epoch at 0.00001 over 668 presentations: 464 previous decision-training rows, twelve copies of each of the seven outstanding corrections, and four copies of each of the prior 30 acquisition targets. There are 293 distinct prompts and no conflicting completions for identical prompts. Depth and data both change, so success cannot be attributed uniquely to depth.

`protocol.json` freezes hashes and gates before inference. `acquisition.jsonl` checks 37 training targets after reload, separately from `check.jsonl`, which reserves 32 fresh prompts: eight independent rename/color combinations, four recipient/field combinations, four other long dialogs, eight numeric cases and eight general checks. Fresh signatures are disjoint from the training set and historical top-level requirements fixtures. The short system prompts and dialog-role format are unchanged. No runtime prompt patch, application build, MCP capability or model deployment is part of this research.

Semantic draft assessment is manual and non-blind, against `rubric.json`. Equivalent wording counts; all agreed final states, explicit exclusions, identifiers, recipients and unresolved questions must survive. Data/content preservation may be expressed with equivalent wording; both words need not appear literally. Correct schema alone does not establish correct requirements. `summarize.py` validates case coverage and inference manifests before aggregating manual grades and exact numeric/general results.

The improvement gate requires all 37 acquisition targets semantically correct, no numeric/general regression, and more complete new drafts than base and parent. Also report v8 as a historical comparator. A reliable cancellation/prohibition claim requires every targeted member to pass. Synthetic related families and a small manually graded sample do not establish broad live-dialogue or release readiness. No model is automatically promoted to petya-v1.

Training reuses `../requirements-draft-v7/train.py` with `--layers 13 --attention --mlp --epochs 1 --lr 0.00001`; evaluation reuses `../requirements-draft-v8/evaluate.py` and its strict scorer. These evaluate saved weights with greedy no-thinking diagnostics, without changing live chat sampling or repeat protection.

## Runtime continuity and acquisition-only repair

The initial training completed all 668 steps, but its temporary Python environment disappeared before inference. The weights were immediately saved and hash-verified in `adapter`. Evaluation was restored under Python 3.12.0 with the same core versions (MLX 0.32.4, mlx-lm 0.32.2, Transformers 5.22.1). Full restored package pins are in `evaluation-requirements.txt`. Repeating the parent model on all 32 fixed cases produced identical raw answers; `results/runtime-validation.json` records this observed control, not a claim that every dependency behavior is identical.

The initial 13-block adapter exactly retained all 30 previous targets but acquired only six of seven new ones. It continued excluding the tenant in `v10-f-ban-10` after the user explicitly allowed delivery. No new-case candidate answers were generated or inspected before repair selection.

A precommitted 196-step repair at 0.00001 replays all 37 acquisition targets four times and all four historical recipient/field states twelve times. The fourth state adds one consistency control, bringing the repair acquisition check to 38 cases (37 requested/prior targets plus one control). The original fresh check and its criteria remain unchanged. Both initial and repaired artifacts must be retained and reported; success on the repaired training targets alone does not establish transfer.

## Final result

The repaired 13-block adapter exactly reproduces all 38 acquisition cases after ordinary reload: the prior 30, the requested seven, and the extra paired-state control. This establishes acquisition and retention on those examples, not broad generalization.

| Model | New numeric | Complete new drafts | General smoke | Rename/color | Recipient/field |
| --- | --- | --- | --- | --- | --- |
| Base | 3/8 | 8/16 | 7/8 | 6/8 | 2/4 |
| Retained v9 parent | 7/8 | 8/16 | 8/8 | 3/8 | 2/4 |
| Historical v8 | 8/8 | 10/16 | 7/8 | 5/8 | 2/4 |
| Wider repaired v10 | 8/8 | 9/16 | 8/8 | 4/8 | 2/4 |

The predeclared narrow gate passes relative to the base and immediate parent, but the candidate does not outperform historical v8 on complete drafts. Reliable handling of cancellations and prohibitions is **not** established, and petya-v1 is not released. The adapter remains experimental; application model selection is unchanged.

Two candidate answers make the intended decisions but substitute the explicitly quoted source UI label «Пропуски» for «Пропуска». Complete-requirement scoring treats labels as factual values and counts these as failures, not freely paraphrased prose. If these two were credited as inflection, draft coverage would be 11/16 instead of 9/16; cancellation/prohibition reliability and release gates would still fail. Raw answers and all judgments are retained so this sensitivity is reviewable.

Other failures concern a cancelled color, missing address/data preservation, a field remaining hidden after its prohibition is lifted, incomplete report content for an added recipient, and omitted exclusion of an unrelated procurement task. The seven remaining references and actual failures are in `remaining-corrections.jsonl`; none were used to train this candidate. `results/summary.json` distinguishes acquisition, narrow score gains, historical comparison, subgroup reliability and release status.

The initial run completed 668 updates in about 759 seconds; acquisition repair completed 196 updates in about 223 seconds. Both trained 6,094,848 adapter parameters, with peak allocation about 16.9 GB. All weight/parent/data hashes and finite loss histories were verified. Strict-scoring tests pass, scripts parse, dataset hashes match, and all 32 candidate outputs pass schema validation. Correct JSON is still insufficient for correct requirements.

This experiment supports retaining the seven fixes without forgetting the prior thirty and shows a modest numerical/task gain over the immediate parent on this sample. It does not prove that more depth solves the underlying transfer problem. No app build, live prompt, sampling policy, MCP capability or deployed model changed.
