# Petya Andromeda D4: D3 data at half the learning rate

D2 and D3 learned the new corrections (24 → 39 of 54 generated held-out drafts) but forgot familiar cases (787 →
782 and 783 of 801); rehearsing the familiar cases twice instead of once barely helped. D4 trains the same
2,322 presentations as D3 from D1 at learning rate 5e-7 instead of 1e-6, so the stage moves D1 less. `prepare.py`
copies the D3 `train.jsonl` and freezes `protocol.json`; `execution.json` is what `Train Petya.app` runs into `~/.petya-train/andromeda-d4`.

## Result: rejected

| | D1 | D3 | D4 |
|---|---|---|---|
| 54 generated held-out drafts | 24 | 39 | 27 (11 D1 successes lost) |
| 42 v22 cases (30 checks + 12 drafts) | 27 + 6 | 27 + 6 | 27 + 6 |
| 801 familiar cases | 787 | 783 | 780 (12 lost, 5 gained) |

Half the learning rate learns less and forgets no less: neither the step size (D4) nor the number of rehearsals (D3)
explains the familiar losses. D1 stays the group's D; D4 is the pre-release `andromeda-d4`.
