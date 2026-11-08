# Programmer: Petya writes code himself

The «Программист» extension (`src/extensions/coder/`) lets Petya change code in the project's own repository on a local Ollama model, without Codex or Claude. Handoff to Codex/Claude («отдай кодексу», «делай через Claude») and build repair («почини билд») keep their own handlers.

## In the chat

- «Напиши функцию сложения в utils.js», «Исправь баг в модуле авторизации», «Добавь тесты для parseDate», «Отрефактори src/main.cjs», «Сделай в моём проекте экспорт в CSV», «Как программист, добавь кеширование».
- The answer is a card: summary, changed files with +/−, the diff, the test check and the steps. Buttons and words: «Прими» (commit and merge into the branch checked out in the project folder), «Оставь в ветке» (commit, no merge), «Отклони» (delete the branch and the working copy), «Покажи дифф».
- While a result waits for a decision, follow-ups in the same chat continue in the same working copy: «а ещё добавь тест», «переименуй её в sum», «теперь поправь README». The card is replaced; earlier cards of the run lose their buttons after the decision.
- Requests that are not code (letters, Jira tasks, presentations, explanations «объясни, как работает…», «через Python» calculations, Git commands) are not taken (`intent.cjs`, `tests/coder.cjs`).

## How it works

1. **Repository.** The project's Git repository from `gitWorkspace.discover()`: the selected one, the only one, or a choice. No Git or no project folder → Petya says what to connect.
2. **Working copy.** `git worktree add -b petya/<task>-<id>` from the current HEAD into Petya's data folder (`coder-worktrees`). `node_modules`, `.venv`, `venv` of the project are linked, never written or committed. Uncommitted edits in the project folder are not copied; the answer says so.
3. **Loop** (`agent.cjs`). Ollama tool calls: `list_files`, `search` (git grep), `read_file` (numbered, ≤250 lines), `edit_file` (exact unique fragment; CRLF kept), `write_file`, `delete_file`, `run`, `finish`. Models without tool support get the same tools as a one-action JSON protocol. Project instructions (AGENTS.md, CLAUDE.md, .cursorrules, CONTRIBUTING.md), README head and the file tree are the starting context. History fits the shared 16k window (`model-context.SIZE`): old tool results are shortened first. Repeated identical reads are cut off; the step limit is a setting (40 by default).
4. **Independent check.** On `finish` with changes, Petya runs the project's test command himself (`npm test`, `pytest -q`, `go test ./...`, `cargo test`, `make test` — detected from the project). A failure goes back to the model with the output, up to three rounds; the card shows the final result and output.
5. **Decision.** Accept refuses to merge when the project folder has uncommitted tracked changes or a detached HEAD, and aborts a conflicting merge, keeping the branch. Fast-forward when the project did not move. The commit uses the repository's author, or «Петя <petya@localhost>» if none is configured; hooks are skipped (`--no-verify`) because the worktree is checked by tests already. Nothing is pushed.

## Safety

- Files: only inside the worktree; no `.git`, no `..`, no absolute paths, no symlinks leading out, no secret-like files (`.env*`, keys, `.npmrc`, credentials…) — neither read, written nor listed in search results.
- Commands: one command without a shell (`; | & > $ \`` are refused), from an allowlist of build/test tools with argument checks (`npm test` / `npm run <script>` but not publish/deploy, no `node -e`, `python -c`, `make install`, `git push`). The environment loses tokens, keys, passwords and service variables; `CI=1`.
- Commands get a stand-in home folder (`coder-worktrees/.home`): code that goes after `~` (dotfiles, keys, «delete the home folder») reaches an empty stand-in. Toolchain folders in the real home keep working through their variables (`CARGO_HOME`, `RUSTUP_HOME`, `GOPATH`, `GOCACHE`, `npm_config_cache`, `PYENV_ROOT`, `GRADLE_USER_HOME`, `NUGET_PACKAGES`, `NVM_DIR`, `VOLTA_HOME`).
- Before any command, files changed in the task are scanned for dangerous actions (deleting outside the project, `curl | sh`, sudo, `git push`, access to keys); such code is not run.
- This is not a sandbox: allowed commands run the project's own code on the user's computer, as `npm test` in a terminal would. «Запускать тесты и сборку» in the extension settings turns commands off completely.

## Settings

«Программист» card in settings: model for code (any Ollama model; the general model by default; models with coder/devstral/codestral/deepseek in the name are marked «для кода»), running checks on/off (`coderRun`), step limit (`coderSteps`, 10–100). On a Mac Studio, `qwen3-coder:30b` is a good default (`ollama pull qwen3-coder:30b`, ~20 GB).

Progress goes to the notification center (`coder-progress`, one card per run) and to the request progress line.

## Tests

`node tests/coder.cjs` (in `npm test`): a scripted fake model on real temporary git repositories — worktree isolation, path/command/secret refusals, the tool loop and the JSON fallback, the failing-test feedback round, accept (merge and fast-forward), keep, discard, uncommitted-changes refusal, step limit, a model that never calls tools, intent routing and the chat feature with follow-ups.

Not checked yet: a live run on `qwen3-coder:30b` / `qwen3.5:9b` against a real project, and the card in the running app.
