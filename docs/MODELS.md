# Petya's own models

Petya runs a group of models named after a constellation (Andromeda, Bootes, Cassiopeia, …):

- **R** — router: picks the function and restates the request (today the base model with
  `src/semantic-tools.cjs` and `src/capabilities.cjs`);
- **A** — answers and conversation; optional, downloaded separately when turned on, otherwise R answers;
- **D** — requirement drafts (the fine-tuned adapter).

The version names the parts: **Petya Andromeda R1-A1-D1**. Retraining a part raises only its number (D2, R2);
a new group name starts when the set of parts or a base model changes; the group is stable once every part passes
all gates (familiar, held-out, live dialogue, runtime, packaging).

Weights are kept only on GitHub: the `models` branch of `chromealex/petya` has `<group>/group.json` and one folder
per part (`andromeda/D1/`) with `model.json` (role, base and revision, hashes, evaluation, status) and the adapter;
each part with weights is a release tagged `<group>-<part>` (`andromeda-d1`), downloadable without a token since
the repository is public (`https://github.com/chromealex/petya/releases/download/andromeda-d1/<file>`). D1 is the
v21 fourth repair adapter. D2 and D3 (new correction dialogues, one and two rehearsals of the familiar cases) were
rejected for forgetting familiar cases and are published as pre-releases `andromeda-d2` and `andromeda-d3`.

Training keeps here what the next stage needs: data, protocols, scripts, evidence, the training environment in
`~/.petya-train/env` (recreated from `scripts/train-requirements.txt` when missing; `/tmp` does not survive a restart), the base model in the Hugging Face cache and the parent adapter of the next stage.
Checkpoints and adapters of finished or rejected stages are deleted locally once their part is on GitHub.
