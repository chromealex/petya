# Petya Andromeda D6: blends of D1 and D3

D2–D5 trade one skill for the other: D3 learns the new corrections (39 of 54) and loses familiar cases (783 of 801),
D5 keeps them (789) and learns nothing new (21). D6 trains nothing: `scripts/merge_adapters.py` blends D1 and D3
exactly, ΔW = (1−λ)·ΔW(D1) + λ·ΔW(D3), as one rank-16 adapter for λ = 0.3, 0.5 and 0.7, and `Train Petya.app` evaluates
each on the same four sets into `~/.petya-train/andromeda-d6`. D3 comes from the published pre-release
`andromeda-d3` (checked by SHA-256).

## Result: rejected

| | D1 | D3 | λ 0.3 | λ 0.5 | λ 0.7 |
|---|---|---|---|---|---|
| 54 generated held-out drafts | 24 | 39 (22 exact) | 23 | 17 | 20 |
| 42 v22 cases (30 checks + 12 drafts) | 27 + 6 | 27 + 6 | 27 + 3 | 27 + 3 | 27 + 4 |
| 801 familiar cases | 787 | 783 | **791** (no D1 loss) | 789 | 791 |

Every blend keeps the familiar cases, even better than D1, but D3's gain on the new corrections does not survive:
the blends have 0–3 exact held-out drafts against D3's 22. Non-exact drafts were reviewed by meaning
(`results/*-review.json`). No blend is published as weights; each is reproducible exactly from D1 and D3 with
`scripts/merge_adapters.py`.
