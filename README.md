# Petya models

Each model version is a folder `petya-vX.Y/` here; pushing it publishes a GitHub release with that tag
(`.github/workflows/model-release.yml`). Weights are stored on this branch (plain git, each adapter is under 100 MB) and in the release
assets only; the project folder and `main` keep training data and evidence, not weights.

| Version | Name | Status | Base | Adapter SHA-256 | Notes |
|---|---|---|---|---|---|
| 1.0 | Andromeda | experimental | mlx-community/Qwen3.5-9B-4bit @ 8b2b98c | e4750435…a12d0 | v21 fourth repair; v21 holdout 45/48 checks, 9/16 drafts; v22 holdout 27/30, 6/12 |

Versions: every training stage adds 0.1 (1.1, 1.2, …), whatever its result, so each run can be compared and
rolled back (a rejected stage is published too, as a pre-release with its evaluation); only `status: stable`
is a full release. The first version that passes all gates (familiar, held-out, live dialogue, runtime, packaging) becomes 2.0.

A new version: train (Train Petya), evaluate against the previous version, add `petya-vX.Y/` with
`model.json` (hashes, base, evaluation, status) and `NOTES.md`, then push this branch.

Names are constellations in alphabetical order, one per version (the next stage takes the next name, whatever its
number): Andromeda, Bootes, Cassiopeia, Draco, Eridanus, Fornax, Gemini, Hercules, Indus, Lyra, Monoceros, Norma,
Orion, Pegasus, Reticulum, Scorpius, Taurus, Ursa, Vela, Volans; then Aquila, Cygnus, Delphinus, … in the
same order. The name is `codename` in `model.json` and part of the release title.
