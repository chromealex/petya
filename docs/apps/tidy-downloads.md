# «Уборка загрузок» (`tidy-downloads`)

Category: «Компьютер и файлы». Groups the Downloads folder and clears it only after the user confirmed the exact
files: to the system Trash or into `Загрузки/Разобрано/<group>`, with an undo list.

## Phrases

«разбери загрузки», «что можно удалить из загрузок», «дубликаты в загрузках», «наведи порядок в папке загрузок»,
«почисти папку Downloads», «разбери загрузки: что не открывал 60 дней» (the «large» period: days, weeks, months,
«полгода»; default 30 days).

Near-misses: «очисти диск», «чем забит диск», «освободи место на диске» stay with «Место на диске» (which in turn
leaves requests that name Downloads to this app); «загрузки приложения за неделю», «сколько загрузок у игры в сторе»,
«скорость загрузки», «время загрузки уровня», «загрузи файл в Google Drive» are not the folder.

## Groups (`groups.cjs`)

Only the folder's top level is grouped; subfolders count in the total. Sizes, the deadline (30 s) and the «no
symlinks, hard links once, same volume» walk come from «Место на диске» (`disk-usage/scan.cjs` `Budget`, `size`).
A file that fits several groups is listed once, in this order:

| Group | Rule |
| --- | --- |
| Дубликаты | Same size, then the same first megabyte, then the same SHA-256 (at most 20 GB hashed). The original — a name without «(1)», «copy», «копия», «-1», then the oldest — stays; only copies are listed. |
| Установщики уже установленных программ | `.dmg/.pkg` (macOS), `.exe/.msi/.msix/.appx` (Windows), `.deb/.rpm/.AppImage` (Linux) whose name (version, arch and «setup» words dropped) matches an installed program (`src/desktop-apps.cjs`: /Applications, Program Files, Start Menu…). |
| Распакованные архивы | `.zip/.rar/.7z/.tar.*/.xip`, older than 7 days, with a folder of the same name next to it. |
| Большие файлы, которые давно не открывали | ≥ 100 MB, last used (macOS Spotlight `kMDItemLastUsedDate`, else max(atime, mtime)) older than N days. Start unchecked. |
| Скриншоты | Pictures named like system screenshots («Снимок экрана», «Screenshot», «Screen Shot», CleanShot…). |

## Card

A stacked bar of the folder (each group's share), groups as expandable rows with the files: checkbox, preview for
pictures (a thumbnail from the main process, only for listed files), why the file is there (the original, the
installed program, the extracted folder, last opened), size. Per group: a red trash button «В Корзину…» and «В папку
«Разобрано»…», each asking with the exact count and size; only that confirmation acts. «Недавние действия» lists the
last actions with «Вернуть».

## Actions (`actions.cjs`)

- Only files of the stored scan, inside Downloads, not symlinks; a stale card asks to look again.
- Trash: `shell.trashItem` through «Место на диске»'s `cleanup.clean` — never a plain delete.
- Move: into `Загрузки/Разобрано/<group>`, never overwriting (`name (2).ext`).
- Undo (last 30 actions, `<company data>/extensions/tidy-downloads/undo.json`): a move is moved back; a trashed file is
  put back from the Trash — Linux freedesktop Trash (`files/` + `info/*.trashinfo` Path), Windows Recycle Bin via
  `Shell.Application` (original folder and name, `MoveHere`), macOS `~/.Trash` (same name or Finder's renamed copy of
  the same size). When the Trash cannot be read (macOS without Full Disk Access) or the file is not found, the Trash is
  opened and the user puts it back. A name taken again at the old place is never overwritten.
- Progress: notification `tidy-downloads-scan` with «Остановить», restored after reload.

## Verified with stubs vs live

Tests: `node tests/tidy-downloads.cjs` (routing and near-misses incl. «Место на диске», installer names, all groups in
a temp folder, Spotlight override, the turn and its notification, scan-only actions, Trash via a stubbed `trashItem`
into a temp freedesktop Trash and back, move and undo without overwriting, macOS renamed-copy restore, thumbnails);
UI `tests/tidy-downloads-ui.cjs` (the card, previews, confirmation, a real move and «Вернуть», a stale scan refused;
screenshots `petya-tidy-downloads*.png`).

Needs live checking: `shell.trashItem` and restoring from the macOS Trash (Full Disk Access) and the Windows Recycle
Bin (the PowerShell `Shell.Application` restore); `app.getPath('downloads')` for a relocated Windows Downloads folder;
Spotlight dates; installer matching against real installed program names; scan time on a large Downloads folder.
