# Frozen transfer evaluation of the round-5 adapter

This experiment updates no weights. Compare the previously selected round-5 epoch-4 adapter with its pinned base on new inputs. `manifest.json` freezes the adapter hash, data hash, base revision, greedy no-thinking inference and output limits before evaluation.

The numeric set has 12 pairs (24 records). Basic cases test changed inclusive/exclusive decisions, cancellation, unrelated numbers and removal of an old interval. Extended cases introduce zero, negative and fractional values, and closed/open/mixed intervals. Both members of a pair share earlier context and differ in the final decision. Score each exact typed JSON record and separately report pairs with both answers correct. Pairs are correlated; 24 records are not 24 independent task families. The JSON representation intentionally preserves only explicit bounds, with no implicit nonnegative lower limit for counts.

Eight draft dialogues each have seven user/assistant turns before the reference answer. They cover revoked renaming, recipient and field changes, unsettled format, revised exact interval, an explicit notification condition, print-only scope, unrelated topics and one remaining open field. Reference completions are removed before generation. This is newly authored synthetic development evidence: some families deliberately target failure modes discovered in earlier rounds, so the set is not an externally independent benchmark or real-user sample. Exact prompt non-overlap with the candidate's training data is asserted.

Draft review requires valid JSON, all explicit decisions and exclusions, correct recipient and conditions, no invented scope in the summary or description, and questions only for explicitly unresolved decisions. Semantically equivalent phrasing is accepted. Omitted requirements, speculative implementation requirements and unrelated questions fail. Review will be manual and non-blind, with raw answers and individual reasons preserved. Numeric scoring is automatic. Do not change data, select another checkpoint, or train on the outputs during this experiment. No result here authorizes automatic deployment; the candidate already failed the previous full-draft gate.

Run `prepare.py` to reproduce the frozen test inputs. In the existing MLX environment, run `run.py BASE NEW_OUTPUT.jsonl [--adapter ADAPTER_DIR]`, then `score.py INPUT.jsonl OUTPUT.json`. The score script does not assign semantic draft grades. Application settings, prompts, sampling and MCP behavior are unchanged.

## Completed comparison

Data and protocol were committed in `e63a9c3` before model inference. Both runs completed on the same local pinned base and environment as round 5. No training, checkpoint reselection, prompt change or test edit occurred. Reference completions were excluded. All 64 raw answers are preserved in `results/`; checkpoint and data hashes were reverified after evaluation.

| Measure | Base | Round-5 epoch-4 adapter |
|---|---:|---:|
| Exact numeric representation, basic | 10/12 | 11/12 |
| Exact numeric representation, extended | 8/12 | 9/12 |
| Exact numeric representation, all | 18/24 | 20/24 |
| Both records correct within a pair | 6/12 | 8/12 |
| Strict seven-turn draft coverage | 2/8 | 4/8 |
| Valid draft JSON | 8/8 | 8/8 |

The adapter improves exactly two numeric records and regresses none on this set: it correctly marks a revoked decision as open and an agreed fractional minimum as final. Both gains are decision-status corrections. Eighteen numeric records pass in both methods; four fail in both. This does not show that the adapter fixed the remaining boundary-direction or inclusivity errors.

Two of the four shared failures are representation-contract failures rather than different allowed integer values: “more than 205 steps” is returned as inclusive 206, and “at most zero errors” as exactly zero. The frozen prompt and scorer require explicit boundaries without normalization or an inferred nonnegative lower limit; scores therefore remain failures under that contract. The other two failures are substantive: temperature above -12 is inverted into an upper bound, and the lower boundary of (36, 64] becomes inclusive. No post-hoc semantic score replaces the precommitted exact score.

Draft judgments are non-blind and strict, with per-case reasons in `draft-review.json`. In particular, an omitted explicit exclusion fails even if positive required fields are listed: the base drops the no-amount constraint, while the adapter drops the no-manager-recipient constraint. These are coverage judgments, not a claim that those outputs explicitly demanded the excluded behavior. Both have more decisive failures elsewhere. The adapter changes check code plus error text into error code alone, replaces the print task with “Russian interface,” and makes displaying a sensor conditional on temperature while omitting the technician. JSON validity does not establish correctness.

The modest improvement on these synthetic probes is useful evidence of some transfer. It does not overturn the previous final result (2/6 draft coverage versus 3/6 for base), and these small correlated samples do not support claims of general superiority or statistical significance. Retain the candidate for research only. No runtime configuration, application prompt, live model, or MCP behavior was changed; no new adapter was trained. Future training data should explicitly address lost fields, role/exclusion preservation, scope substitution, negative bounds and mixed inclusivity, and must be evaluated on new reserved cases after using these probes for development.
