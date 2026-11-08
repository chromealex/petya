# Skills («Навыки»)

A skill is a set of instructions for a kind of work: a bug report, release notes, a retro, a code review. Petya
supports the SKILL.md format used by Claude and other agents, in Russian or English, with any files next to it:
references, templates, prompts for sub-agents, configs and scripts.

## Where skills come from

| Source | Where it lives | Notes |
|---|---|---|
| Built-in | `src/skill-library/work.cjs`, `team.cjs` | Petya's own skills, in Russian. |
| Built-in packages | `src/skill-library/packages/<author>/<skill>/` | anthropics/skills and mattpocock/skills with their files; Russian descriptions in `ru.json`. |
| Written in the app | «Навыки» page, encrypted `instruction-skills.json` | Up to 200 000 characters; SKILL.md import accepts `license`, `allowed-tools`, `metadata` and other fields and ignores them. |
| Installed | `<userData>/skill-packages/<name>/` | A folder or a `.zip` / `.skill` archive, up to 500 files and 50 MB. |
| Written by Petya | same as installed | «сделай навык: как оформлять релиз-ноты» (the old word «скилл» works too). |
| Project | `skills/`, `.claude/skills/`, `.agents/skills/`, `.codex/skills/`, `.petya/skills/` in a project folder | Only for chats of that project. |

## How a skill is chosen

* Explicitly: `/name`, `$name`, «навык name» or «скилл name».
* Automatically (`src/features/skill-choice.cjs`): a lexical shortlist by words of the name and description, then
  the local model picks one skill or none. A short follow-up («короче», «давай») keeps the last skill.
* English descriptions: the model translates each into Russian once, in the background; translations are kept in
  `<userData>/skill-descriptions.json` by the description's hash. Until a translation is ready, up to four English
  skills are offered to the model anyway, so a Russian request can still pick them.
* Questions about attached files and follow-ups in a chat with files get a skill too.
* The anthropic `docx`, `xlsx`, `pptx` and `pdf` packages are not chosen: they describe Python libraries Petya does
  not need, because Petya builds these files himself (below).

## How a skill is carried out

* A skill without files is added to the answer's instructions. A long one is fitted to the request
  (`src/skill-library/context.cjs`): the model reads the outline and picks the sections it needs; if they still do
  not fit, they are compacted for this request. The rest is named, so the model can say which part it misses.
* A skill with files (`src/features/skill-runtime.cjs`) is carried out step by step, up to 10 steps:
  * `read` — any file of the skill or of the user (`input/<name>`). A long file comes as the sections that fit the
    request and an outline; `path#s3` reads one section.
  * `run` — a Python, bash or Node script of the skill in the sandbox (below).
  * `answer` — the reply to the user.
  The answer is labelled «навык <name>», the steps are kept on the message (`skillSteps`), and files the scripts
  produced are attached with «Открыть» and «Показать в папке».

## Scripts and the sandbox

`src/skill-sandbox.cjs` runs scripts in the local Docker Desktop that the Python extension already uses, with the
same restrictions: `--network=none`, read-only image, no capabilities, user 65534, 1 GB memory, 2 CPUs, 128
processes, 2 minutes per run, nothing from the computer mounted. Only stdin crosses in: the whole skill folder
(`/work/skill`, the working directory), the user's files (`/work/input`) and the command. Files the script writes
to `/work/out` (`$PETYA_OUT`) come back, up to 20 MB, and are saved to `Downloads/Petya/<skill>/`.

Packages a skill needs are found in `requirements*.txt`, Python imports (mapped to pip names, standard library and
the skill's own modules excluded), `package.json` and `require`/`import` of Node scripts. They are installed once into
an image of the skill's own (`petya-skill-<hash>`) — the only step with network — after the user answers
«Установить». With «Без установки», without Docker, or with `skillScripts: false`, the skill still answers by its
logic and says that its scripts did not run. Image builds report progress in the notification center.

## Files Petya makes

«Сделай презентацию по итогам спринта», «выгрузи это в Excel», «оформи документом Word», «сделай pdf», or `/docx`,
`/xlsx`, `/pptx`, `/pdf`: the model writes the content from the request, the chat (compacted if long) and its files;
`src/office-files.cjs` builds the file with plain Office Open XML (PDF through Chromium's `printToPDF`, so Cyrillic
needs no embedded fonts). A follow-up such as «добавь слайд про риски» revises the last file into a new version.

## Tests

* `npm test` includes `skill-context`, `skill-languages`, `skill-runtime`, `office-files` and the older skill tests.
* `npm run test:skills:live` runs the sandbox against the local Docker and measures skill choice, English skills,
  fitting a long package and a skill run with the local Ollama model. Each part skips when Docker or Ollama is not
  available; results go to `tests/results/skill-choice-live-*.json`.
