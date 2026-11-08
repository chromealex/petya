# Petya Andromeda D5: less new data

D2, D3 and D4 trained D1 on all 720 generated correction dialogues and all lost familiar cases (782, 783 and 780 of
801), whatever the rehearsal weight or learning rate. D5 keeps the familiar cases once and adds only the six correction
families D1 gets wrong, 20 dialogues each (921 presentations instead of 1,521), to test whether the amount of new data
pushes the old skills out. `prepare.py` freezes `train.jsonl` and `protocol.json`; `execution.json` is what
`Train Petya.app` runs into `~/.petya-train/andromeda-d5`.

The families were chosen from D1's results on the 54 generated held-out drafts, so that set is not blind to the
choice; the v22 cases and the familiar set are.
