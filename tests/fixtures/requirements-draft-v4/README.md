# Corrected-data training after a successful memorization control

Status: trained, reloaded, evaluated, and rejected. Nothing was deployed.

The preceding `lora-training-audit` experiment verified completion alignment and demonstrated 4/4 exact responses on deliberately memorized examples after reload. This round therefore tested whether longer training on the grounded 48-example dataset would generalize. The same pinned `mlx-community/Qwen3.5-9B-4bit` revision `8b2b98c00a6b4d291155e4890773ca8f769aee53` was trained from scratch with the unchanged round-1 LoRA implementation: seed 42, rank 8, scale 2, zero dropout, learning rate 0.00015, 237568 trainable parameters in the last full-attention block. The dataset contains 192 rows (four copies of each of 48 distinct records); the trainer's two epochs give eight effective passes and 384 updates. This is a longer-training experiment, not additional data diversity. `adapter/training.json` records the step losses and verified data/weight hashes.

Eight new dialogues were authored and frozen before this run, without using model responses to edit their prompts or reference answers. They use new topics, numbers, wording and interaction patterns: a correction to an inclusive bound, refusal of an invented minimum, cancelled old values, a rejected provisional duration, an unrelated topic, and a change of recipient. All numeric scopes appear in the actual input. These are synthetic development evaluations, not real-user evidence. They share task families with training and are not a broad independent benchmark.

All three models were evaluated in separate processes using identical no-thinking greedy generation, at most 450 tokens per draft and 120 per structured regression. Reference assistant answers were excluded from prompts. `results.json` preserves all 78 raw outputs and per-case judgments. The 18 structured cases are the unchanged round-2 regression set; draft cases are new and cannot be directly compared to the round-3 draft aggregate.

| Measure | Base | First adapter | Fourth adapter |
|---|---:|---:|---:|
| Exact numeric boundary extraction | 14/18 | 15/18 | 12/18 |
| Valid draft JSON schema | 8/8 | 5/8 | 8/8 |
| Strict complete-draft coverage | 5/8 | 2/8 | 2/8 |

Manual coverage review was not blinded. It requires valid JSON, all explicit final decisions, correct recipient and privacy fields, no tentative value turned into a requirement, no invented task scope in either summary or description, and questions limited to the explicitly unresolved issue. Unrequested ancillary questions fail this stricter criterion too (notably the first adapter's book draft). Harmless paraphrases and explicitly excluded historical values do not fail. The base's open-duration answer was rejected for calling the proposed duration the current temporary value. Raw outputs and reasons are provided so these judgments can be audited; the automatic numeric regression independently rejects the candidate.

The fourth adapter exactly reproduced all four familiar control examples (`training-control.json`), yet introduced labels, trays and tiles from the training topics into unrelated tasks. In two new answers it omitted most substantive requirements. Its low training loss therefore measures memorization, not reliable generalization. This evidence supports investigating training diversity and broader task retention; it does not isolate the causal effect of dataset grounding versus training duration, since both changed from round 3. More repeated passes alone did not meet the acceptance gate.

Reproduction from the project root, using the existing MLX environment:

- `python3 tests/fixtures/requirements-draft-v4/prepare.py` recreates the expanded training set and frozen evaluation dialogue definitions.
- `python tests/fixtures/requirements-draft-v3/validate.py BASE tests/fixtures/requirements-draft-v4` checks token lengths (maximum 281 training, 231 evaluation).
- `python tests/fixtures/requirements-draft-v3/run.py train BASE NEW_ADAPTER_DIR --data tests/fixtures/requirements-draft-v4` trains.
- Use the same runner with `evaluate BASE NEW_OUTPUT.jsonl --data tests/fixtures/requirements-draft-v4 [--adapter ADAPTER_DIR]` for each model.
- `python3 tests/fixtures/requirements-draft-v4/score.py OUTPUT_DIRECTORY` scores files named `base.jsonl`, `v1.jsonl`, and `v4.jsonl`. This regenerates automatic results; manual coverage findings in the committed report are a separate review.
- `python tests/fixtures/lora-training-audit/run.py evaluate BASE OUTPUT --adapter ADAPTER_DIR` checks the four known examples.

The next training attempt should first broaden grounded dialogue content and task formats and establish a separate validation set for selecting training duration, while reserving fresh cases for final evaluation. The present test cases are now development evidence. Application prompts, model selection, and MCP behavior remain unchanged.
