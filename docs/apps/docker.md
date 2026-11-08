# Docker («Docker»)

Category: dev. Local only. Declares no downloads: it needs Docker Desktop (macOS, Windows) or Docker Engine (Linux)
already installed; the settings card says so and shows the engine state («Проверить»: `docker --version`,
`docker context show`, `docker version --format json`). No stored settings besides `extension_docker`.

## What it does
Everything goes through the local `docker` CLI (`cli.cjs`): `execFile` without a shell, a timeout per call (10–25 s for
reads, up to 10 min for `compose up`), capped output, and only fixed subcommands built by the app. The binary is looked up
on PATH first, then in the usual install folders (Docker.app, Program Files, /usr/bin). The current Docker context is used
as is (Colima, remote contexts work the same way as in the terminal).

Reads (`engine.cjs`):
- containers: `docker ps --all --format json` + `docker stats --no-stream --format json` (only when something runs);
  status, image, compose project/service, ports, uptime, exit code, health, CPU %, memory used/limit;
- compose projects: `docker compose ls --all --format json`;
- images (dangling apart) and volumes: `docker images --format json`, `docker volume ls --format json`;
- disk usage: `docker system df --format json` (images, containers, volumes, build cache with reclaimable);
- logs: `docker logs --timestamps --tail N [--since 10m|2h] <id>`, stdout and stderr merged by time; `grep` and the
  «только ошибки» filter run in Petya's code and are never passed to docker;
- «почему падает»: `docker container inspect` (State.ExitCode, OOMKilled, Error, RestartCount, RestartPolicy, memory
  limit, health log) + the last 60 log lines. With a local model the explanation is written from these facts only;
  quoted «evidence» lines the model invents (not in the logs) are dropped. Without a model the exit code is explained by
  code (137 SIGKILL/OOM, 139 SIGSEGV, 143 SIGTERM, 127 command not found, …).

Writes, only from the card after the user pressed the confirming button (`window.petya.feature('dockerApp', …)`):
- `container(verb, id)`: `docker start|stop|restart <id>`; the target must still exist in `docker ps -a`;
- `compose(verb, project)`: `docker compose --project-name P --file F… up --detach` / `down`; the project must be in
  `docker compose ls`, its files must exist for `up`;
- `removeDangling(ids)`: `docker image rm <id>` for each confirmed id that is still dangling (no `prune`, no `-f`;
  an image used by a stopped container is reported, not forced).
Names and ids are validated (no leading `-`), and only one write runs at a time. Each write publishes to the notification
center under the stable id `docker-operation` (`docker-notifications.js` restores it after a reload). Petya never runs
`exec`, `run` or any command the user typed.

A chat request like «перезапусти redis» or «подними compose shop» does nothing by itself: the reply carries a card with
that row and its confirmation already open. «удали висячие образы» opens the disk card with the list of dangling images,
their sizes and the total, pre-checked, behind «Очистить · N ГБ».

## Errors
- No binary (ENOENT / not found) → an explanation that Docker Desktop is required (card mode `missing`).
- Engine socket/pipe unreachable («failed to connect to the docker API», «Cannot connect to the Docker daemon», Windows
  `dockerDesktopLinuxEngine` pipe) → a question «Docker не запущен» with «Проверить снова» through the shared
  question panel; the answer resumes the same request.
- Permission denied on the socket and timeouts are reported as errors with the reason.

## Cards
- Containers: counts strip, a table with status dots, name/image/compose project, port chips (`8080→8080`), localized
  state («работает 2 часа», «остановлен 3 минуты назад» via `Intl`), exit code chip, CPU and memory bars, a «Действия ▾»
  menu per row (Почему падает? / Логи / Перезапустить… / Остановить… / Запустить…) opening an inline confirmation;
  compose projects with a running/total bar and Поднять/Остановить; volumes collapsed.
- Logs: a 48-bucket timeline of line volume (warnings/errors coloured), search with highlights, level filter
  (Все/Ошибки/Предупреждения), monospace lines coloured by level, «Ещё строк», «Скопировать».
- Why it stops: tiles (exit code + meaning, OOMKilled + memory limit, restarts + policy, health), the cause and the
  explanation, steps, the last log lines with the quoted ones marked; «Перезапустить…», and task-tracker / code-fix links.
- Disk: stacked bar by type with hatched reclaimable parts, the biggest images, dangling images with the confirmation.

## Phrases
«что запущено в докере», «какие контейнеры запущены», «логи контейнера api», «покажи логи redis за последний час»,
«почему падает контейнер postgres», «перезапусти redis», «останови контейнер worker», «подними compose shop»,
«compose down shop», «сколько места занимает докер», «удали висячие образы докера».
Known service names (redis, postgres/постгрес, mongo, nginx, kafka, …) and names of containers seen earlier route
without the word «докер». A container is matched by exact name, compose service, a name segment (`shop-api-1` for
«api»), then substring; several matches or none → a question with the names as options.

Near-misses (null, no offer): «docker-образ для Python» (the Python app), «место на диске» (disk usage), «контейнер в Unity UI»,
«что такое докер», «напиши Dockerfile», «как установить docker», «перезапусти компьютер», «логи сборки в CI».
Disk usage: its Docker row offers «Подробнее в Docker», and disk-usage no longer answers requests that name Docker.

## Verified
Unit `node tests/docker.cjs` and UI `tests/docker-ui.cjs` (screenshots `petya-docker-containers.png`, `-logs`, `-crash`,
`-disk`, `-settings` in the temp folder) run against a fake `docker` binary on PATH (`tests/docker-fake.cjs`) that answers with
realistic JSON and records every call; the tests check that chat turns only read and that writes happen only through the
confirmed IPC calls. Not verified live: a real Docker Desktop on macOS/Windows (Windows pipe error texts, `docker stats`
timing with many containers, compose v1 `docker-compose` binaries are not supported, older CLIs without `--format json`).
