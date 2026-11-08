# Petya Andromeda D6: blends of D1 and D3

D2–D5 trade one skill for the other: D3 learns the new corrections (39 of 54) and loses familiar cases (783 of 801),
D5 keeps them (789) and learns nothing new (21). D6 trains nothing: `scripts/merge_adapters.py` blends D1 and D3
exactly, ΔW = (1−λ)·ΔW(D1) + λ·ΔW(D3), as one rank-16 adapter for λ = 0.3, 0.5 and 0.7, and `Train Petya.app` evaluates
each on the same four sets into `~/.petya-train/andromeda-d6`. D3 comes from the published pre-release
`andromeda-d3` (checked by SHA-256).
