# Petya Andromeda D7: D3 plus a familiar-only rehearsal

D3 learned the new corrections (39 of 54 generated held-out drafts, 22 of them exact) and lost a few familiar cases
(783 of 801). D6 got the familiar cases back by blending D3 toward D1, but the new skill went with it. D7 starts from
D3 and rehearses only the 801 familiar cases once at learning rate 5e-7, so D3 is pulled toward the familiar data
rather than toward D1's weights. `execution.json` is what `Train Petya.app` runs into `~/.petya-train/andromeda-d7`;
D3 is the published pre-release `andromeda-d3`, checked by SHA-256.
