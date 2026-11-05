# Diagnosed correction rehearsal and balanced training

The v6 diagnostic measures teacher-forced prediction errors on its eight failed correction targets. Numeric token accuracy of roughly 94–97% still misses critical digits, nulls and inclusivity; draft mean losses are materially higher. Average training loss therefore did not establish acquisition. The eight corrections received only two presentations each in v6, mixed into 128 examples at a reduced learning rate.

A same-architecture control starts from v6, canonicalizes JSON (description first for drafts), and repeats the eight targets for 16 passes at 0.00015. After reload it achieves 8/8 exact JSON matches. The control is deliberately memorization, not generalization. Its code, weights and answers are preserved. Multiple factors changed together (exposure, learning rate and serialization/order), so this identifies a workable acquisition regime without proving a single exclusive cause. The original masking/reload audit remains relevant; no architectural expansion was needed for the control.

The full candidate starts from the stronger v5 parent, not the memorization control or rejected v6. It trains three fixed passes over 248 rows representing 152 distinct previously reviewed examples. Drafts repeat three times, numeric examples once, with two extra copies of each difficult correction. This gives 128 draft and 120 numeric presentations per epoch. JSON serialization is consistent; drafts place grounded description before questions and summary. Prompt text, base architecture and three rank-8 LoRA projections remain unchanged. Optimizer state is reset. The intervention combines task balancing, correction rehearsal and completion formatting; causal attribution to one factor is not possible.

`test.jsonl` freezes 16 new numerical cases, 8 new seven-turn drafts and 8 narrow general-ability smoke checks before full training. These synthetic cases target known families and are not a broad intelligence benchmark. `protocol.json` fixes training and acceptance rules. The general checks use exact constrained outputs (JSON numbers/lists parsed, plain text matched) and must not be interpreted as an exhaustive chat evaluation. Reference answers are excluded from generation. Final answers will not be used to tune this candidate.

Reproduce data with `prepare.py`. In the existing MLX environment run `train.py BASE DATA NEW_ADAPTER --parent PARENT --epochs EPOCHS --lr RATE`; training requires parent-weight equality before updates. Use `evaluate.py BASE DATA NEW_OUTPUT.jsonl [--adapter ADAPTER]` for inference. `diagnose.py BASE ADAPTER OUTPUT.json` diagnoses v6 correction targets. Full-draft semantic scores are manual and non-blind, unlike exact numeric scores. No production model, application prompt, live sampling, MCP interface or release is modified by these research scripts.

## Subsequent experiments

All automatic counts below concern constrained numeric JSON, not full draft semantics. Draft coverage is manually reviewed and is not equivalent to exact wording. Previously inspected test sets become development evidence for subsequent interventions.

- Balanced SFT learned seven of eight familiar corrections, but on the first reserved set scored 13/16 numeric and 2/8 complete drafts; v5 scored 12/16 and 5/8. It was rejected.
- Adding query/key projections to the last block scored 13/16 numeric and 4/8 complete drafts on that now-development set. This did not establish improvement over v5.
- Omission preferences improved development draft coverage to 6/8, but failed a reserved acceptance set: numeric 10/16 versus v5 14/16, with malformed/repeated JSON and invented requirements. It was rejected. General development prompts were included in rehearsal and are not independent checks.
- Near-length factual-contradiction preferences also failed: numeric 11/16 on the secondary set, with negation inversions and repeated draft content. The earlier repetition cannot therefore be attributed solely to preference-answer length.
- Ordinary SFT across the final two blocks learned 8/8 familiar corrections exactly after reload, but scored 18/24 numeric on fresh confirmation cases versus v5 23/24. New drafts still omitted constraints. It was rejected.
- The final depth experiment trains five blocks, including two full-attention blocks, using the same 280-row rehearsal data and fixed three epochs at 0.00005. Differentiable recurrent operations are enabled only for training; evaluation reloads standard inference code. The longest-example gradient probe was finite and used about 9.5 GB peak memory on a 96 GiB machine. Its separate final check was committed before inference.

Preference experiments use a reference-relative logistic objective based on [Direct Preference Optimization](https://arxiv.org/html/2305.18290v3), combined here with chosen-answer and retention cross-entropy. They are mixed experimental objectives with synthetic contrasts, not human feedback or an exact reproduction of standard DPO.

The evidence distinguishes acquisition from transfer: weight reload and completion masking work, and all eight corrections can be memorized, but this does not ensure retention of every requirement in new multi-turn requests. The small, repetitive synthetic dataset and narrow adaptation are plausible limitations; these experiments do not prove a single causal explanation. Low average token loss hides critical negation, number, inclusion and omission errors. No candidate is automatically published as petya-v1.

## Final depth result

The separately reserved `deep-check.jsonl` gives:

| Model | Exact numeric | Complete drafts (manual) | General smoke |
| --- | --- | --- | --- |
| Base | 12/16 | 4/8 | 8/8 |
| v5 parent | 11/16 | 3/8 | 7/8 |
| Five-block adapter | 12/16 | 5/8 | 8/8 |

This passes the predeclared narrow improvement gate. It is **not release readiness**: four numeric failures and three draft failures remain. The synthetic sample is small, related to training task families, and manual review is non-blind; no statistical significance or broad intelligence claim follows. `final-results` contains all raw answers, per-case reasons and aggregate counts. For the calibration draft, “only on failure” entails no success notification, and excluding the error number is grounded in the user rejecting that substitution. Semantic equivalence must be credited consistently, rather than requiring reference wording.

Remaining issues include inverted negative bounds, lost inclusivity, final/open status, a contradictory STEP double negative, unclear retention of directory content, and weakening a price prohibition while returning incomplete draft schema. Seven corrected references and actual failures are preserved in `next-corrections.jsonl` for a future round; they were not used to train the evaluated candidate. After such use, this check must be treated as development evidence and replaced for confirmation.

A subsequent development-only diagnostic halved every LoRA contribution toward the base (scale 2 to 1, unchanged weights). It scored 11/16 numeric, 5/8 drafts and 8/8 general on the now-inspected set and was rejected. Its raw answers and exact configuration delta are preserved; no new independent success is claimed from it.

The five-block adapter trained 2,457,600 parameters for 840 steps in about 432 seconds, with 9.53 GB peak MLX allocation. `deep-adapter/training.json` records data/parent/weight hashes. Standard inference reload was used in all final comparisons. Keep this artifact experimental; production selection and petya-v1 release remain unchanged. The next release decision requires broader fresh cases, including natural real-user discussions, and checks for regression beyond these narrow tasks.

Final standard reload also reproduces all 8/8 familiar corrections exactly (`final-results/deep-corrections.jsonl`). This establishes acquisition on those training examples, not independent generalization.
