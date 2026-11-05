# Continued LoRA training on reviewed corrections

This experiment continues the exact round-5 epoch-4 adapter weights with a fresh Adam optimizer, learning rate 0.00005, seed 42, and two fixed passes over 128 records (256 updates). It is weight continuation, not restoration of the previous optimizer state. The model freezes the base, attaches the same six LoRA tensors, loads the parent weights, and asserts exact tensor equality before the first update. The final full-attention block, rank 8, scale 2, zero dropout and 237568 trainable parameters are unchanged.

Training mixes the previous 88 records, all 32 reviewed transfer records, and 8 additional negative-bound examples. `corrections.json` retains the 8 failing outputs next to reviewed correct completions; only the correct targets enter training. Two numerical corrections (integer successor normalization and an implicit nonnegative count bound) address the strict representation contract rather than changing the allowed values. The earlier transfer set is now training/development material and must never be described as an independent evaluation of this candidate.

The reserved set contains 16 new numerical records in eight pairs plus eight new seven-turn draft dialogues. It checks negative/fractional and mixed bounds, cancelled decisions, print-only scope, field identity, delivery exclusions, unapproved proposals, changed intervals and task substitution. Exact prompts and IDs do not overlap training. These cases are synthetic, authored to target known failure families, and are not a real-user or statistically independent benchmark. `protocol.json` freezes the datasets, parent artifact and evaluation plan before training and inference.

Compare the base, parent adapter and continued candidate under the same no-thinking greedy settings. Numeric scores require exact typed JSON representation. Draft review is non-blind and requires all explicit decisions and exclusions, no invented scope or conditions, and questions limited to explicitly unresolved issues. No checkpoint will be selected or retuned from final answers. No model is deployed automatically. The intended future release name `petya-v1` refers to a derivative of the base model; this experiment is only a candidate, not a completed release.

From the project root, reproduce data with `prepare.py`. In the existing MLX environment use `run.py train BASE NEW_OUTPUT --adapter PARENT_DIRECTORY`. Evaluate with `run.py evaluate BASE NEW_OUTPUT.jsonl --adapter ADAPTER_DIRECTORY` (omit adapter for base). Run `score.py test INPUT.jsonl OUTPUT.json` for automatic scores; manual semantic findings are recorded separately. No application prompt, runtime model setting or MCP behavior is changed.

## Completed training and new-case evaluation

Dataset and fixed-duration protocol were committed in `cc02250` before training/inference. The parent tensor equality check passed, 256 optimizer updates completed, and the final adapter was reloaded in a separate process. Its hash differs from the parent; both artifact lineage and unchanged train/test hashes were verified. All 72 new-case raw outputs are in `results/base.json`, `results/parent.json`, and `results/candidate.json`.

| New-case measure | Base | Parent v5 | Continued v6 |
|---|---:|---:|---:|
| Exact numeric representation | 11/16 | 14/16 | 13/16 |
| Strict draft coverage | 4/8 | 5/8 | 4/8 |
| Valid draft JSON | 8/8 | 8/8 | 8/8 |

The candidate fails the precommitted gate against the parent on both substantive measures. It newly loses the minus sign in the inclusive lower bound of -17. It retains the parent's inverted negative upper bound and integer-successor normalization failure. The last is a strict representation failure, not a different allowed integer set. In drafts it collapses the print and dashboard tasks, drops the drive-frequency limit, changes a recipient to dispatcher, and interprets an unspecified shipment outcome as a monetary amount. It does improve the parent's scheme-export answer, but that does not compensate for regressions. `draft-review.json` records all manual, non-blind judgments.

After the new-case evaluation, a separate diagnostic generated answers for the eight corrected examples that were actually in training. `corrected.jsonl` is a filtered view of training, and `results/corrected.json` plus `corrected-review.json` preserve that check. Zero of four numeric records meet the strict representation contract and zero of four drafts preserve every requirement. Some elements improved: the notification now includes the check code, and the print answer again mentions invoice fields. However, error text and the agreed date format are still missing. This run therefore failed to reliably acquire the corrections even on familiar inputs. It is not evidence that LoRA can never learn them: the prior dedicated four-example memorization control passed, using a different dataset and many more repetitions.

The candidate is saved as a rejected research artifact, not a `petya-v1` release. It did not replace the parent or live model. No application build, deployment, runtime prompt, model selection or MCP behavior changed. Future experimentation should diagnose acquisition of these specific corrections before another broad training attempt; simply describing corrected targets as fixes would overstate the result.

The runner and scorer additionally accept `--split corrected` / positional split `corrected` for the familiar diagnostic. This option was added only after final inference and does not change the fixed test records, checkpoint choice or recorded final results. Reproducing `prepare.py` recreates train/test and correction pairs; `corrected.jsonl` is the committed training subset selected by IDs in `corrections.json`.
