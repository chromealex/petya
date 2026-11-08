# Petya's own models

Petya runs a group of models named after a constellation (Andromeda, Bootes, Cassiopeia, …):

- **R** — router: picks the function and restates the request (today the base model with
  `src/semantic-tools.cjs` and `src/capabilities.cjs`);
- **A** — answers and conversation; optional, downloaded separately when turned on, otherwise R answers;
- **D** — requirement drafts (the fine-tuned adapter).

The version names the parts: **Petya Andromeda R1-A1-D8** (since 9 November 2026; D7 and D1 before). Retraining a part raises only its number (D2, R2);
a new group name starts when the set of parts or a base model changes; the group is stable once every part passes
all gates (familiar, held-out, live dialogue, runtime, packaging).

Weights are kept only on GitHub: the `models` branch of `chromealex/petya` has `<group>/group.json` and one folder
per part (`andromeda/D1/`) with `model.json` (role, base and revision, hashes, evaluation, status) and the adapter;
each part with weights is a release tagged `<group>-<part>` (`andromeda-d1`), downloadable without a token since
the repository is public (`https://github.com/chromealex/petya/releases/download/andromeda-d1/<file>`). D1 is the
v21 fourth repair adapter. D2 and D3 (new correction dialogues, one and two rehearsals of the familiar cases) were
rejected for forgetting familiar cases and are published as pre-releases `andromeda-d2` and `andromeda-d3`; D4 (D3 data at half the learning rate) learned less and
forgot as much, pre-release `andromeda-d4`. D5 (familiar cases plus only 120 dialogues of the six weak families) kept the
familiar cases (789) but learned none of the new corrections, pre-release `andromeda-d5`. D6 (exact blends of D1 and D3, no training) kept the
familiar cases (up to 791) but lost D3's new corrections; it is a recipe, not published weights. D7 (D3 plus one familiar-only
rehearsal) is the best so far — 37/54 new, 34/42 v22, 795/801 familiar — but loses five of D1's held-out successes;
pre-release `andromeda-d7`. On 9 November 2026 the owner made D7 the group's D (R1-A1-D7); D1 stays
published for rollback. D8 (D7 continued on its weak correction families) is better still — 39/54, 35/42, 795/801 —
and became the group's D the same night (R1-A1-D8).

Training keeps here what the next stage needs: data, protocols, scripts, evidence, the training environment in
`~/.petya-train/env` (recreated from `scripts/train-requirements.txt` when missing; `/tmp` does not survive a restart), the base model in the Hugging Face cache and the parent adapter of the next stage.
Checkpoints and adapters of finished or rejected stages are deleted locally once their part is on GitHub.

## Planned: a code part

A separate part for writing code (a ready open coding model such as Qwen3-Coder-30B-A3B, downloaded from «Модели Пети»
in the settings like A), with a tool loop: read the project, edit in a git worktree, run the tests, show the diff for
approval. First measured on tasks built from this repository's own commits; fine-tuning only for gaps that test shows.
