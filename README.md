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
andromeda/group.json       current set (R1-A1-D7), optional parts
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
| Andromeda | R1-A1-D7 | experimental | R1, A1: Qwen3.5-9B-4bit @ 8b2b98c without adapter; D7: D3 plus a familiar-only rehearsal (54 new 37 vs D1 24, v22 34/42 vs 33, familiar 795/801 vs 787). D1 stays published for rollback. |

### Part history

| Part | Status | Result |
|---|---|---|
| D1 | in the group | v21 fourth repair |
| D2 | rejected | new dialogues 39/54 (D1 24), v22 34/42 (D1 33), familiar 782/801 (D1 787) |
