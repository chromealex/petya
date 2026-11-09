# Profiler (`profiler`, «Профайлер»)

Local extension, category `gamedev`. Answers «what eats the frame» from a profiler capture: top markers per thread
with their share of the frame budget, spikes and GC, and before/after comparisons. Every number is computed by code;
the local model (if one is chosen) only explains markers that are in the capture.

## Inputs Petya parses
- **Unity Profile Analyzer CSV** (Window → Analysis → Profile Analyzer → Pull Data / Load → Export):
  «Marker table» (`markerTable.csv`: Name, Median/Min/Max/Mean Time, Min Depth, Count Total/Median, GC Alloc …),
  «Single Frame Times» (`frameTime.csv`: Frame Index, Frame Time (ms), GC Alloc (bytes)), and from the Compare view
  «Comparison table» (`tableComparison.csv`: Left/Right Median, Count, Depth, Threads Left/Right …) and «Comparison
  Frame Times». Separator `;` (1.x) or `,` (older), quoted names, `.` decimals; a `Thread`/`Threads` column is used
  when present, otherwise the thread comes from the file name (`*render*`, `*job*`) or the export is treated as the
  main thread (Profile Analyzer's default selection), which the card says.
  A marker table and a frame-times table attached together are one capture.
- **Chrome trace JSON** (`traceEvents` or a bare array; chrome://tracing, Perfetto UI → Convert → JSON, engines that
  write it): `X` and `B`/`E` events, `thread_name` metadata. Frames are spans named Frame / PlayerLoop / BeginFrame /
  DrawFrame / GameFrame / Tick …; markers are summed per frame. Without frame spans the card shows per-call times and
  no budget shares.
- **Android `adb shell dumpsys gfxinfo <package> framestats`** text: PROFILEDATA rows (Flags ≠ 0 dropped), phases on
  the UI thread (input, animation, measure/layout, draw) and RenderThread (sync, issue commands), the summary
  (janky frames, percentiles, slow UI thread …). It covers Android View/HWUI frames only; Unity/Unreal render to a
  SurfaceView, which the card notes.
- **Memory tables saved as CSV** (Memory Profiler tables, or any name + size table, sizes in bytes or «12.3 MB»).

Not parsed, with an explanation in the reply: Unity Profiler «Save» `.data`/`.raw` (binary — export CSV from Profile
Analyzer instead; the steps are in the answer), Memory Profiler `.snap`, Perfetto protobuf `.pftrace`, and Xcode
Instruments `.trace` (out of scope: for iOS builds use Unity Profiler + Profile Analyzer).

Files come from chat attachments picked from disk (read in full from `localSourcePath`, up to 150 MB), paths written
in the request, or captures attached earlier in the same chat («почему фризы» after a capture was discussed).

## What the card shows
- Frame budget for 30/60/120 fps (chip on the card, remembered in `profilerTargetFps`; «при 30 fps» in the request
  wins): a stacked bar of the main-thread markers one level below the frame root (PlayerLoop / Frame), «прочее»,
  the free room or the overflow past the budget line.
- Frame-time timeline (≤ 300 bars, bucket maxima): budget line, spikes (> 1.5× budget or 2× median) in the alert tone,
  GC allocations marked.
- Ranked markers per thread group (main / render / jobs / other tabs): median, max, calls (per frame when the export
  has Count Median), % of budget. Wrappers (PlayerLoop, worker idle, Semaphore.WaitForSignal …) are not ranked.
- Spikes list with GC bytes; GC block (GC.Collect max, allocations per frame, top allocating markers); memory bars.
- Before/after: matched by marker and thread group; a change counts when it is ≥ 0.1 ms and ≥ 10%; ▲ regressions
  first, ▼ improvements, new/removed markers; the rest is summarised as «без заметных изменений». Order: names with
  before/after, до/после, old/new, baseline; otherwise the order attached. The Compare view export is left = before.
- «Что это значит»: lines like «Physics.Simulate 6,2 мс — 37% от 16,7 мс бюджета: …». The explanation comes from the
  local model (only for listed markers; an explanation or summary naming a marker that is not in the capture is
  dropped) or, without a model, from a short built-in reference of common Unity / Android / browser markers.
- Actions: «Что оптимизировать?» (a follow-up in the chat, answered from the last card), a coding hand-off through
  `k.links('code-fix')` with the markers, their numbers and file hints (classes from `Class.Method()` markers and
  their `.cs` files found in the project folders, Library/Temp skipped), and «Снять тайминги в Unity».

## Unity Editor link
When «Unity Editor» is added, «Снять тайминги в Unity» calls `manage_profiler` / `get_frame_timing` (FrameTimingManager:
CPU main / render thread, GPU, present wait) through the Unity app's own `invoke`, which asks for confirmation and
checks the chat and connection. If the connected MCP for Unity does not publish `manage_profiler`, the card explains
the Profile Analyzer export instead. MCP for Unity has no CSV export of profiler captures, so none is attempted.

## Phrases
«разбери профайлер», «что жрёт кадр», «сравни профайл до и после», «почему фризы», «разбери трассу chrome»,
«разбери gfxinfo», «просадки fps в бою», «разбери профайлер при 30 fps», «Что оптимизировать?» after a card.
Near-misses (null / no offer): «профиль пользователя», «профайлер памяти браузера», «профиль в Slack», «открой мой
профиль», «разбери плейтест», «где игрок застрял», «тест упал».

## Verified
- Unit (`node tests/profiler.cjs`): fixture exports in `tests/fixtures/profiler/` (marker table and frame times in the
  1.x `;` format, an older `,` table with a Thread column, a Compare view table, a Chrome trace with X and B/E events,
  a gfxinfo framestats dump, a memory CSV, a binary `.data`), routing, diff, explanations with a stubbed model, file
  hints, Unity live reading with a stubbed Unity app.
- UI (`tests/profiler-ui.cjs`): real cards from the parsed fixtures, screenshots checked.
- The fixture files follow the column lists of Unity's «Export data reference» and Android's framestats docs; they
  were generated, not exported from a real Unity project. A real Profile Analyzer export and a live MCP for Unity
  `manage_profiler` call remain to be checked (no Unity here).
