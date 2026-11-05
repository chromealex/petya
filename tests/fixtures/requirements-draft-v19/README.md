# Broader adaptation feasibility

The v18 development diagnosis does not establish restarting from the unadapted base as a cure. This initial v19 step probes the feasibility of expanding the existing rank-8 LoRA from thirteen to all thirty-two blocks using four longest existing training dialogues. It tests finite gradients and memory use only. Parent weights must match on load and newly introduced B matrices must be zero, as checked by the unchanged v7 trainer.

Probe weights are not a candidate. No quality gain or causal claim follows from a successful gradient probe. A full training experiment must start again from the selected v18 parent with independently frozen data and complete retention checks. Production prompts, sampling, services and MCP remain unchanged.

The probe completed all four updates with finite losses in 15.8 seconds, adapting 14,548,992 parameters and peaking at 33.31 GiB. Parent/data/weight hashes passed. This establishes feasibility only; a broader full experiment and fresh quality checks are still required.

## Frozen full experiment

The full experiment starts from v18 `question-adapter`, never the probe artifact. It adapts all 32 blocks for one epoch at 0.000005, seed 42. The 913 presentations comprise 569 familiar targets (all prior 469 plus 100 v18 checks), 36 previous diverse variants twice, 32 new semantic variants three times, sixteen prior diverse checks four extra times, 64 numeric rehearsal cases and 48 negative sorts. The 32 variants balance sending revocation, independent field reversals, known/unknown recipients and channels, approved export choices, exact open/closed boundaries, direction and duplicates, privacy/scope, and token lifetime/reuse without invented authentication.

The selected tokenizer's actual `input_ids` plus reference completion fit within 271 tokens at maximum (limit 512). Reference schemas, task-specific system messages, history roles, target consistency and historical prompt separation were checked. The tokenizer returns a BatchEncoding by default; count its input_ids rather than mapping keys. `verify_data.py` validates frozen data without GPU work.

Reserve 84 structured cases and sixteen independently worded diverse dialogues before any inference. Run base, immediate parent and historical v8 structured baselines, plus the immediate parent on the diverse set, then full training and 569-case acquisition evaluation sequentially. Candidate fresh inference follows a committed retention decision. Every compared answer, manual semantic judgment and paired regression must be preserved. If acquisition-only repair is necessary, freeze it before use and do not inspect candidate fresh answers first.

Complete preservation of old requirements and independent checks without regressions remain necessary. These synthetic tests, especially greedy fixed histories, do not establish broad reliability or runtime readiness. Runtime integration, normal-sampling generated multi-turn behavior and final artifact verification remain outstanding before petya-v1 release. This intervention changes data and adaptation depth together and cannot establish an isolated causal explanation.

`verify_artifact.py` checks actual safetensors coverage, finite values and provenance. The expansion adapts MLP projections in all 32 blocks and query/key/value/output projections in the eight full-attention blocks. It does not adapt the recurrent linear-attention projections. The probe contains 256 finite tensors and 14,548,992 trainable parameters. This distinction prevents describing the experiment as full-weight fine-tuning or adaptation of every attention projection.

## Baselines before candidate evaluation

The immediate v18 parent passes 84/84 structured cases: 36 requirement drafts, 20 numeric-bound cases, 24 sorts and four general checks. The unadapted base passes 55/84 and historical v8 passes 44/84 under the same criteria. These are independent inputs for this round, not a comparison to the counts from differently worded previous rounds.

On the sixteen diverse fixed-history dialogues, the parent passes only 7/16. Failures include revoked sending, an independently canceled field replacement, invented exercise content, missing manual export, omitted exclusions, missing no-rounding, absent requested sorted output, and ambiguous reversal of editor recipient/sender roles. The editor case is conservatively failed because permission to the editor to send does not unambiguously preserve permission to send to the editor. All raw answers, manifests, explicit non-blind judgments and answer hashes are saved under `results/`. Equivalent prose is accepted; exact JSON equality is not the semantic pass criterion.

The full-depth candidate is still training. No candidate fresh evaluation or release decision follows from these baseline results.

`verify_results.py` rechecks all 268 baseline answers against their reserved datasets, actual adapter/config hashes, declared inference settings and raw-answer review hashes. It recomputes exact/schema scores and checks semantic-review coverage and aggregate totals. Five corruption tests in `test_result_evidence.py` reject substituted weights, declared reference leakage, changed raw answers, falsified scores even after the file hash is refreshed, and missing semantic judgments. These checks validate evidence consistency, not the truth of a human semantic judgment or the bytes of the full base model; final release provenance must verify the base separately.

## Completed full-depth training

The full run completed all 913 updates in 2,380.3 seconds (39.7 minutes), peaking at 35,822,122,332 bytes (33.36 GiB). All losses and 256 saved tensors are finite. `adapter/` contains the original full-run artifact, SHA256 `05a004a70d6f86a9ae15f7e3c43bbf99f5b76816b88e340d6c203348f8bff563`. Parent, training data, configuration, parameter count and actual tensor coverage passed `verify_artifact.py`; details are in `adapter-verification.json`.

The ordinary-reload acquisition evaluation is running. This original artifact has not yet passed the 569-case retention gate, has not been selected for independent candidate evaluation and is not a release. Preserve it even if a later acquisition-only repair becomes necessary.

## Acquisition result and frozen repair

The original full-depth adapter retained 566/569 familiar cases after ordinary reload (560 exact JSON matches, six reviewed equivalents). Three failures remain: the print task omits the explicit search exclusion; the timetable export invents an unresolved time-format requirement; and the protocol notification has a procurement heading although procurement is excluded. Raw answers, manifests, hash-bound judgments and corrections are preserved. No candidate fresh inference has occurred.

`prepare_repair.py` freezes a short 196-step acquisition-only pass from the original 32-block adapter at learning rate 0.0000025, seed 42. It repeats each of the three failed references twelve times and includes 32 existing semantic variants, sixteen prior diverse dialogues, 64 numeric and 48 sort rehearsal cases. Every repair prompt/target already occurs in the original training set; both fresh sets remain disjoint. The full 569-case retention gate must pass again before selection. Use `verify_artifact.py --repair` for the resulting artifact. This repair has not yet been trained or validated.
