# Shared with the team (`.petya/`)

Petya keeps data a team can share in the project's own git, in `<repo>/.petya/`. Commit the folder and
colleagues get it with `git pull`; Petya uses it in chats of that project without any setup.

| File | What | How it is used |
|---|---|---|
| `team.json` | Team roster: name, aliases, role, projects, duties, email, Slack ID, Jira ID | «Угадай» on the introduction's team step; «Из проекта» on the Team tab or «Подтянуть из проекта» adds new colleagues (nobody is replaced) |
| `dictionary.json` | Glossary aliases («бэ-вэ» → «BW»), optionally per Jira key | Applied in the project's chats next to your own rules; your rule wins on the same phrase. «Подтянуть» copies them into your dictionary |
| `project.json` | Slack channels by purpose (`default`, `dev`, `qa`) and the Jira key | Used when you saved no channels / key of your own for the project (`ProjectMemory.context()` falls back to it) |
| `dashboards/<name>.json` | Dashboards: titles, sizes, intervals and sources of widgets — no data (docs/dashboards.md) | Shown in the project's sidebar; each colleague refreshes them with their own connections |
| `skills/<name>/SKILL.md` | Instruction skills in the standard Agent Skills layout | Read by the project skill library (also `.claude/skills`, `.agents/skills`, …), so Claude Code and Codex see them too |

Never shared: tokens and credentials, photos, private service accounts and the Slack account hash, personal
corrections of Petya's answers («нет, я имел в виду…»), disabled rules and skills.

## Where
- Project settings → «Общее с командой»: a folder of the project, what you have and what the project already
  shares per kind, «Сохранить в проект» / «Подтянуть из проекта» for the checked kinds.
- Team tab: «В проект» saves the saved team into the first folder of the current chat project; «Из проекта»
  adds colleagues from the folder that shares a team.
- Introduction: the team step reads `team.json` first and can write it (see docs/onboarding.md).

## Code
- `src/project-share.cjs` — formats: read/write per kind, validation (the Team tab rules for the team, the
  dictionary rules for aliases, channel ids `C…`/`G…`, Jira key), stable pretty JSON for small git diffs.
- `src/features/project-share.cjs` — `status`, `save`, `load`; `services.projectShare.sharedRules()` for the
  chat (`converse.cjs`) and the shared channel/Jira fallback in project memory. The page passes a project id and
  a folder index; folders are resolved from the project settings in the main process, never taken from the page.
  Shared files are re-read only when their modification time changes.
