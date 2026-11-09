# Varied conversational state corrections

The v19 replay preserves all 569 familiar targets and 84 structured fresh checks but fails eight of sixteen diverse checks, including two lost parent successes. The unadapted base passes only three of those sixteen under the same complete-requirement criterion, so restarting from base is not established as a remedy. This experiment continues from the preserved v19 replay and broadens conversational language rather than only renaming entities in the existing templates.

Thirty-two authored training dialogues cover revoked/restored delivery, recipient-specific permissions, quoted commands, independent field cancellations, canceled cancellations, additive fields with literal labels, exact filenames, unresolved export columns, complete sorted lists, open/closed numeric boundaries, code lifetime/single use, topic return, display-versus-storage scope, unselected recipients and already-resolved formats. Four sorting dialogues share a controlled form; the remaining examples use varied dialogue structure and wording. Assistant proposals must not be mistaken for approved user requirements. The final completion contains the full agreed state without invented questions.

The 989 presentations include all 669 historical targets once (569 prior acquisition plus the now-inspected 100 v19 checks), the 32 authored dialogues four times, 32 existing balanced variants, 112 numeric/sort rehearsal examples and three extra copies of the sixteen inspected diverse cases. The previous ordinary-reload gate demonstrated that full rehearsal can preserve familiar targets; it did not establish generalization. Training stays at all 32 blocks, rank 8, learning rate 0.000001, seed 42 and one epoch with the unchanged v7 trainer. This adapts MLP projections in all blocks and attention projections in eight full-attention blocks, not all weights or recurrent attention projections.

`prepare_checks.py` separately authors twenty fresh dialogues before inference, plus twenty numeric-bound checks, twenty-four negative sorts with duplicates and four deterministic general checks. These 68 cases are disjoint from training and every historical fixture prompt. They must not be trained on or used for repairs before selection. They are synthetic and non-blind, not proof of broad reliability. The previously reserved generated-history application conversations remain separate and untouched.

`verify_data.py` checks hashes, role order, target schema, consistent answers for duplicate prompts, retention inclusion, literal reference names, historical separation and parent bytes. `token-length-check.json` records actual tokenizer lengths: training max 274, fresh drafts max 252 and numeric/general checks max 155 tokens including reference completion, all within the unchanged 512-token training limit.

Freeze the data and protocol in Git before any inference. First capture the immediate parent's two fresh baselines. Then train once and evaluate all 669 familiar cases after ordinary reload. Review every non-exact draft and enforce the predeclared literal checks. Only after a complete retention pass and a committed selection may the candidate be evaluated on the 68 fresh cases. Every parent success must survive; improvement and all remaining runtime/generated-dialogue/package gates are required before release. If a gate fails, preserve the evidence and do not describe petya-v1 as released.

The experiment changes language coverage and rehearsal weights together; it cannot identify an isolated causal mechanism. Production prompts, ordinary sampling, app settings and MCP interfaces are unchanged by these fixtures.

## Frozen parent baselines

The immediate parent passes 43/48 numeric/sort/general checks: all twenty bounds and four general checks pass, while five negative-sort outputs lose signs, add duplicates or substitute values. On the twenty authored drafts it passes 11/20 under explicit complete-requirement review and the existing literal rule. Failures include mixed-up independent replacements, retained unapproved export fields, a missing sorted result, contradictory boundary inclusion, an incomplete heading, a changed recipient exclusion, reversed project scope, a revoked rename and an invented claim that the indefinite lifetime had not been discussed. Awkward but unambiguous wording is accepted; contradictory or missing requirements are not.

All parent responses, manifests, hash-bound judgments, aggregate decisions and file provenance are saved under `results/`. `evidence.py` recomputes outcomes and checks frozen data/weights, inference settings, reference exclusion and semantic-review coverage. Six tests include the valid baseline and rejection of changed reviews, missing judgments even with refreshed file hashes, substituted weight identity, declared reference leakage and wrong answer-review hashes. The numerical score does not replace inspecting the recorded judgments.

Training has started from the frozen protocol. These baseline results did not alter the committed training data or reference targets. No candidate fresh answers have been generated.

## Completed training artifact

The frozen 989-step run completed in 2,577.34 seconds with peak allocated memory
of 36,055,883,992 bytes. `adapter/` preserves the weights, configuration and full
training record. Weight SHA-256 is
`dd9f7986513c53b05994abf0e48d2a2ca6ed0bc5e5fa46ee764b1fb61c7dda85`.
The artifact verifier confirms all 256 tensors are finite, 14,548,992 trainable
parameters, expected architecture coverage, and matching frozen parent/data and
training settings. The repository copies were compared byte-for-byte with the
training output. This is artifact validation only. The full familiar-case
evaluation is in progress; no selection or candidate fresh inference has occurred.

## Completed familiar-case evaluation

Ordinary reload evaluation completed all 669 cases: 646 exact matches and 15
semantically equivalent drafts, for 661/669 passing. All 23 non-exact drafts
were reviewed with answer-bound hashes; literal checks also apply. The eight
failures concern all-version sending scope, reversed replacement direction,
invented field requirements, an applied canceled replacement, an invented font
code, an unnecessary address question, editor sender/recipient confusion, and
contradictory full-version permission wording. Raw responses, inference manifest,
reviews, decisions and evidence hashes are under `results/acquisition*`.

The retention gate failed. This artifact is not selected, and no candidate
fresh answers have been generated. The fresh 68-case comparison remains reserved
for a candidate that first preserves all familiar requirements. These are
synthetic non-blind results, not release qualification.

## Full-rehearsal repair protocol

`prepare_repair.py` recomputes the failed retention result and freezes 1,085
presentations: the unchanged 989 training rows plus twelve additional copies of
each of the eight inspected failure targets. Three failures previously received
one exposure each; five received four. They now receive thirteen and sixteen
respectively, while every previous presentation remains included. The target
answers are unchanged. This tests increased corrective exposure with continued
full rehearsal, not a proven causal explanation of the failures.

`repair-protocol.json` pins the immediate v20 parent, training/data hashes,
32-layer rank-8 recipe, one epoch, seed 42 and learning rate 0.000001.
Duplicate prompts have consistent targets and all familiar cases remain covered.
The new data contains only previously token-length-checked messages, so the
274-token maximum remains within the 512-token limit. Fresh prompt disjointness
is checked again; fresh references are not used as training targets.
Regeneration is byte-identical. The artifact verifier accepts an explicit
`--protocol` and rejects the original artifact against the repair protocol.
The full 669-case retention gate remains required before selection, followed by
the untouched 68-case comparison and separate runtime/live/package release gates.

## Completed full-rehearsal repair artifact

The frozen 1,085-step repair completed in 3,190.42 seconds with peak allocated
memory of 36,068,671,984 bytes. `repair-adapter/` preserves weights, configuration
and all 1,085 recorded losses. Its weight SHA-256 is
`9d6ff318cafa9466fdee69a36f7fac3e4c640352cf203e058d0a0f139b0bc4d7`.
The verifier confirms finite values in all 256 tensors, expected architecture
coverage, 14,548,992 parameters, and the frozen repair parent/data/settings.
Repository copies match the training output byte-for-byte.

Ordinary reload evaluation of all 669 familiar cases is running. This artifact
is not selected: integrity does not establish retention or improved quality.
No candidate fresh inference has occurred. The complete retention review must
pass before committing a selection and using the reserved 68 fresh cases.

## Completed repair retention and selection

The repair passes all 669 familiar cases after ordinary reload: 660 exact
responses and nine semantically equivalent drafts. All nine differences were
reviewed against the original role histories with answer-bound hashes and the
existing literal rules. All eight failures of the preceding artifact now match
their reference JSON exactly, and no familiar-case regression remains.
`results/repair-acquisition*` preserves raw outputs, manifest, judgments, full
decisions and provenance. `selection.json` pins this artifact and evidence
before candidate fresh inference.

This establishes retention on the familiar synthetic set only. The reserved
68-case independent comparison, generated live dialogues, application/runtime
integration and package checks remain required before release.

## Independent repair evaluation: release gate failed

The selected repair passes 42/48 fresh numeric/sort/general checks, compared
with the frozen parent's 43/48. All twenty bounds and four general checks pass,
but only 18/24 negative sorts pass: one previously correct descending case
loses signs, and five earlier sorting failures persist.

Complete review of all twenty fresh drafts yields 12/20 versus the parent's
11/20. Five gains (export, explicit sorted result, resolved export format, project
scope and unset code lifetime) coexist with four regressions (payment
field/permission conflation, supposedly identical copies, added-versus-replaced
fields and one-use code scope). Independent
replacement cancellation, added-versus-replaced fields, boundary prose,
recipient restrictions and exact-name scope still fail. Raw responses and
answer-bound judgments are preserved in `results/repair-*`; the computed
comparison lists every gain and regression.

The independent preservation gate failed despite 669/669 familiar retention.
The selection remains a record made before inference, not a release approval.
Do not install or release this artifact. Broader generalization remains
unproven, and these now-inspected cases cannot serve as a fresh holdout for
a subsequent repair.

## Post-hoc unadapted-base diagnosis

Using the same evaluator and all 68 now-inspected cases without an adapter,
the base scores 44/48 checks and 3/20 fully reviewed drafts. All twenty bounds
and four general checks pass. Compared with the base, the repair gains one
sorting answer but loses three, while retaining all three passing drafts and
gaining nine. `results/base-*` preserves complete raw responses, manifests,
answer-bound reviews and the item-level comparison.

A blind reset to base would therefore lose useful draft behavior without fixing
sorting or cancellation generally. Conversely, perfect familiar retention did
not guarantee generalization: training improves some behavior and degrades
other behavior on these inspected cases. This post-hoc comparison does not
isolate a specific training update as the cause. A subsequent experiment needs
broader contrastive coverage of independent decisions and negative-number
ordering, full rehearsal and a newly frozen independent holdout. These 68 cases
are diagnostic/familiar evidence from now on, not a reusable fresh holdout.
