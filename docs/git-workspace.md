# Git in Petya

_Owned by the Git app (`src/extensions/git`: `workspace.cjs`, `intent.cjs`, the chat route `chat-route.cjs`, the panel `git-panel.js`); other apps read `services.gitWorkspace`._

Git is detected automatically from the local context folders of the current project. A separate Git connection in the settings is not needed. The **Git** button in the chat opens the project panel and immediately starts the search. Multiple folders, nested repositories, a folder inside a repository and Git worktrees are supported. When there are several repositories, Petya asks you to choose a specific one; the choice applies only to the current project and its set of folders.

If Git is not found, Petya says so and offers «Создать Git» (Create Git) with a specific folder. Only clicking this button or the explicit command «создай git для проекта» ("create git for the project") runs `git init -b main`. When there are several empty folders, a choice is required. Files are not added to the index, no commit is created and no remote is configured. If system Git is missing, a separate error about installing the program is shown.

The search for nested repositories is limited to 1000 directories and four levels; hidden directories and dependency/build directories are skipped, and symbolic links are not followed during the traversal. On access errors or when the limit is reached, Petya reports that the search is incomplete and does not offer to create a repository based on such a result.

The installed system Git is used; the commit author, SSH keys and credential helpers are taken from its settings.

The panel shows the branch and changed files. Select the files you need and click «В коммит» (Stage). «Убрать из коммита» (Unstage) changes the index while keeping the working files. Write a message and click «Создать коммит» (Create commit). «Diff» shows unstaged changes to tracked files; «Diff коммита» (Commit diff) shows staged changes. The content of new unstaged files is not shown in Git diff. The history contains the last 30 commits; large outputs are truncated and marked as fragments.

You can create branches, switch between local branches, after Fetch choose remote branches to create a local tracking branch, and run Fetch/Pull/Push to the selected remote. Switching existing branches and Pull require a clean working folder. Pull allows only fast-forward; diverged history returns an error, with no automatic merge/rebase/stash. Push sends the current branch to its upstream or to the branch of the same name on the selected remote. Force-push, deleting branches, reset/clean, an arbitrary command line, clone and automatic conflict resolution are not implemented.

Examples of chat commands:

- «Статус гита» ("Git status"), «Покажи diff» ("Show the diff"), «История коммитов» ("Commit history"), «Покажи ветки» ("Show branches").
- «Добавь в коммит src/example.js» ("Add src/example.js to the commit"), «Убери из коммита src/example.js» ("Remove src/example.js from the commit").
- «Сделай коммит: Исправлен вход» ("Commit: Fixed login") — only files that are already staged.
- «Создай ветку feature/login» ("Create branch feature/login"), «Переключись на ветку main» ("Switch to branch main").
- «Git fetch», «Git pull», «Git push origin».

Write commands are executed only on an explicit command or a button click. The model does not construct shell commands: arguments are passed directly to system Git. Negations, quotations and questions about commands are not executed. With several remotes and no upstream, a choice is required. When the project changes or a change of HEAD, branch, index or the list of changes is detected, the panel requires the state to be refreshed. Only one operation per repository runs at a time. External changes from other Git clients cannot be fully blocked; before writing, Petya checks the available state snapshot.

Tests: real temporary repositories and a local bare remote, initial commit, file selection, unstage without deletion, names with spaces, renaming, protection against a stale snapshot and a project change, branches, fetch/pull/push, refusal on diverged history. In a real Electron window, the file list, stage, commit, history and branch creation via the chat were checked. The tests do not modify the user's working repositories.

Command semantics: [Git status](https://git-scm.com/docs/git-status), [Git pull](https://git-scm.com/docs/git-pull).

Also checked: no automatic init, explicit creation in the selected folder, multiple folders and repositories, search in nested directories, a parent repository, worktree, stale context and skipping of symlinks.

Routing fix: conversational requests such as «А сейчас можешь гит посмотреть» ("Can you look at git now"), «Можешь проверить репозиторий?» ("Can you check the repository?") and «Какая сейчас ветка?» ("What branch is it now?") trigger a Git read. All recognized Git commands are excluded from the background text dialogue that used to bypass the tool handlers. Theoretical questions, negations and quotations do not execute commands. Explicit requests «можешь сделать push» ("can you do a push") and «создай коммит с сообщением …» ("create a commit with the message …") trigger the corresponding operation, and if parameters are missing, Petya asks for them. The regression was checked through ordinary message sending in an Electron window with a real temporary Git repository.


Test of natural Git requests: 53 scenarios through ordinary chat sending in Electron, of which 46 are operation variants, 3 are requests for missing parameters and 4 are requests that perform no operations (negations, theory and quotations). For each operation, the real Git call and its result were checked: index, branch, commit or remote. Fetch/pull/push used a temporary local bare remote. Report: `docs/git-natural-report.json`.

Examples: «Можешь показать изменения в файлах?» ("Can you show the changes in the files?"), «Что войдёт в коммит?» ("What will go into the commit?"), «Давай заведём ветку feature/test» ("Let's create a branch feature/test"), «Можешь убрать файл src/a.js из коммита?» ("Can you remove the file src/a.js from the commit?"), «Можешь сделать коммит с сообщением “Исправлен вход”?» ("Can you make a commit with the message 'Fixed login'?"), «Подтяни изменения из origin» ("Pull the changes from origin"), «Давай запушим изменения» ("Let's push the changes"). Multiple files are listed separated by commas; names containing commas must be put in quotes. «Добавь все изменения в коммит» ("Add all changes to the commit") stages the current unstaged changes; deletions that are already staged are kept. Compound commands with several actions must be executed one at a time.
