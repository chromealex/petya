# First-run introduction («Знакомство»)

Shown on a fresh install (no name in settings, no chats) and resumed after a restart until finished.
`PETYA_ONBOARDING=1` shows it again; `window.petyaOnboarding.open()` opens it from the renderer.

## Flow
1. Name — «Угадай».
2. Company — «Угадай»; renames the active company on finish.
3. Role — chips from `src/onboarding-roles.cjs` or a custom role (`custom:<text>`), «Угадай». Stored in `settings.userRole`.
4. Permissions this role needs, one card at a time (see below).
5. Done — Petya flies into the logo in the app chrome.

Extensions for the chosen role are not offered yet: the extension catalog is being reworked around roles.
When it declares roles, read the role list from the catalog and add the step between 3 and 4.

## Pieces
- `src/features/onboarding.cjs` — state (`userData/onboarding.json`, written after every step), guesses, finish, relaunch.
- `src/onboarding-guess.cjs` — local guesses, no OS permission needed: account full name (`id -F`, Windows
  `Win32_UserAccount`, Linux GECOS), git `user.name`/`user.email`, Chromium `Local State` profiles (Chrome,
  Yandex, Edge, Brave, Arc), the desktop Slack's `root-state.json` workspaces (the App Store build is skipped:
  its sandbox container makes macOS ask), installed apps and project folders with commits in the last 30 days.
  Runs only on «Угадай»; nothing leaves the computer. Public mail domains never become a company.
- `src/ui/petya-avatar.{js,css}` — Petya from the `assets/boot` layers with moods `idle`, `talk`, `guess`
  (lens circling with the icon of the source being checked, reported live by the `onboarding-guess` event),
  `found` (jump, cap toss, sparks) and `miss` (shrug, sad mouth).
- `src/ui/onboarding.{js,css}` — the screens. Everything Petya says is a speech bubble; while he guesses or
  waits it turns into a thought cloud. The startup splash lands Petya on this screen (`window.petyaBootSplash.target`)
  or is dismissed when the introduction resumes after a restart.

## Permissions
`src/permissions.cjs` is shared with the settings checklist: microphone, screen recording, accessibility.
Each item reports `needed` (does this platform gate it), `restart` (macOS screen recording applies to a new
process) and `settings` (a section can be opened).
- macOS: the system prompt first (shown once per app), then the exact Privacy section.
- Windows: only the microphone (`ms-settings:privacy-microphone`).
- Linux: nothing on X11; on Wayland the system asks at every screen capture; GNOME/KDE privacy pages are tried.
The introduction offers the microphone to everyone, screen recording to managers and leads, accessibility as
optional; «Позже» moves on without asking again. The status is re-read on return to the window and every 1.5 s.
For screen recording the button becomes «Перезапустить Петю»: progress is saved and the introduction resumes.
