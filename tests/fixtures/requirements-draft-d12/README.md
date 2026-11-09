# Fresh dialogues for D12

D11 uses the last unused dialogues (61–80) of the D2 families. `make_fresh.py` makes 717 new ones: the same nine
families, training pools and phrasings with another seed offset, so the objects, names, numbers and phrasing
combinations differ; prompts already in the D2 training set or in any evaluation set are dropped. 
## D12 stage

D11 was rejected, so D12 continues D10 (the group's D). D11 trained only the four families D10 still erred on and
lost what D10 had fixed; D12 trains all nine families evenly: the 801 familiar cases once plus the first 20 fresh
dialogues of each family (981 presentations, lr 5e-7). `Train Petya.app` runs `execution.json` into
`~/.petya-train/andromeda-d12`. Gate: replaces D10 only if not worse than D10 on any set (46/54, 28+8/42, 797/801).
