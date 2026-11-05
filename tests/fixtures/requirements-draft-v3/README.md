# Requirement-preservation supervision, round 3

Status: the third adapter was trained, reloaded, evaluated, and rejected. No adapter from this round was deployed.

The second adapter failed six of eighteen boundary extractions and three of four complete drafts. `error-review.json` preserves those extraction failures and all four draft comparisons from the previous report. Draft failures include reopening a settled count, promoting a proposal into a provisional requirement, confusing recipients, and repetitive malformed output. The proposal promotion also occurred in the base and first adapter. These observations motivate full-draft supervision instead of the endpoint-membership task, which all three models already passed.

`train.jsonl` contains 48 synthetic examples: eight topics with six boundary states each (exact, exclusive upper/lower, inclusive upper/lower, and unresolved). Seven conversational turns precede the supervised final draft. The dialogue cancels a historical value, establishes the current decision, preserves a named recipient and a required field, and excludes a private field. Final decisions have no clarification questions; unresolved decisions retain one relevant question. These are constructed examples, not actual user messages or exports from Important.

`holdout.jsonl` contains 12 examples across two separate topics and new current values, using a different five-turn dialogue template. Reference answers are stored for review and MUST be removed from the model input during evaluation. Topic IDs and current values do not overlap training. The same six boundary families recur, so this small synthetic holdout cannot establish broad conversational improvement. Previous draft probes are development regressions now that their errors have guided this dataset.

Evaluation rubric: valid JSON; correct current bound and inclusivity; no restored obsolete value; no tentative value treated as approved; correct recipient and required field; preservation of the privacy restriction; no reopening settled decisions or invented requirements. Judge semantic coverage rather than exact reference wording. Report each criterion and inspect truncation separately. Compare the base, first adapter, and next candidate under identical generation settings; retain previous structured extraction probes to detect regressions. Do not activate a candidate on the strength of training loss alone.

Run `python3 tests/fixtures/requirements-draft-v3/prepare.py` from the project root to reproduce data and structural checks. Run `validate.py BASE_SNAPSHOT` with the existing training environment for token-length checks; `validation.json` records the results against the pinned Qwen3.5-9B tokenizer. The validator explicitly requests token IDs because Transformers may otherwise return a BatchEncoding mapping. All examples fit the existing trainer's 512-token limit. No runtime prompt, MCP behavior, or application setting was changed.

## Completed training and evaluation

The original 48-record `train.jsonl` received two shuffled passes (96 optimizer steps) from the same pinned MLX Qwen3.5-9B-4bit base as round 1, revision `8b2b98c00a6b4d291155e4890773ca8f769aee53`. The unchanged trainer uses seed 42, learning rate 0.00015, rank 8, scale 2, zero dropout, and 237568 trainable parameters in the last full-attention block. Loss is applied only to the final assistant completion. The adapter was loaded in a separate process for evaluation. Training and weight hashes were verified against `adapter/training.json`.

| Check | Base | First adapter | Third adapter |
|---|---:|---:|---:|
| Exact structured boundary records | 14/18 | 15/18 | 10/18 |
| Valid draft JSON schema | 12/12 | 7/12 | 12/12 |

All models used the same no-thinking template and greedy generation, capped at 450 tokens for drafts and 120 for boundaries. This deterministic experiment does not change live-dialogue sampling. `results.json` contains all 90 raw answers and automatic scores. Manual non-blind review found that none of the third adapter's 12 drafts preserved all requirements. Eleven omit the numeric decision and privacy restriction; the remaining open-folder draft omits the required case index and clarification question. JSON validity is not a quality score. Baseline semantic coverage was not assigned an aggregate score.

The training target data also had an evidence-grounding defect: scope phrases such as “in the cassette” and “in the archive block” appeared in reference answers but were absent from user turns. This undermines the objective of teaching the model not to invent requirements. The original data and results remain immutable evidence of this failed run; semantic evaluation must not require those absent scope phrases. The candidate still fails requirements that were explicitly present, and numeric regression alone also rejects it.

## Corrected data, not yet trained

`grounded/` contains separately generated corrected data. Each initial user message now explicitly states the numeric target, including its scope. A generation assertion verifies that the target appearing in the reference description is present in the user message. Use `prepare.py --grounded` to reproduce it. Token validation with the pinned tokenizer passes, with a maximum of 281 training tokens and 270 evaluation tokens. These revised evaluation cases are development probes, not a new untouched holdout, because their predecessor responses have been inspected. A fresh independently worded holdout is needed before claiming generalization.

Reproduce the historical run with `run.py train BASE NEW_ADAPTER_DIR` and `run.py evaluate BASE NEW_OUTPUT.jsonl [--adapter ADAPTER_DIR]` in the existing MLX environment. `--data DIRECTORY` selects another dataset directory, including `grounded/`. Evaluation removes the final reference assistant message. It also includes the 18 structured regression cases from round 2. Run `score.py OUTPUT_DIRECTORY` with `base.jsonl`, `v1.jsonl`, and `v3.jsonl` in that directory; manual findings are separate additions to the persisted report. `validate.py BASE [DATA_DIRECTORY]` checks token lengths. No corrected-data training or production activation occurred in this round.
