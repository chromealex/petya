# Petya Andromeda D2: new correction dialogues

D1 (the v21 fourth repair) was repaired three times in v22 by adding copies of failed familiar cases. Each repair
fixed its target and broke another case; the one that passed all 801 familiar cases did worse on new cases
(32/42 against 33/42). D2 changes the data instead: `generate.py` writes new dialogues of nine kinds of correction
that kept failing (a cancelled item next to a kept one, permissions given, withdrawn and restored per recipient, two
recipients with different permissions, an added field that replaces nothing, exact literals, a change limited to the
screen, a quote that is not an instruction, an open recipient or duration that becomes a question, single-use codes).

- `new-train.jsonl` — 720 generated dialogues (80 per kind); `holdout.jsonl` — 54 with disjoint objects, names,
  literals and part of the phrasings.
- `train.jsonl` — every one of the 801 familiar cases once plus the 720 new dialogues (1,521 presentations).
- `prepare.py` checks the targets, prompt disjointness and pool disjointness and writes `protocol.json`: parent D1,
  the same trainer, rank 8, 32 layers, lr 1e-6, one epoch, seed 42 — only the data changes.
- `execution.json` is what `Train Petya.app` runs (`scripts/train-plan.json` points to it): D1 on the 54 held-out and
  the 801 familiar cases, the D2 training with checkpoints, both artifact checks, then D2 on the 54 held-out, the
  42 v22 cases (D1: 27/30 checks, 6/12 drafts) and the 801 familiar cases, into `/tmp/petya-andromeda-d2`.

Gate: D2 replaces D1 only if the 54 held-out drafts improve with no D1 success lost, the 42 v22 cases are not worse
with no D1 success lost, and familiar retention is not below D1. Non-exact drafts are reviewed against their
dialogue. A rejected D2 is still published as a pre-release with its evaluation (docs/MODELS.md).

## Result: D2 rejected, D1 stays

Reviews (hash-bound) are in `results/*-review.json`, the comparison in `results/summary.json`.

| | D1 | D2 |
|---|---|---|
| 54 generated held-out drafts | 24 | 39 |
| 42 v22 cases (30 checks + 12 drafts) | 27 + 6 | 27 + 7 |
| 801 familiar cases | 787 | 782 |

D2 learns the trained kinds of correction (fifteen more new dialogues right) but loses four D1 successes on the
generated set, two on v22 (`v22-new-cancel-two` reversed, `v22-new-quote` permits sending the quote) and ten
familiar cases, one of which (`v18-revoke-after-grant`) says sending is allowed after the permission was withdrawn.
The gate rejects it; it is published as the pre-release `andromeda-d2` with this evaluation. The next stage keeps
the new data and weights the familiar rehearsal more, to keep the gains without the forgetting.
