# Computer control

Expand «Управление компьютером» (Computer control) at the bottom of Petya's window, choose a mode and click «Включить управление» (Enable control). On macOS, grant Accessibility access and, if the system asks, automation of System Events.

Access is now kept after Petya quits normally, after the app restarts and after the computer restarts. Enable it once in the updated version: previous versions kept the choice only in memory. Petya restores the choice the next time it starts; this setting does not make the app itself launch automatically. macOS or Windows permissions must still be granted by the system.

The choice is shared for this computer and user profile and does not depend on the selected company. The file `computer-access.json` is located in Petya's user data directory. It contains the mode and the application identifier, but not typed text or action history. On macOS the bundle ID is stored; on Windows, the path to the executable. Old PIDs are not reused after a restart. If the selected application is closed or several instances of it are found, the action is not performed.

## Modes

- **Single application:** typing text, individual keys and standard Cmd (Mac) or Ctrl (Windows) shortcuts with A/C/V/X/Y/Z/S/F/N/P/O/W, including with Shift. Before each action the application is located again and activated. This is input routing, not an isolated sandbox for the application itself.
- **Whole computer:** typing into the active window; Ctrl/Cmd/Alt/Shift shortcuts with letters, digits, F1–F12 and navigation keys; scrolling under the cursor; switching between running applications; clicks and dragging. When typing from Petya's interface, keep in mind that the active window may be Petya's own. A voice command lets you keep the desired window active.

## Commands

- `введи текст Привет` (type the text "Hello")
- `нажми ввод`, `нажми сохранить`, `нажми отменить`, `нажми повторить` (press Enter, press save, press undo, press redo)
- `нажми копировать`, `нажми вставить`, `нажми вырезать`, `нажми выделить всё` (press copy, press paste, press cut, press select all)
- `нажми Cmd+Shift+S` (press Cmd+Shift+S) on Mac; `нажми Ctrl+Shift+S` (press Ctrl+Shift+S) on Windows
- `нажми Alt+Tab`, `нажми Ctrl+F5` (press Alt+Tab, press Ctrl+F5)
- `прокрути вниз 5`, `прокрути вверх`, `прокрути вправо 3` (scroll down 5, scroll up, scroll right 3) — from 1 to 100 steps, 3 by default
- `клик 500 300`, `двойной клик 500 300`, `правый клик 500 300` (click, double-click, right-click at 500 300)
- `перетащи 100 200 в 400 500` (drag from 100 200 to 400 500)
- `переключись на приложение Safari` (switch to the Safari app) — the exact name from the list of running applications
- `останови управление` (stop control)

Coordinates are measured from the top-left corner of the main screen; negative values are allowed for additional monitors. Scrolling, the mouse, application switching and system shortcuts are available only in whole-computer mode.

## Stopping and limitations

The «Остановить управление» (Stop control) button, the command of the same name and Ctrl+Shift+F12 (Command+Shift+F12 on Mac) turn off access now and for subsequent launches. A normal quit keeps the choice but cancels any pending action. Input that has already been sent is not undone. If a drag is interrupted, Petya tries to release the mouse button.

These are individual commands with no autonomous screen analysis and no planning of multi-step tasks. Petya does not run arbitrary code from a command and does not open a closed application by an inexact name. Elevated Windows windows and system focus restrictions may reject an action. The Windows implementation needs to be verified on a real computer.

## Ordinary requests and search through the interface

Example: «В телеграмме найди мне контакт Васи» ("Find Vasya's contact for me in Telegram"). Petya parses the request with the local Ollama model; common search phrasings also work without the model. It identifies Telegram, finds the labelled search field via macOS Accessibility / Windows UI Automation, checks focus, types the name and reads the list rows next to the field. The Telegram API, a separate account login and API keys are not used for this.

Telegram must be running, and Petya must be allowed to control the whole computer or Telegram specifically. If the window hides the search, there are several fields, or the list is not accessible to system tools, Petya reports that it cannot perform the step reliably. When there are several lists, it does not present the contents of an open chat as the search result. It does not press Enter in an unknown field and does not send messages. The answer «ничего не найдено» ("nothing found") is allowed only when the corresponding interface state has actually been read; the absence of accessible rows means the result could not be read.

Results are shown in Petya's reply based on the rows actually read. It does not automatically pick the first person with that name or open a chat. Conversational requests to switch to a running application, scroll the screen, copy/paste or undo an action are also parsed by the local model. This is a set of supported intents, not universal execution of any task in any application.

Verification of the implementation includes simulation of the accessibility tree and protection against an ambiguous field. Checking in a real window requires a system permission; a test osascript in the development environment may not have the access granted to the installed Petya.app.

## Cursor and control badge

While an action is being performed, a turquoise pointer labelled «Петя» (Petya) appears over the desktop, along with a badge with Petya's icon near the top-right edge of the controlled window. The badge shows the action and the application name. A saved permission on its own does not turn on the indicator: the indicator means an action is in progress right now.

The pointer marks the click point, follows the steps of a drag and shows the field into which Petya types the search query. For a keyboard action, the current mouse position is marked. This is a separate visual pointer on top of the normal system cursor. The window geometry and target position are provided by the system helper; negative coordinates of additional monitors and Windows scaling are taken into account.

Both transparent windows are never activated, do not take focus, are absent from the taskbar and pass clicks through to the application below them. On successful completion, «Готово» (Done) appears for 650 ms. On cancellation, error, screen lock and quit, the indicators are hidden. Display over the Windows secure desktop and system security screens is not supported.

Tests: `tests/computer-overlay.cjs` checks the lifecycle, stopping, scaling and multiple monitors; `tests/computer-overlay-smoke.cjs` runs via Electron without `ELECTRON_RUN_AS_NODE` and checks real rendering, absence of focus and saving of snapshots to the system temporary directory.
