# Decision-contrast training data (preparation stage)

The v20 repair retained all 669 familiar cases but failed independent preservation:
42/48 numeric/sort/general cases and 12/20 drafts, with one numeric and four
semantic regressions relative to the frozen v19 parent. An unadapted-base
comparison showed 44/48 checks and 3/20 drafts. Neither resetting to base nor
repeating a small failure list is established as a sufficient repair.

`prepare_contrasts.py` authors 208 training-only rows in `contrasts.jsonl`:

- 16 independent field-replacement dialogues, covering all four retained/canceled combinations across four identifier sets.
- 16 field-replacement versus transmission-permission dialogues with independently varied decisions.
- 16 two-recipient permission dialogues with identical-content constraints and all four permission combinations.
- Eight addition-versus-replacement dialogues preserving literal field names.
- Eight single-use-code dialogues separating code reuse from repeated receipt of an item, with agreed and unresolved lifetimes.
- 144 sorts from twelve lists, two directions, three phrasings, and single-turn or clarification histories. Lists vary in length, duplicates, signs and input ordering; outputs use actual numeric sorting.

Every draft contains five user turns and four intervening assistant turns. The
system prompt is unchanged from the historical draft task. Reference targets
are authored/computed, never copied from model predictions. All four combinations
within each two-decision family have identical surrounding context except the
controlling decisions and their corresponding targets. This is supervised
contrast coverage, not a contrastive-loss implementation or a claim of generalization.

Validation confirmed unique prompts and IDs, alternating roles, schema-valid
reference answers, exact required names, deterministic regeneration and a maximum
of 311 full-sequence tokens with the actual base tokenizer (512-token training
limit). Token counts measure integer IDs after rendering the no-thinking chat
template, not the length of a tokenizer result dictionary. See
`contrast-validation.json` for the frozen data digest.

## Frozen experiment

`prepare_holdout.py` independently authors sixteen five-user-turn drafts plus
48 numeric/sort/general checks. The numerical set covers twenty boundary
decisions, 24 sorts and four general checks. The prose set covers independent
cancellations, permission versus field changes, copy identity, restored consent,
addition versus replacement, code-versus-item scope, unresolved lifetime, exact
names, display-only changes, quoted instructions, negative sorting, boundary
prose, unselected recipients and a withdrawn rename.

`prepare.py` assembles 737 familiar cases (the previous 669 and all 68 now-inspected
v20 cases), each once; all 208 contrasts twice; and 64 earlier varied examples
once. Total: 1,217 training presentations. It verifies reference schemas, role
alternation, duplicate-target consistency, required literals, full familiar
coverage and exact holdout-prompt disjointness from all prior fixture datasets.
This does not claim the underlying task distributions are independent.

`protocol.json` pins the v20 repair parent and data hashes, 32 layers, one epoch,
seed 42 and learning rate 0.000001 with the unchanged rank-8 trainer. Complete
sequence maxima are 311 tokens for training, 270 for holdout drafts and 166 for
other checks, below the 512-token training limit. Regeneration is byte-identical.

Capture parent baselines after this data/protocol commit. Training must preserve
all 737 familiar cases before a committed selection and candidate holdout
inference. Every parent holdout success must survive alongside improvement.
These data preparations do not establish model quality. Generated live
conversations, application/MCP runtime integration and packaging remain separate
release requirements. The completed training artifact is documented below; quality evaluation remains pending.

## Frozen parent baseline

The immediate parent scores 42/48 on numeric/sort/general checks: all twenty
bounds and four general checks pass, while six sorts fail. Complete review of
the sixteen five-user-turn drafts yields 7/16 passing. Failures include both
independent cancellation directions, a changed no-send object, contradictory
copy permissions, code/login scope, omitted login exclusion, an omitted sorted
result, incomplete recipient restrictions and a revoked rename.

All raw responses, inference manifests, answer-bound judgments and computed
outcomes are under `results/parent-*` and `results/baseline-*`. The training data
and protocol remain exactly as committed before parent inference. These results
are the comparison baseline, not evidence of a trained candidate or release.

## Completed training artifact

The frozen 1,217-step run completed in 3,332.89 seconds with a recorded peak
allocation of 40,202,158,804 bytes. `adapter/` preserves the weights, adapter
configuration and complete training metadata. The adapter SHA-256 is
`655079664b43830a2a64254f2647f10f0d5d9ec7322932fbf4f32f12a56e6008`.

`results/adapter-verification.json` records verification against the frozen
parent, training data and recipe: 256 finite tensors, 14,548,992 trainable
parameters, MLP adapters in all 32 blocks and attention projections in eight
full-attention blocks. Recurrent attention projections were not adapted.
This is artifact integrity evidence, not an answer-quality result. Familiar-case
inference is complete and failed retention, as documented below; no candidate
selection or independent candidate holdout result is claimed. Live dialogue, runtime integration and packaging remain open.

## Familiar-case evaluation: retention failed

The complete run covers 737 cases: 705 exact JSON matches and 23 semantically
equivalent drafts, for 728/737 passing after literal checks. All 32 nonexact
answers have answer-hash-bound reviews in `results/acquisition-review.json`.
The preserved manifest and recomputed summary bind the answers to the actual
adapter and frozen dataset. This is a non-blind authored-data evaluation.

Nine failures remain: unapproved columns become excluded columns; the old payment
code replacement is omitted; a scheme recipient becomes an authorized actor;
independent field replacements become contradictory; an export default is
invented; the upper numeric inequality is reversed; code-versus-item scope is
blurred; no-send and no-automatic-recipient restrictions are omitted; and an
exact section name is lost with an invented content constraint.

The candidate is not selected for the fresh holdout. The sixteen fresh drafts
and 48 checks remain unused by this candidate. Repair must preserve all familiar
cases before selection; independent improvement, live dialogue and release
integration remain unproven.

## Frozen full-rehearsal repair

`prepare_repair.py` recomputes the reviewed retention failures, verifies the
frozen input hashes and preserves all 1,217 original training presentations.
It adds twelve extra copies of each of the nine failed references, yielding
1,325 presentations and thirteen exposures per failed case. References and
system prompts are unchanged. Duplicate targets agree, every familiar prompt
remains represented, and no fresh holdout prompt is included. Regeneration is
byte-identical. Since all added rows already occur in the original training
file, its measured 311-token maximum remains unchanged.

`repair-protocol.json` pins the completed v21 adapter, one epoch, 32 layers,
seed 42 and learning rate 0.000001 with the unchanged rank-8 trainer. This
full-rehearsal repair follows the earlier retention recovery recipe; it does
not establish generalization. Require all 737 familiar cases before committed
selection and candidate inference on the still-unused 64-case holdout.

## Completed full-rehearsal repair artifact

`repair-adapter/` preserves the completed 1,325-step repair and its training
metadata. Training took 3,829.43 seconds with a recorded peak allocation of
40,213,430,804 bytes. The adapter SHA-256 is
`1828551b4a06eea7d38475a098daeebd07f27124a149e8c076f67747b9bda3da`.

`results/repair-adapter-verification.json` records the CPU tensor inspection:
256 finite tensors, 14,548,992 parameters, MLP adaptation in all 32 blocks and
attention projections in eight full-attention blocks. The verifier also checks
the frozen parent/data hashes, training settings and all 1,325 finite losses.
This verifies artifact integrity only. Retention evaluation is in progress;
no selection, independent improvement or release qualification is claimed.

## Full-rehearsal repair retention result

The completed repair evaluation passes 734/737 familiar cases: 716 exact
answers and 18 reviewed equivalents. All 21 nonexact drafts were reviewed
against their source dialogues, with answer hashes, recalculated schema and
exact scores, literal checks and full coverage recorded in
`results/repair-acquisition-*`. All nine targeted failures recover, but three
previously passing drafts regress: the sorted output is omitted, list-of-contracts
export loses its list scope, and the INN/unapproved-field prohibition becomes
malformed and conditional. The aggregate gain does not satisfy retention.

Do not select this adapter for the untouched 64-case candidate holdout. Further
repair and full retention verification are required before independent inference;
live dialogue and release integration remain unproven.

## Second full-rehearsal repair protocol

`prepare_repair2.py` recomputes the reviewed 734/737 result and preserves all
1,325 prior training presentations. It adds 12 unchanged reference copies for
each of the three regressions, giving 1,361 presentations. Parent weights are
the completed first repair. One epoch at learning rate 0.000001, seed 42,
32 layers and rank 8 remain unchanged. The frozen protocol records data and
parent hashes, consistent targets, full familiar coverage and no fresh-prompt
overlap. No reference or system prompt is rewritten.

This is a non-blind retention repair, not independent evidence of improvement.
All 737 familiar cases must pass before selection and evaluation on the
untouched 64-case holdout. Live dialogue and release integration are still pending.

## Second repair infrastructure failure

The first attempt exited with a Metal GPU Hang Error after the last logged
step 400 of 1,361. The trainer saves final weights only, so no new adapter or
retention result exists. The raw failure log and protocol-bound status are in
`results/repair2-training-failure.*`. The underlying cause is unconfirmed. A
fresh small MLX matrix computation succeeds after process exit; this is only
a recovery probe. Do not infer a quality regression or successful repair from
this failed attempt. A new verified training attempt is still required.

## Checkpointed retry of the same second repair

`train_checkpointed.py` retains the frozen second-repair data, parent, Adam
settings and seeded order. `repair2-retry-execution.json` pins the implementation
and original protocol. Every 128 steps it atomically publishes weights, Adam
moments/counter, finite loss history, elapsed time and the deterministic order
identity, retaining two committed generations. Resume checks hashes, tensor
coverage/shapes/dtypes, the original recipe, source code and library versions.
Only zero-dropout runs are supported: PRNG advancement during training is
rejected rather than silently reset. Final adapters are separate from resumable
checkpoints and are written only after all steps finish.

The real-MLX CPU test compares uninterrupted training with a new-process resume:
weights, Adam state and losses agree exactly. Changed recipes, corrupt bytes,
random-state advancement and incomplete staged writes are checked. This small
model test does not prove full Qwen training equivalence or repair the unknown
Metal failure. The actual retry first stops at step 16, then resumes the same
1,361-step order, before artifact inspection and all 737 retention cases. No
candidate holdout inference is authorized by checkpoint integrity alone.

The actual retry saved step 16 and a new process reported restoring all 16
steps with Adam state. `results/repair2-retry-resume-check.json` pins that
checkpoint and records its 256 adapter tensors, optimizer step and losses.
The first block mean matches the failed attempt (0.01575). The resumed process
subsequently failed after the last logged step 112; it is no longer running.
This is not evidence of final quality or release readiness.

## Checkpointed retry failure

`results/repair2-retry1-failure.*` records the second Metal failure and the
OS diagnostic indicating a firmware-detected GPU lockup. The underlying cause
is unconfirmed. The step-16 checkpoint still matches its committed SHA-256;
there is no final adapter and no new retention evaluation. The related
[MLX watchdog report](https://github.com/ml-explore/mlx/issues/3267) describes
a different error on different OS versions and is not proof of this cause.
No workaround or additional GPU training attempt has been applied.

## GDPx availability

The user confirmed that they have no access to the GDPx execution package.
No complete runnable environment/grader package was located in the earlier
public-source search. Public rollout transcripts alone do not reproduce the
benchmark. No GDPx run or score is claimed, and the local retention/holdout
suites must not be labeled GDPx results. This limitation does not qualify or
disqualify a candidate on the separate local release checks.

## Bounded Metal timeout experiment

The process-only `AGX_RELAX_CDM_CTXSTORE_TIMEOUT=1` experiment completed
steps 17–128 and exited successfully at the requested boundary. The committed
`results/repair2-timeout-probe.*` binds the raw log to a verified checkpoint:
771 finite tensors, 256 adapter tensors, Adam step 128, unchanged training
identity and exact preservation of the initial 16 losses. The initial invocation
omitted two flags and was rejected by the identity guard before training; the
corrected invocation used both `--attention` and `--mlp`.

This is evidence of one successful bounded continuation, not proof of a fix
for the underlying GPU lockup or improved answer quality. Continue from this
checkpoint to all 1,361 steps with the same process-only environment override,
then verify the final adapter and run the full 737-case retention gate before
any candidate holdout inference.

## Final continuation binding

Before retention inference, run both `verify_artifact.py` with
`--protocol repair2-protocol.json` and `verify_continuation.py`. The latter
requires explicit `--adapter`, `--checkpoints`, `--trainer`, `--helper`,
`--data`, and `--parent` paths; `--output` saves its result. Use the original
`train_checkpointed.py`, `checkpoint.py`, and `repair2-train.jsonl`.
It verifies on CPU that the completed final weights exactly match the latest
hash-checked checkpoint, the Adam step and finite loss history cover the full
training order, and source/data/parent/base-config identities match. This
complements architecture/protocol verification; neither is a quality score.

`test_continuation.py` exercises a valid binding and rejects altered weights
with recomputed hashes, an incomplete Adam counter, an unfinished epoch, a
nonfinite optimizer tensor, and changed trainer bytes. These synthetic fixtures
validate the verifier, not the still-running candidate.

## Queued familiar evaluation

`queue_repair2_retention.py` implements the one active run's post-training
sequence from `repair2-retention-execution.json`. `--validate-only` checks frozen
source/data hashes and unused output paths without waiting or loading a model.
The actual run waits on the existing trainer's exclusive lock, then revalidates
inputs, checks architecture/frozen recipe and exact final-checkpoint binding,
and finally invokes the unchanged v8 evaluator on all 737 familiar cases.
Missing or incomplete training output fails before inference. It holds the lock
through evaluation, refuses existing outputs, and never restarts training.

This queues only retention capture. Semantic review, a complete passing gate,
committed candidate selection and independent/live quality checks remain manual
subsequent steps. A waiting process is not a completed evaluation or a passing
score. No holdout inputs are part of this execution plan.

## Completed second repair

The checkpointed continuation completed all 1,361 steps and exited with code 0.
`repair2-adapter/` preserves the actual resulting adapter, configuration and
full finite loss history. Its SHA-256 is
`f0f9bc277c9c6f3fc96d0e741ac9611fbadf928c56dcab700c9b1fcacf45e3c5`.
Both architecture/recipe verification and exact final-checkpoint binding passed:
256 adapter tensors, 14,548,992 parameters, Adam step 1,361 and matching weights.
Results and the successful continuation log are under `results/repair2-*`.

The run resumed at steps 16 and 128, preserving Adam and loss history. The
process-only timeout override was applied after step 16. One successful run
does not establish causality or guarantee that the previous GPU failure cannot
recur. Recorded successful training time is approximately 3,905 seconds and
peak memory is 40,257,804,380 bytes; discarded failed attempts are excluded.

The queued evaluator has started the 737 familiar cases. No passing score,
candidate selection, holdout improvement or release qualification is claimed
at this point. The application catalog remains empty.

## Second repair retention result

All 737 familiar cases were captured and rebound to the saved adapter and
frozen dataset. Recomputed scoring plus review of all 12 non-exact answers
yields **735/737**: 725 exact matches, 10 equivalent paraphrases, two failures.
The three targeted previous failures (complete sort output, export scope and
unconditional rejected-field prohibition) now pass. Two new regressions prevent
selection: `v21-previous-draft-literal` adds the meaningless requirement
“Цирюлицу не выполнять”; `v21-previous-draft-unset-lifetime` produces the
nonsensical summary “Веродополнение кодом”. Correct literal names or a correct
description alone do not excuse these degraded task outputs.

Raw answers, manifest, hash-bound reviews, complete decisions and provenance
are in `results/repair2-acquisition*`. The candidate is rejected at the familiar
gate. No candidate holdout or live-dialogue inference has been run.

## Third repair protocol

`prepare_repair3.py` freezes the unchanged 1,361 presentations plus twelve
additional copies of each of the two inspected failures (1,385 total). The
original reference removes the invented sentence and names the equipment-receipt
code task clearly. Neither prompts nor references are rewritten. All familiar
cases remain represented with consistent targets; the 64 held-out prompts do
not overlap. Parent weights are the completed second repair, at learning rate
0.000001, one epoch, seed 42 and all 32 adapted layers.

`repair3-execution.json` pins the same checkpoint implementation and process-only
timeout override. First stop at step 16 and verify the actual checkpoint, then
resume with Adam before launching `queue_repair3_retention.py`. Its frozen plan
runs the two artifact checks and the entire 737-case gate; no fresh inference
or automatic release selection occurs. This remains a non-blind correction
attempt, not evidence of generalization.

The third repair completed its initial 16 steps and saved 771 finite checkpoint
tensors with Adam step 16. The checkpoint hash, source/data/parent identity and
actual maximum sequence length (310 tokens) were verified. A new process
reported restoring all 16 steps with Adam state. The separate retention queue
was launched only after observing the trainer's live session and held lock.
`results/repair3-initial-*` records this execution checkpoint; final training,
retention and quality remain pending.

## Third repair training completion

The third repair completed all 1,385 steps and exited successfully. The preserved
`repair3-adapter/` weights have SHA-256
`99a053b1d537c4b88cbb2b55fe599999fcd9f13dd94cd9bc98c42171a0bac25f`.
Architecture/recipe verification and exact final-checkpoint binding passed:
256 adapter tensors, 14,548,992 parameters, matching weights and Adam step 1,385.
The run resumed at step 16, preserving Adam and loss history, with the frozen
process-only timeout override. Successful training took about 4,040 seconds
and peak memory was 40,262,210,652 bytes. Evidence is in `results/repair3-*`.

The queued evaluator started all 737 familiar cases after both integrity checks.
No retention score, candidate selection, held-out improvement or release
qualification is claimed here. The application catalog remains empty.

## Third repair retention result

All 737 familiar cases were captured and verified against the preserved adapter
and frozen dataset. Recomputed scoring and review of all ten non-exact answers
yield **736/737**: 727 exact matches, nine equivalent paraphrases and one failure.
Both targeted previous failures now exactly match their references: the literal
name task no longer invents a requirement, and the equipment-code task has a
meaningful summary while leaving the unagreed lifetime open.

Selection is rejected because `v21-previous-draft-addition` regresses: it retains
Region in one sentence but then adds Oblast “instead of Region”, contradicting
the user's rejected replacement. Raw answers, manifest, hash-bound reviews and
complete decisions are in `results/repair3-acquisition*`. No candidate holdout
or live-dialogue inference has been run.

## Fourth repair protocol

`prepare_repair4.py` preserves all 1,385 previous presentations and adds twelve
copies of the inspected addition-versus-replacement failure (1,397 total). The
unchanged reference retains Region and District and adds Oblast separately.
The full 737-case rehearsal is retained with consistent targets and no overlap
with the 64 held-out prompts. Parent weights are the completed third repair;
learning rate, one epoch, seed and adapted layers remain unchanged.

`repair4-execution.json` freezes the checkpointed recipe. Stop after 16 steps,
verify the actual checkpoint, then resume with Adam. Start the frozen retention
queue only after observing the resumed trainer's live session and lock. Both
artifact checks and all 737 familiar cases are required; no fresh inference or
automatic model qualification occurs. This is a non-blind repair attempt.

The fourth repair completed its initial 16 steps and exited successfully. The
actual checkpoint hash, all 771 finite tensors, Adam step 16, source hashes,
parent weights/configuration and training data were checked. The continuation
process reported restoring 16 steps with Adam state. The retention queue was
started only after observing the live trainer and its held writer lock.
`results/repair4-initial-*` preserves this evidence; final training and answer
quality remain pending.

## Fourth repair completion

The fourth repair completed all 1,397 steps and exited with code zero.
`repair4-adapter/` preserves the resulting adapter, configuration and training
metadata. Its SHA-256 is
`e4750435ed3c09b138b0cb735c227ce074e9377612b3b147a657a885531a12d0`.
Both artifact checks passed: architecture and frozen recipe, then exact final
checkpoint weights with complete Adam state and loss history. Successful
training took 4,074.61 seconds with peak memory of 40,257,773,888 bytes.

`results/repair4-completion.json`, the completed training log and both
verification reports preserve the evidence. The queued evaluator has started
all 737 familiar cases. No retention score, candidate selection, held-out
improvement or release qualification is claimed yet.

## Fourth repair retention and holdout selection

The completed run passes all 737 semantic retention cases: 732 exact matches
and five reviewed answers. Every nonexact answer was compared with its full
source dialogue and bound by answer hash; literal checks also passed. The
addition-versus-replacement regression now exactly matches the reference.
One language-quality regression remains: `v15-repeat` uses an incorrect seconds
inflection while preserving all requirements. This is explicitly recorded and
is not hidden by the semantic retention score.

`results/repair4-acquisition*` preserves raw results, manifest, reviews and
recomputed decisions. `selection.json` selects this exact adapter for the frozen
64-case holdout only. Preserve every parent success and demonstrate improvement;
no independent improvement, live-dialogue success or release readiness is yet
claimed.

## Fourth repair held-out result

Both held-out captures completed successfully. Recomputed scoring and review
of all sixteen complete draft dialogues show 45/48 checks versus 42/48 for the
parent, and 9/16 drafts versus 7/16. Checks have four gains and one regression
(`fresh-sort-1-1-1`); drafts have four gains and two regressions
(`fresh-exact-caption`, `fresh-display-only`). These failures respectively invent a restriction on other names and lose the
explicit value-transfer prohibition.

The adapter is rejected for release despite aggregate improvement. Evidence,
answer-bound reviews and every comparison are in `results/repair4-*`. The
inspected holdout is now development evidence; another repair requires a newly
frozen independent set. Live dialogue and release integration remain open.
