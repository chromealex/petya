# Level Generator («Генератор уровней»)

Category: gamedev. Settings: yes (`settings.js`). One download: the RTS engine package (`engine`), only when no engine is
installed. Code: `src/extensions/rts-levels/`.

Maps for the user's own RTS engine ([chromealex/rts-engine](https://github.com/chromealex/rts-engine)) from a phrase,
through the engine's MCP server `rtsmcp`. Petya never edits engine files; everything it writes goes into the user's
project folder (a folder with `game.json`) through rtsmcp, and only after a confirmation.

## Phrases

| Request | What happens |
|---|---|
| «покажи мои RTS-проекты» | `list_projects` (rtsmcp's recent projects) + folders of the Petya project that hold `game.json`; card with «Выбрать» per project and «Выбрать папку…». |
| «сгенерируй карту 2 на 2 с рекой посередине» | 4 players in teams of 2, `mirror4`, a river through the middle with 3 fords, teams split by side. |
| «сделай симметричную карту для 4 игроков, побольше руды» | 4 players, `rot4`, `resources` ×1.6. |
| «сгенерируй уровень» | Ours only when this Petya project already has an RTS project folder. |
| with a draft in the chat: «сделай реку шире», «добавь ещё 2 месторождения у центра», «убери лес у центра», «больше руды», «добавь броды», «отмени», «ещё вариант» | Edits of the draft (see below). |

Near-misses that are not ours (unit test and `tests/extension-offers-matrix.cjs`): «сгенерируй картинку» (the Artist),
«карта сайта», «карта в Google Maps», «уровень логирования», «уровень игрока», «баланс юнитов» (balance tools, not maps),
«сгенерируй уровень в Unity / Godot / Unreal» (never, even with an RTS project), mind maps, loyalty / bank cards. A new
map described with players, teams, symmetry, size or kind is a new draft even next to an open one; «больше руды» alone
edits the draft.

## From words to parameters

1. Rules (`intent.cjs` `parseRequest`): «N на M» (≤4 each) → players and teams, «A на B» (≥16) → size, «для N игроков»,
   «симметричн», «зеркальн», «река посередине», «побольше/поменьше руды/леса/воды», «без гор», «острова / каньоны /
   нагорье / континенты / пещеры / линии» → preset, «маленькая / большая / огромная».
2. With a local model chosen, `kit.modelJSON` fills only the fields the rules did not set (preset, players, teams,
   symmetric, river, water, rivers, resources, trees, levels, size). Without a model, or with invalid JSON, the rules alone.
3. `validate` checks everything against `gen_presets` of the open project: the preset must exist (planet presets are left
   out for flat maps; the game's own presets in `rules.json` `mapgen.presets` come first), keys must be in the preset
   schema (`params` list), numbers are clamped (`water`, `rivers` 0..1, `levels` 0..9, `trees`/`resources` 0..5, size
   16..1024), symmetry is fitted to the player count (rtsmcp refuses `mirror` with 4 players: it becomes `mirror4`).

## A draft

A draft is a recipe kept per company (`<dataRoot>/rts-levels.json`, with the project folder chosen per Petya project):
project folder, template map (the project's first map: its player-1 objects are the start kit, its neutral objects
decide what is placed), `map_generate` arguments, the river and teams drawn after generation, and the edits. The map
itself lives in rtsmcp's in-memory document; the generator is deterministic, so whenever rtsmcp was restarted or another
draft was loaded the draft is rebuilt exactly (`maps.build`).

Generation: `open_game {game}` → `map_open {file: template}` (or `map_new` without maps) → `map_generate {preset, seed,
players, symmetry, params, useTemplate}` → teams with `map_set players[i].team` → river: `entity_delete {all, owner:0,
rect}`, `terrain_level 0`, `terrain_paint water`, fords `terrain_paint shallow` → `map_set name` → `map_info`,
`map_ascii {maxWidth:160}`, `map_validate`, `entity_list` per resource type.

Edits are tool calls on the draft: `entity_place` (deposits near the centre / bases / corners on free 3×3 ground from the
ascii picture, placed evenly so no side is closer), `entity_delete {all, type, rect}` (forest / deposits), river
calls (wider, more fords). Each edit remembers the map hash before it; «Отменить правку» calls rtsmcp `undo` once per
call and checks the hash — on a mismatch the draft is rebuilt from the recipe. Parameter edits («больше руды», «уже»,
«карта больше») change the recipe and regenerate with the same seed; undo restores the recipe.

## The card

Canvas picture of the ascii map (terrain colours, cliff levels lighter, forests dotted, numbered starts in player
colours, deposits as gold diamonds) with a legend; players with teams; path length between every pair of starts
(`generated.paths`, the engine's pathfinder) and a warning when starts are not connected; validation problems grouped
and counted, errors first (`map.generated: unknown key` — the generator's own summary block — is not shown); balance
results; chips (preset, size, players/teams, symmetry, seed, river, edits).

Buttons: «Ещё вариант» (next seed), «Сохранить в проект» (asks; `map_save {file: maps/gen_<preset>_<n>p[_AvB]_s<seed>.json,
addToGame: true, title}`; an existing file is never overwritten — the second question «Перезаписать?» is needed),
«Проверить баланс» (asks; `balance_batch {runs: 4, seconds: 900}` in the background, notification
`rts-levels-balance:<id>` with «Отменить»; win rate per start, match length, matches without a winner), «Открыть в
редакторе» (only when the engine has an editor: `RTSEditor.app` via `open -n … --args`, `rts_editor(.exe)` directly, with
`--project <folder> --engine <engine> [--map <saved map>]`), «Отменить правку», red trash «Удалить черновик» (asks; a map
already saved to the project stays).

## The engine

Found in this order (`engine.cjs` `detect`), and an existing engine is always preferred — nothing is downloaded then:
1. the folder or `rtsmcp` set in Settings → «Генератор уровней»;
2. `rtsmcp` on PATH;
3. `~/RTSEngine`;
4. Petya's own download in `<userData>/rts-levels/engine-<version>-<commit>/RTSEngine` (exactly one version is kept).

The engine folder is found above rtsmcp like the engine's own tools do (`templates/` and `engine/assets/`), and rtsmcp is
always started with `--engine <folder> --no-editor --port 0` and its own folder as the working directory: published
binaries carry the build machine's source path; `--no-editor` keeps it from launching the editor; port 0 (nothing can
listen there) makes rtsmcp work on its own workspace, so Petya never changes the map open in the user's editor window.
One rtsmcp process per engine, all calls serialized, closed after 10 idle minutes, on removal of the app and when Petya
quits (`mcp-client.cjs`: JSON-RPC 2.0 over stdio, one message per line, `initialize` → `notifications/initialized` →
`tools/list` / `tools/call`, per-request timeouts with `notifications/cancelled`).

### Download

From the engine's orphan branch `builds`:
- `index.json` (schema 1, after the next republish): `packages[]` with `platform`, `arch`, `version`, `commit`, `file`,
  `url`, `size`, `sha256`, `rtsmcp`, `editor` — preferred when present; the sha256 is checked.
- Until then `index.txt` (newest first) + the GitHub contents API (`GET /repos/chromealex/rts-engine/contents/<file>?ref=builds`
  → `sha`, `size`, `download_url`): the git blob SHA-1, `sha1("blob " + size + "\0" + bytes)`, must equal `sha`, and the
  byte count must equal `size`.
- Packages: macOS arm64 (~43 MB), Windows x86_64 (~53 MB). No Intel Mac and no Linux package: the card says so and
  points to settings. URLs only on GitHub hosts (`raw.githubusercontent.com`).

The download starts only from «Скачать движок» (card or settings) and asks above the shared size limit; progress in the
notification center (`rts-levels-engine`, real percent while downloading, then «Распаковываю», «Проверяю rtsmcp»,
«Отменить»); free space checked; the zip is unpacked with Node (`unzip.cjs`: stored/deflated only, no absolute or `..`
paths, no symlinks, no duplicates, size limits), tool bits set `+x`, `com.apple.quarantine` removed on macOS (best
effort; Petya writes the files itself), rtsmcp is started and must list `map_generate`, then the folder is moved into
place and older versions are deleted. A newer commit in the index is offered as «Обновить» in settings.

## Tests

- `tests/rts-levels.cjs` (in `npm test`): routing and near-misses, rules + model merge, schema validation, the MCP client
  against `tests/fixtures/fake-rtsmcp.cjs` (errors, timeout, cancel, a crashing server), detection order, the builds
  index from a local fake GitHub (index.txt + blob SHA-1, index.json + sha256, Intel Mac / Linux), download, mismatching
  hash, size mismatch, cancel, declined confirmation, update keeping one version, unsafe zips, and chat turns end to end
  on the fake rtsmcp (engine card, project question, draft, edits, undo, rebuild, save without overwrite, variant,
  balance, editor arguments, discard).
- `tests/rts-levels-rtsmcp.cjs` (in `npm test`, skipped without the binary; `PETYA_RTSMCP=<path>`): the real Linux rtsmcp
  (155 tools): a temporary project from the `skirmish` template (`create_project`), «2 на 2 с рекой посередине»
  generated, validated without errors, ascii read, deposits added and undone bit for bit, a wider river, saved into the
  project and `game.json`, a second save refused, a 2-match balance check. HOME/XDG point into the temp folder.
- `tests/rts-levels-ui.cjs` (in `tests/apps-ui.sh`): cards from data the real rtsmcp produced
  (`tests/fixtures/rts-levels-cards.json`), screenshots `petya-rts-levels*.png`.

## Needs live checking

- macOS: the downloaded `RTSEditor.app` and tools under Gatekeeper (Petya writes the files itself, so normally no
  quarantine flag; whether the binaries' signature is accepted when launched from Petya), `open -n RTSEditor.app --args
  --project …`.
- Windows: SmartScreen on `rts_editor.exe` / `rtsmcp.exe` started from Petya, Defender scanning the unpacked folder,
  long paths inside `RTSEngine/`.
- The editor launch with `--project`/`--map` on both systems; port 0 refused immediately by Winsock (otherwise each call
  waits up to rtsmcp's 300 ms connect timeout).
- The real download from `raw.githubusercontent.com` (~43/53 MB) and the GitHub contents API rate limit (60 requests per
  hour without a token — one request per check).
- Balance checks on big maps (time limit per call: 4 minutes per match).
