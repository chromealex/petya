# Diverse mixed supervision with validation-based duration selection

This experiment trains 24 full-dialogue drafts (16 newly authored and 8 former round-4 test cases explicitly promoted to training) plus the original 64 numeric extraction records. It keeps the same pinned base, seed, rank, target layers, learning rate and completion-only objective as earlier runs. The drafts cover exports, search, interface changes, notifications, scopes, corrections, exclusions, open decisions, and numeric boundaries. They do not repeat one topic-substitution template. All data is synthetic, not an Important export.

`protocol.json` freezes the evaluation and selection rules before evaluation. Save checkpoints after epochs 1, 2 and 4 (88, 176, 352 steps). Select using six newly authored validation drafts plus six older numeric development cases. Separately reserve six new final drafts; the final numeric regression is the unchanged 18-case round-2 set. Topic overlap assertions and token checks are recorded in `prepare.py` and `data-validation.json`. The small sets limit statistical confidence, and the old numeric probes are development regressions rather than fresh generalization evidence.

Run `prepare.py` to reproduce the data. In the existing MLX environment, `run.py train BASE NEW_OUTPUT_DIRECTORY` saves all three checkpoints. `run.py evaluate BASE NEW_OUTPUT.jsonl --split validation|test [--adapter ADAPTER_DIRECTORY]` generates answers without reference completions. `score.py SPLIT INPUT.jsonl OUTPUT.json` validates JSON and scores exact numeric records; draft semantics require separately recorded review. The trainer extends the audited original implementation only to save epoch checkpoints, while preserving the optimizer state across all epochs. Checkpoint reloads happen in separate evaluation processes.

No application prompt, MCP behavior, or deployed model is modified by this experiment. Passing the protocol's small final gate permits broader evaluation only, not deployment.

## Completed result

The protocol and dataset were committed in `ee05d1a` before validation inference. The selected checkpoint and all validation evidence were committed in `d83652e` before any final inference. `selection.json` includes hashes of the unchanged final draft data and protocol. The selector was subsequently renamed from `select.py` to `choose_checkpoint.py` because the former shadowed Python's standard `select` module and prevented model import; this failed attempt generated no final answers and did not change selection, data, or weights.

All checkpoints were trained from the pinned `mlx-community/Qwen3.5-9B-4bit` revision `8b2b98c00a6b4d291155e4890773ca8f769aee53`. Seed 42, learning rate 0.00015, rank 8, scale 2, zero dropout, 237568 trainable parameters, and the last full-attention block match the audited trainer. Saved adapters at 88, 176 and 352 updates were evaluated after separate-process reloads. Weight hashes, training hashes, step counts and frozen protocol/data hashes were verified. `environment.json` records the local package versions.

| Validation measure | Base | Epoch 1 | Epoch 2 | Epoch 4 |
|---|---:|---:|---:|---:|
| Exact numeric records | 4/6 | 4/6 | 4/6 | 5/6 |
| Strict draft coverage | 3/6 | 3/6 | 3/6 | 5/6 |

All checkpoints met the validation numeric floor. The frozen rule selected epoch 4 for its higher draft coverage. `validation-review.json` records non-blind manual decisions; `validation-results/` contains every raw answer and automatic score. `choose_checkpoint.py` reproduces the selection using only this evidence and exclusively creates `selection.json`; preserve or relocate the committed result before rerunning it in an experimental copy.

| Final measure | Base | Selected epoch 4 |
|---|---:|---:|
| Exact numeric records | 14/18 | 17/18 |
| Strict draft coverage | 3/6 | 2/6 |
| Valid draft JSON schema | 6/6 | 6/6 |

`final-results/` contains all 48 raw final answers; `final-review.json` records manual judgments. No failed final scenario was edited or used to select a different checkpoint. The candidate's remaining numeric error changes the exclusive lower bound of 41 into an inclusive one. The candidate invents a volume-threshold condition for sending a notification, changes printed invoice data into search behavior, and reduces the map task to “Fields.” The unresolved-link draft also loses the condition that the duration decision follows checking. These are substantive failures despite valid JSON.

The candidate failed the combined final gate and was not deployed. The numeric regression improvement is a useful narrow result, but this is a known, small development set; it does not establish broad numeric generalization. The validation/final gap also demonstrates that six draft-selection cases are insufficient to guarantee improvement. There is no basis to claim the additional training made Petya generally smarter.

For follow-up work, preserve this candidate as evidence for isolated numeric extraction, expand both dialogue diversity and validation coverage, and reserve new final cases. Do not route arbitrary chat or Jira drafts through it on the basis of the 17/18 numeric score. Application prompts, model settings, live sampling and MCP behavior were not changed.
