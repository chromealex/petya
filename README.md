# Petya models

Petya runs a **group** of models named after a constellation. Inside a group:

- **R** — router: picks the function for a request and restates it, then passes it on.
- **A** — answers and conversation. **Optional**: downloaded separately, only when turned on; without it R answers.
- **D** — drafts: requirements from dialogues with corrections (JSON summary, description, open questions).

A group's version lists its parts: **Petya Andromeda R1-A1-D1**. Retraining a part raises only its number
(D1 → D2 gives R1-A1-D2); a new group name (Bootes, Cassiopeia, Draco, …, alphabetical) starts when the set of
parts or a base model changes. When every part of a group passes all gates (familiar, held-out, live dialogue,
runtime, packaging) the group is marked stable.

## Layout

```
andromeda/group.json       current set (R1-A1-D9), optional parts
andromeda/D1/              model.json (role, base, hashes, evaluation, status), NOTES.md, adapter files
andromeda/R1/, A1/         model.json; weights only when the part has an adapter
```

Pushing a part folder with weights publishes a release tagged `<group>-<part>` (`andromeda-d1`) with its files and
`group.json` (`.github/workflows/model-release.yml`); a pre-release unless `status` starts with `stable`. Each part
is a separate download, so A can be fetched on its own. Base models are not stored here: `model.json` names the
Hugging Face repository and revision. Weights live only on this branch and in releases, not on `main` or in the
project folder.

## Versions

| Group | Version | Status | Parts |
|---|---|---|---|
| Andromeda | R1-A1-D9 | experimental | R1, A1: Qwen3.5-9B-4bit @ 8b2b98c without adapter; D9: D8 plus its four weak correction families (54 new 39 vs D1 24, 25 exact; v22 35/42 vs 33; familiar 796/801 vs 787). D8, D7 and D1 stay published for rollback. |

### Part history

| Part | Status | Result |
|---|---|---|
| D1 | rollback | v21 fourth repair |
| D2 | rejected | new dialogues 39/54 (D1 24), v22 34/42 (D1 33), familiar 782/801 (D1 787) |
| D3 | rejected | new 39/54, v22 33/42, familiar 783/801 (below D1) |
| D4 | rejected | half learning rate: new 27/54, v22 33/42, familiar 780/801 |
| D5 | rejected | less data: new 21/54, v22 30/42, familiar 789/801 |
| D6 | rejected | D1/D3 blends (recipe only): best λ0.3 new 23/54, v22 30/42, familiar 791/801 |
| D7 | rollback | D3 plus familiar rehearsal: new 37/54, v22 34/42, familiar 795/801 |
| D8 | rollback | D7 plus five weak families: new 39/54, v22 35/42, familiar 795/801 |
| D9 | in the group | D8 plus four weak families: new 39/54 (25 exact), v22 35/42, familiar 796/801 |
