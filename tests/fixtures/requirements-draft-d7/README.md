# Petya Andromeda D7: D3 plus a familiar-only rehearsal

D3 learned the new corrections (39 of 54 generated held-out drafts, 22 of them exact) and lost a few familiar cases
(783 of 801). D6 got the familiar cases back by blending D3 toward D1, but the new skill went with it. D7 starts from
D3 and rehearses only the 801 familiar cases once at learning rate 5e-7, so D3 is pulled toward the familiar data
rather than toward D1's weights. `execution.json` is what `Train Petya.app` runs into `~/.petya-train/andromeda-d7`;
D3 is the published pre-release `andromeda-d3`, checked by SHA-256.

## Result: the best D so far, not accepted automatically

| | D1 | D3 | D7 |
|---|---|---|---|
| 54 generated held-out drafts | 24 | 39 (22 exact) | **37** (14 exact) |
| 42 v22 cases (30 checks + 12 drafts) | 27 + 6 | 27 + 6 | **28 + 6** |
| 801 familiar cases | 787 | 783 | **795** (none of D1's lost) |

The strict gate (no D1 success lost) is not met: five generated held-out drafts that D1 wrote acceptably are worse
(a wrong summary, a lost «не для входа», invented document names), and three v22 drafts swap with three others.
D7 is the pre-release `andromeda-d7`; whether it becomes the group's D is the owner's decision.
