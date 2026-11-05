# Qwen3.5-9B numeric decision adapter

This experiment actually trained LoRA weights for the Qwen3.5-9B text model on Apple silicon. It is an isolated MLX candidate for Petya 0.8.3. The active Ollama profile and application builds were left untouched. The adapter is in MLX format; loading it into Petya's Ollama runtime was not tested.

The task is to extract a named quantitative decision from a Russian discussion into five fields: open/final, lower and upper bounds and their inclusivity. An absent boundary must be null. The answer is a decision record, not a complete Jira issue. The 64 synthetic training records cover eight topics with eight decisions per topic. Sixteen separately authored evaluation records cover four other topics and were frozen before training. No real chats, bookmarks or user credentials are included.

The MLX base is mlx-community/Qwen3.5-9B-4bit, revision 8b2b98c00a6b4d291155e4890773ca8f769aee53. We froze the base and updated 237,568 parameters across the V projection, attention output and MLP down projection of the last full-attention block. Two shuffled passes, 128 Adam updates, batch size 1, rank 8, scale 2, learning rate 0.00015, seed 42. Cross entropy was computed only on the assistant completion and its end token. Adapter weights are checked for finite values and nonzero LoRA B factors. The saved adapter was loaded in a fresh process for evaluation.

| Exact records on 16 held-out notes | Running Ollama baseline | MLX baseline | Same MLX base with adapter |
|---|---:|---:|---:|
| Valid bare JSON and all five values correct | 12 | 7 | 12 |
| Correct after also accepting Markdown-wrapped JSON | 12 | 12 | 12 |

The matched MLX comparison isolates the effect of the adapter. The separate Ollama baseline uses Petya's installed qwen3.5:9b, /api/chat, no examples, thinking disabled, temperature zero, seed 42 and 120 output tokens. MLX uses greedy generation with a 120-token limit, the base tokenizer's no-thinking chat prefix and the same messages. Only the system and user messages from holdout.jsonl are passed to the models. Strict scores reject wrong types, missing or surplus keys, and non-JSON output. The fence-tolerant score is a secondary diagnostic. Individual answers and field comparisons are in results.json. Mean completion loss over the first eight steps was 0.082 and over the last eight 0.001; this is training loss only.

The adapter fixes several status errors but also changes some previously correct decisions. For example, it excludes 20 from “верхний предел в двадцать пакетов”, and marks one deferred decision final despite returning null bounds. It tied the deployed baseline and the fence-tolerant MLX baseline in this small test. General dialogue, other skills and complete drafts were not evaluated. This candidate is not selected for deployment.

## Reproduction

From this directory, use Python 3.12 on Apple silicon with mlx 0.32.4, mlx-metal 0.32.4, mlx-lm 0.32.2, transformers 5.22.1 and tokenizers 0.23.3. BASE should point to the pinned Hugging Face snapshot. Output paths for new training and evaluation runs must be fresh. The checked-in adapter can be evaluated directly.

```sh
python build_data.py
python experiment.py train "$BASE" ./new-adapter
python experiment.py evaluate "$BASE" ./base-output.jsonl
python experiment.py evaluate "$BASE" ./candidate-output.jsonl --adapter ./new-adapter
```

The checked-in adapter directory contains the reloadable weights, configuration, full training loss log and hashes for the data and weights. Semantic generalization should be checked on a fresh holdout before considering any rollout.
