# Petya Andromeda D3: D2 data with a doubled rehearsal

D2 learned the new corrections (24 → 39 of 54 generated held-out drafts, 33 → 34 of 42 v22 cases) but forgot ten
familiar cases (787 → 782 of 801). D3 keeps the 720 new dialogues and the held-out sets of D2 and rehearses the 801
familiar cases twice (2,322 presentations, shuffled by the trainer), from D1 with the same recipe. `prepare.py`
freezes `train.jsonl` and `protocol.json`; `execution.json` is what `Train Petya.app` runs into
`/tmp/petya-andromeda-d3` (D1 results are reused from `../requirements-draft-d2/results`).
