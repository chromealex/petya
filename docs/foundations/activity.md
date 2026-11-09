# Activity tracker (foundation)

Which app and window were in front, as time spans, for apps that answer «where did the time go». Core feature
`src/features/activity.cjs` (one line in `src/features.cjs`), implementation in `src/activity/`. The first consumer is
«Учёт времени» (`docs/apps/time-tracking.md`).

## Privacy
- **Opt-in**: `activityTracking` is `'false'` by default. It is switched on only by the user: the switch in «Учёт
  времени» settings (which says what is collected) or the consent question an app asks through the shared question
  panel. An app never switches it on by itself.
- **What is kept**: the frontmost app's name and its window title, start and end. No window contents, keystrokes,
  screenshots or URLs beyond what the title says.
- **Redaction before storage** (`src/activity/redact.cjs`): password managers (1Password, Bitwarden, KeePass(XC),
  LastPass, Dashlane, Keychain Access…), private browsing windows (Incognito, InPrivate, Private Browsing — checked on
  the raw title before the browser suffix is cut), banking pages (a list of banks and «онлайн-банк», PayPal, Revolut…)
  and the user's own list (`activityPrivateApps`: app names or title words, one per line) keep only the app name and
  `private: 'app'|'private'|'banking'|'user'`. Every other title loses e-mail addresses and digit runs of 8+ (card,
  account, phone numbers); a browser title loses the browser's name. Limit: a Chrome Incognito tab whose title does not
  say so cannot be recognised — add the browser to the private list if that matters.
- **Local only**: `<company data>/activity/YYYY-MM-DD.json` (folder 0700, files 0600) plus `current.json` for the open
  span. Nothing is sent anywhere.
- **Retention** `activityRetention` (default 30 days; older day files are deleted at start and every 6 hours),
  **pause** (`pause(minutes)`, open pause = until resumed; stored as `activityPausedUntil`), **wipe** (`wipe()` deletes
  the folder).

## Sampling
- Every `activityInterval` seconds (default 15, 5–300) the foreground window is read (`src/activity/foreground.cjs`):
  Windows — one long-lived PowerShell process answering `GetForegroundWindow` + process name (and FileDescription);
  macOS — a JXA script: `NSWorkspace.frontmostApplication` (no permission) and, only if screen recording access is
  already granted, the front window title from `CGWindowListCopyWindowInfo` (no permission is ever requested; without it
  spans have the app name only and `status().last.permission` is false); Linux — `xdotool` when installed.
- A sample at `t` claims `[t, t+interval)`. The same app + title continues the open span while samples keep coming;
  another window, a missed sample (sleep), the lock screen / suspend (Electron `powerMonitor` events) or idle input
  closes it.
- **Idle**: `powerMonitor.getSystemIdleTime()` ≥ `activityIdle` (default 300 s) closes the span at `now − idle`, so the
  idle minutes are not counted.
- Spans crossing midnight are split between day files. A span open when Petya quits is kept from `current.json`.

## API (`s.activity`)
| Call | Result |
| --- | --- |
| `spans({from, to})` | `[{app, title, start, end, private?, project?, task?, category?, label?, url?}]` overlapping the range, clipped to it, the open span up to now included; neighbours of the same window ≤ 60 s apart merged; classifier tags applied |
| `summary({from, to}, groupBy)` | `{total, groups:[{key, ms, spans, apps:[{app, ms}]}]}` largest first; `groupBy`: `app`, `title`, `project`, `task`, `category`, `day`, `hour` (day/hour split spans) or a function `span → key` (`''` = not grouped, still in `total`) |
| `status()` | `{enabled, paused, pausedUntil, interval, idle, retention, current, last, supported, folder, bytes, days, classifiers}` |
| `enable(on)`, `pause(minutes)`, `resume()`, `wipe()` | the new `status()` |

Renderer IPC: `window.petya.feature('activity', 'status' | 'enable' | 'pause' | 'resume' | 'wipe', …)`.

## Classifiers (`activity-classifier`)
An app tags spans by declaring `"provides": {"activity-classifier": "<file>.cjs"}` (a REGISTRIES kind in
`src/features/app-links.cjs`). The file exports `{id, name?, order?, classify({app, title, private}, settings) →
{project?, task?, category?, label?, url?} | null}`. Classifiers run when spans are read (never stored), in `order`,
first answer per field wins, failures are ignored, and only while their app is added. Built in by «Учёт времени»:
`classifier-jira.cjs` (a Jira key in the title → `task` and its browse URL; only the projects chosen in Jira settings,
or any key except UTF-8/ISO-8601-like words) and `classifier-project.cjs` (project from repo paths and Unity, VS Code /
Cursor, JetBrains, Xcode, Visual Studio window titles).

## Journal source
«Учёт времени» provides a `journal-source` (`src/extensions/time-tracking/journal-source.cjs`): time by project (or by
app) for the journal's day, items `{kind:'activity', minutes}`. The journal registry lives in the journal app
(`apps/reminders-journal` branch); `journal-source` is added to REGISTRIES here so either branch can merge first.

## Tests
`node tests/activity.cjs` — fake clock, sampler and idle: off by default, merging, idle cut-off, missed samples,
redaction before storage (files checked), file modes, pause/resume, restart recovery, midnight split, summary
groupings, classifiers, retention, company switch, wipe, settings validation, the Windows/macOS/Linux readers with
stubs. Not verified live: the PowerShell and JXA readers on real Windows/macOS machines and `powerMonitor` events.
