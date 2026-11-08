# Disk usage («Место на диске»)

Category: computer. Local only, no settings card (`settings: false`); the only stored setting is `diskUsageRoots`
(where Unity projects live, or `-` for «Без Unity»).

## What it does
A chat request measures what fills the disk on macOS and Windows and shows a card:
- the system volume bar (used/free; free space read through `src/disk-space.cjs` `inspectSpace`, total from the same `statfs` call);
- a horizontal bar chart of categories sorted by size, each tagged «можно удалить безопасно» / «пересоздастся» / «осторожно» with a one-line explanation;
- expandable rows with the biggest subfolders (or Unity projects / Ollama models);
- per-row cleanup that first lists the exact paths (or model names) with sizes and a live total, and acts only after «Переместить в корзину» / «Удалить модели» is pressed.

Categories: Ollama models (`OLLAMA_MODELS` or `~/.ollama/models`, per model from manifests, total = blobs), Unity `Library/`
folders (projects found under the saved roots, the current project folders, Unity Hub's `projects-v1.json` and
`~/Projects`-style folders), Unity Hub editors, Unity cache, Xcode DerivedData / Archives / iOS DeviceSupport / simulators,
Gradle caches, Android AVDs and SDK system-images, npm/Yarn/pnpm/pip caches, Docker Desktop disk image (allocated blocks,
so a sparse `Docker.raw` counts what it holds), Petya's userData, Downloads, Trash. Paths for both platforms are in
`scan.cjs` `locations()`.

## Safety
- A chat turn never deletes anything. Cleanup runs only from the card via `window.petya.feature('diskUsage','clean', scanId, categoryId, targets)`;
  the main process accepts only items of that row in the stored scan (the last 5 scans, in memory), refuses symlinks,
  and moves items with Electron `shell.trashItem`. Ollama models are removed only with `ollama rm <name>` (no shell).
- Downloads, Docker, simulators, Unity editors, Petya's data and Trash are shown with a hint but never cleaned by Petya.
- «осторожно» rows start with nothing checked.

## Scan limits
Async walk, 30 s deadline, cancellable (chat «Стоп» via answer-cancel, or «Остановить» in the notification), never
follows symlinks, does not cross into other volumes, counts hard links once, skips unreadable folders (counted and shown).
A cut-short scan is marked «частично» and sizes are shown as «≥ N».

## Notifications
One stable id `disk-usage-scan` on the shared `extension-install-progress` channel: real stages with a percent over
the known number of categories, then done/partial/error. `disk-notifications.js` adds «Остановить» while busy and restores
the state through the `progress` ipc.

## Phrases
«чем забит диск», «сколько места свободно», «что можно почистить», «освободи место», «сколько свободного места на маке».
Near-misses (return null / no offer): «место встречи…», «свободное место в спринте», «диск в Google Drive», «сколько места в машине»,
«что можно почистить в коде».
When no Unity roots are known, Petya asks once through the shared question panel («Где лежат проекты Unity?», option «Без Unity») and resumes the scan.

## Verified
Unit (`node tests/disk-usage.cjs`) on a fake macOS home on Linux (paths for Windows checked as strings); UI
(`tests/disk-usage-ui.cjs`) with a screenshot. Not verified on a real Mac/Windows: real `trashItem`, TCC-protected
folders (`~/.Trash` may need Full Disk Access), `ollama rm`, real Docker image sizes, Windows recycle bin (not measured).
Sizes use decimal units (ГБ = 10⁹ bytes) like Finder.
