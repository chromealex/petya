Petya language model, version 1.0 «Andromeda» — the best evaluated adapter so far (v21 fourth repair).

- Base: `mlx-community/Qwen3.5-9B-4bit` @ `8b2b98c00a6b4d291155e4890773ca8f769aee53` (not included; downloaded from Hugging Face).
- Adapter: LoRA rank 8 over 32 layers, `adapters.safetensors` + `adapter_config.json`. Hashes in `model.json`.
- Evaluation: v21 familiar 737/737; v21 held-out 45/48 checks, 9/16 drafts; v22 held-out 27/30 checks, 6/12 drafts.
- Status: experimental. Live dialogue, runtime and packaging qualification are still open.

Model versions are stored only here, as release assets; the project folder keeps the training data and evidence, not the weights.
