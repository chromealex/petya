# Requirements draft v22 preparation

The v21 fourth repair passed all 737 familiar semantic cases but failed the
independent preservation gate: 45/48 checks and 9/16 drafts, with one sorting
regression and two draft regressions. The complete ten failures are now
inspected development evidence, not an unused holdout.

`prepare.py` verifies the prior evidence and actual parent adapter, preserves
all previous training presentations, includes the 64 inspected cases once and
adds twelve copies of each of the ten corrected reference answers. This yields
1,581 presentations and an 801-case familiar gate. Every familiar prompt is
covered and duplicate prompts have consistent targets. `corrections.jsonl`
contains the ten full conversations with corrected final answers.

The corrections address negative sorting with repeats, cancellation scope,
invented value restrictions, contradictory transmission permissions, code
reuse versus another issued item, unresolved duration and excluded login use,
exact-name scope, and display-only changes without value transfer.

Two historical targets contain incorrect Russian seconds inflections:
`v19-repeat` says 257 seconds in the singular and `v20-repeat` does the same
for 293. Only the new generation's targets are corrected. The old evidence
remains unchanged. This target repair changes grammar, not requirements.

Training has not started. Before training, freeze a new historically
prompt-disjoint holdout, capture the parent baseline, and commit the complete
training protocol. Require full familiar retention, preservation of every
parent success and independent improvement. Live dialogue, runtime integration
and release packaging remain separate requirements.

## Frozen next evaluation

`freeze_holdout.py` creates 12 five-user-turn drafts and 30 constrained checks.
It validates role alternation, target schemas, required literal preservation,
and prompt disjointness from historical top-level fixture datasets, including
v22 training. The checks cover duplicate and mixed-sign sorting, decimal
interval endpoints, a withdrawn threshold, an exact value, and basic arithmetic.
The drafts cover separate cancellation scope, recipient-specific permissions,
revocation and restoration, code reuse versus another item, unknown duration,
literal names, display-only changes, additive fields, quoted instructions and
an unresolved recipient. These are authored synthetic conversations with fixed
assistant history, not a live-dialogue score.

`holdout-freeze.json` pins the data and semantic review rules before parent
inference. Review all parent and candidate drafts under the same rules. Commit
this freeze before baseline inference; save the complete baseline before
training. The completed baseline and training protocol are recorded below.


## Parent baseline and training protocol

The committed holdout was evaluated with the v21 fourth repair before any v22
training. All 30 checks and 12 drafts completed successfully as an inference
process. Quality is 27/30 exact checks and 6/12 semantically reviewed drafts;
all draft answers are non-exact and all twelve have hash-bound manual reviews.
Three sorting cases fail. Draft failures concern cancellation, an omitted
no-explanation requirement, an omitted no-date requirement, excluded login,
invented unrelated-file restrictions, and an absent unresolved-recipient
question. The complete outputs, manifests, reviews and recomputed decisions
are in `results/baseline-*`. Candidate evaluation must preserve each of the
33 parent successes, not merely improve the aggregate score.

`protocol.json` freezes the 1,581-step one-epoch continuation from the v21
fourth repair at learning rate 1e-6, with the existing checkpointed trainer.
All training sequences fit the unchanged 512-token limit (maximum 310).
Stop at step 16 for checkpoint validation, then resume with Adam state.
The 42 new evaluation cases remain excluded from training. The original
`preparation.json` describes the earlier preparation stage; this protocol
supersedes its pending baseline/protocol items, not the remaining release gates.


## Initial checkpoint and active continuation

The bounded initial phase completed 16 steps and exited successfully. CPU
inspection verified the checkpoint SHA, all 771 finite tensors, exact parent
weight key/shape/dtype coverage, Adam step 16, full planned deterministic order,
and training, parent, base configuration and trainer/helper hashes. The resumed
process reported `Resumed 16 steps with Adam state`; it continues the same
1,581-step run. Evidence is in `results/initial-check.json`,
`results/initial-training.txt`, and `results/resume-confirmation.txt`.
These files establish initialization and resume integrity, not completion or
answer quality. Final checkpoint verification and the full 801-case familiar
gate remain pending before candidate selection and new-case evaluation.


## Sequential retention capture

`queue_retention.py` validates frozen source/data hashes and unused output
paths, waits on the existing training writer lock, then validates the final
artifact and its complete checkpoint/Adam binding before capturing all 801
familiar cases. `retention-execution.json` pins the exact commands and sources.
It does not restart training or run independent cases. A failed stage stops
the queue; successful capture still requires full semantic review and committed
candidate selection. `--validate-only` checks the plan without inference.

The shared artifact verifier now resolves parent/data paths relative to the
selected protocol. Its CPU regression check verifies the actual v21 fourth
repair, a relocated protocol, and rejection of altered protocol-local data.
The running trainer and checkpoint implementation remain unchanged.


## First repair result and second repair

The first repair (1,641 steps from the v22 adapter) finished after one Metal GPU
failure at step 1296 and a verified resume from checkpoint 1280. The artifact and
continuation checks passed. On the 801 familiar cases 795 answers are exact; the
six non-exact drafts are reviewed in `results/repair-acquisition-review.json`
(hash-bound to the answers). Five keep every requirement. `fresh-add-not-replace`
fails: it says to keep three fields «Порт», «Причал» and «Терминал» as if all
existed instead of adding a separate new «Терминал», and its summary invents
«Locations» — the addition-versus-replacement regression seen in the fourth v21
repair. Result: 800/801, below the all-case gate; the first repair is not
selected and no holdout inference was run. The outputs and checks are copied to
`results/repair-*`, and the adapter to `repair-adapter/`.

`prepare_repair2.py` recomputes that evidence and freezes the second repair:
the unchanged 1,641-presentation rehearsal plus twelve extra copies of the one
failure (13 exposures), continuing from `repair-adapter` at learning rate 1e-6
with the same checkpointed trainer — the recipe of the v21 repairs.
`repair2-protocol.json` pins data, parent and sources. Gate unchanged: all 801
familiar cases, then the 42 frozen new cases preserving every parent success
and improving the total; live dialogue, runtime and packaging stay separate.

`repair2-execution.json` and `scripts/train_petya.py` run it on the Mac without a
terminal, from `Train Petya.app` in the project folder: initial 16 steps, resume
with Adam state (again from the last checkpoint after a GPU failure, up to four
times), artifact and continuation checks, and the familiar capture into
`/tmp/peter-v22-repair2`. Stages already done are skipped. The log is
`tests/results/train.log`; per-stage logs are in the work folder.

## Second repair result and third repair

The second repair (1,653 steps from `repair-adapter`) trained without a GPU
failure; the artifact and continuation checks passed. It fixes
`fresh-add-not-replace` (now exact), but on the 801 familiar cases 798 answers
are exact and two of the three non-exact drafts fail review
(`results/repair2-acquisition-review.json`): `fresh-revoke-transmit` loses the
ban — «Оценщику не отправка разрешена» reads as permission and drops
«разрешение отозвано» — and `fresh-quoted-instruction` keeps the requirements
but contains the broken word «сохранитьась». Result: 799/801, below the gate;
not selected, no holdout inference. Outputs and checks are in
`results/repair2-*`, the adapter in `repair2-adapter/`.

`prepare_repair3.py` freezes the third repair the same way: the unchanged
1,653-presentation rehearsal plus twelve extra copies of each of the two
failures (13 exposures each), continuing from `repair2-adapter` at learning
rate 1e-6. `repair3-execution.json` is what `Train Petya.app` now runs, into
`/tmp/peter-v22-repair3`. Gate unchanged. Each repair so far fixed its target
and broke another familiar case, so a failing third repair is a reason to
change the recipe rather than to keep adding copies.

## Third repair result and selection

The third repair (1,677 steps from `repair2-adapter`) trained without a GPU
failure; artifact and continuation checks passed. All 801 familiar cases are
exact and valid, with all 84 literal checks passing — the first v22 candidate
to meet the all-case gate. `select_repair3.py` recomputes that evidence against
the frozen data, protocol and actual adapter and writes
`results/repair3-selection.json` before any holdout inference. The adapter is
in `repair3-adapter/`, outputs and checks in `results/repair3-*`.

With the selection in place, `Train Petya.app` evaluates the 42 frozen new
cases once (`check.jsonl`, `fresh-drafts.jsonl`) with the baseline's evaluator
and settings into `/tmp/peter-v22-repair3/holdout-*`. Next: review every
draft, then compare with the baseline (27/30 checks, 6/12 drafts) — every
baseline success kept and the total improved — before live dialogue, runtime
and packaging.

## Third repair on the frozen new cases: rejected

The 42 frozen new cases were evaluated once with the selected third repair
(`results/repair3-holdout-*`, same evaluator and settings as the baseline). All
12 drafts are reviewed in `results/repair3-holdout-drafts-review.json`
(hash-bound); `results/repair3-holdout-summary.json` has the comparison.

Checks 27/30 (baseline 27/30): `v22-new-sort-0-1` is fixed but
`v22-new-sort-3-1` now adds an extra −18. Drafts 5/12 (baseline 6/12):
`v22-new-two-recipients` and `v22-new-open-duration` are fixed, while
`v22-new-screen-only` (keeps the old field instead of hiding it),
`v22-new-add-separate` (loses the addition) and `v22-new-quote` (permits
sending the layout instead of the manual) regress. Total 32/42 against 33/42,
with four baseline successes lost: the gate rejects the candidate, and
`requirements-draft-v21/repair4-adapter` stays the best checkpoint.

Three repairs in a row reached the familiar gate only by adding copies of the
failed familiar cases, and the one that passed it generalises worse on new
cases — memorisation of the rehearsal set, not better reasoning about
corrections. Another copy-based repair is not planned.
