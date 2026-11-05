# Second Qwen3.5-9B decision adapter

The second candidate was trained from the same pinned MLX base as decision-lora-9b, using its unchanged training implementation. The first candidate was retained for comparison. The new dataset combines the original 64 records with 72 new records: 36 numeric boundary cases and 36 explicit questions about whether the endpoint itself is allowed. The 136 records receive two shuffled passes, 272 optimizer steps. Rank, target layers, seed and learning rate match the first experiment. The saved adapter was reloaded in a separate process.

The new holdout was generated before training, using three different topics and numbers, with six outcomes per topic. Each outcome is tested as both extraction and endpoint membership, for 36 structured tasks. Four more notes test complete Jira drafts. No demonstration turns are used during evaluation. All three models use the same pinned MLX base, greedy generation and no-thinking template. Structured outputs are capped at 120 tokens and drafts at 450. Scores accept a single Markdown JSON wrapper but require exact types and values.

| Result | Base | First adapter | Second adapter |
|---|---:|---:|---:|
| Exact boundary records | 14/18 | 15/18 | 12/18 |
| Endpoint membership | 18/18 | 18/18 | 18/18 |
| Draft coverage | 2/4 | 2/4 | 1/4 |

The endpoint questions had a ceiling effect. Training on them did not improve extraction on this holdout. Draft coverage was manually reviewed with method names visible, requiring both fixed requirements, correct boundary and status and no question reopening the approved count. Ancillary implementation questions were ignored. The second model's strict cloth-length draft repeated text, reopened the exclusive boundary and exhausted the output cap with invalid JSON. Its queue draft mixed the operator and customer as the recipient. Both adapters reopened the already approved count of 33 frames.

These probes measure narrow generalization and give no basis for activating the second candidate. The task and generation format of the draft probes differ from the supervised structured extraction task. The three topics and repeated templates also limit independence.

Run prepare.py to reproduce the datasets. Use the first experiment's documented Python environment and pinned base snapshot. From the project root, run this directory's run.py with train or evaluate, the base path, a fresh output path and optionally an adapter directory for evaluation. score.py takes a directory containing base.jsonl, v1.jsonl and v2.jsonl and an output report path. Its automated scores cover structured records; manual draft judgments are preserved in results.json. The adapter directory contains the weights, configuration, data hash, artifact hash and all step losses.
