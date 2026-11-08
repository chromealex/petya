# First-run introduction («Знакомство»)

Shown on a fresh install (no name in settings, no chats) and resumed after a restart until finished.
`PETYA_ONBOARDING=1` shows it again; `window.petyaOnboarding.open()` opens it from the renderer.

## Flow
1. Name — «Угадай».
2. Company — «Угадай»; renames the active company on finish.
3. Role — chips from `src/onboarding-roles.cjs` or a custom role (`custom:<text>`), «Угадай». Stored in `settings.userRole`.
4. Team — «Угадай» finds a team a colleague shared in a project (`.petya/team.json`, with roles and duties) and the
   authors of the last 60 days of commits in recent project folders (without the user and bots; roles are not
   guessed). Typed rows «Имя — роль» are added too. Checked rows join the Team tab; optionally the team is written
   to `.petya/team.json` of a chosen project folder so colleagues get it with git.
5. Permissions this role needs, one card at a time (see below).
6. Done — Petya flies into the logo in the app chrome.

«Угадай» stays only while the field is empty and Petya has not guessed yet; the same place then says «Далее»
(something is filled in) or «Пропустить» (a miss with an empty field). On the team step it simply disappears.

Extensions for the chosen role are not offered yet: the extension catalog is being reworked around roles.
When it declares roles, read the role list from the catalog and add the step between 4 and 5.

## Shared project data (`.petya/`, see docs/project-share.md)
`src/project-share.cjs` keeps Petya's data that a team shares through git in `<repo>/.petya/`. Only shareable
fields go there (no tokens, photos or private service accounts), as stable pretty JSON for small diffs. The first
kind is the team (`team.json`: name, aliases, role, projects, responsibilities, email, Slack ID, Jira ID), validated
by the Team tab rules on read and write. The renderer passes a project folder name, never a path: the main process
resolves it among the recent project folders it found itself.

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
