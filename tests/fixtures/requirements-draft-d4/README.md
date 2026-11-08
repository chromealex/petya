# Petya Andromeda D4: D3 data at half the learning rate

D2 and D3 learned the new corrections (24 → 39 of 54 generated held-out drafts) but forgot familiar cases (787 →
782 and 783 of 801); rehearsing the familiar cases twice instead of once barely helped. D4 trains the same
2,322 presentations as D3 from D1 at learning rate 5e-7 instead of 1e-6, so the stage moves D1 less. `prepare.py`
copies the D3 `train.jsonl` and freezes `protocol.json`; `execution.json` is what `Train Petya.app` runs into `~/.petya-train/andromeda-d4`.
