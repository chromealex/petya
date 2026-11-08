# Screenshot → task («Скриншот → задача»)

Category: computer. Local; settings card for the global shortcut (`screenshotTaskShortcut`).

## What it does
1. **Start.** A global shortcut (default `CommandOrControl+Shift+2`, i.e. Cmd+Shift+2 / Ctrl+Shift+2) or the phrases
   «сделай баг из скриншота», «скрин в задачу», «заведи баг по этому экрану» (text after «:» is a note for the draft).
2. **Region.** Petya's screen capture path: the macOS screen recording permission flow of `src/computer-setup.cjs`
   (ask once, then open «Конфиденциальность → Запись экрана» and answer with a question), `desktopCapturer` at the display's
   full resolution, Petya's own window steps aside while the screen is taken. A frameless picker window (`region.html`,
   no Node, sandboxed) shows the frozen screen; drag a rectangle, Enter takes the whole screen, Esc cancels. The answer
   comes back through the page title. The front app and window title are read after Petya stepped aside
   (`osascript`/System Events on macOS — the title needs Accessibility, otherwise the app name only; `GetForegroundWindow`
   on Windows).
3. **Card.** The image on a canvas with tools: frame, arrow, text, blur (pixelation in blocks — not reversible), undo.
   Each change saves a flattened PNG plus the shapes (`<userData>/screenshot-task/<id>-annotated.png`, `<id>.json`;
   the last 40 shots are kept). Fields: title, steps, expected, actual — editable.
4. **Draft.** A local vision model reads the (annotated, ≤1280 px) picture with the window title and the note and returns
   title/steps/expected/actual (JSON schema, Ollama `images`). Model choice: `gemma3:4b` from the optional models
   (`src/features/optional-models.cjs`), else another installed vision model (llava, qwen2.5vl, minicpm-v, …). Without
   one, the card offers «Скачать модель для скриншотов · 3,3 ГБ» (the optional-models download with its own notification)
   or manual filling; nothing is guessed.
5. **Tracker.** `k.links('task-tracker', payload)` — only connected providers (Jira, Asana) are shown; the provider hands
   a «Создай задачу в Jira: Баг. …» request to its own flow, which previews and creates only after «Создать».
   No tracker connected → a hint plus «Скопировать текст» / «Скопировать картинку».
6. **Attachment.** Petya's Jira and Asana flows create tasks from text only (checked: `src/workspace.cjs` issue creation
   and `src/asana.cjs` `apply` send JSON without files; their `task-tracker.cjs` providers return a chat request). Instead
   of changing those extensions, this app uploads the picture to the created task after the hand-off: the card watches
   the chat for the new task (Jira `…/browse/KEY` links of the connected site or «Создал задачу KEY», Asana task links)
   and offers «Прикрепить скриншот к KEY» (or a typed key/link). The upload happens only on that press:
   - Jira Cloud: `POST {jiraUrl}/rest/api/3/issue/{key}/attachments`, multipart `file`, `X-Atlassian-Token: no-check`
     (Basic API token, or Petya's Atlassian OAuth through the shared request, which rewrites to `api.atlassian.com`).
   - Asana: `POST https://app.asana.com/api/1.0/attachments`, multipart `parent` = task gid, `file` (Petya's Asana OAuth).

Nothing is created or uploaded without a press: the tracker's own confirmation, then «Прикрепить…».

## Shortcut
Registered with Electron `globalShortcut` while the app is added (re-checked every 3 s and on settings changes), released
when it is removed or Petya quits. Refused combinations: Petya's `CommandOrControl+Shift+F12` (stops computer control),
macOS screenshots Cmd+Shift+3/4/5, Cmd+Shift+Q, and basic editing keys. The default Cmd/Ctrl+Shift+2 does not collide
with any Petya shortcut (the only global one is Cmd/Ctrl+Shift+F12; in-window ones are Cmd/Ctrl+N, Enter, Tab, ↑).
On Windows, Excel uses Ctrl+Shift+2 for the time format — while Petya runs the global shortcut takes it; change it in the
settings card («Записать с клавиатуры», «По умолчанию», «Выключить»). A combination taken by another program is reported.
A press takes the region at once and opens the card in the chat through the ordinary request «скрин в задачу»
(notification `screenshot-task-shot`); the next request uses that shot instead of a new capture (within 3 minutes).

## Phrases
Own: «сделай баг из скриншота», «скрин в задачу», «заведи баг по этому экрану», «создай задачу по скрину»,
«скриншот в джиру», «оформи тикет из скриншота».
Near-misses (no turn, no offer): «сделай скриншот» / «сделай скриншот слака» — stays with Petya's computer control (a
screenshot of the screen or an app window into the chat and the attachments; this app does not take plain screenshots,
so there is one owner for them); «скриншоты стора», «обнови скриншоты в App Store» (store); «баг в коде», «почини баг в
коде» (coder); «заведи баг», «создай задачу в Jira: …» (Jira's own flow); «как сделать баг из скриншота?».

## Verified
- Unit (`node tests/screenshot-task.cjs`): routing, note, shortcut normalization/conflicts/validation, registration with a
  fake `globalShortcut` (default, change, removal, taken by another program), the turn with a stubbed capture (draft,
  no model, useless model answer, cancel, permission), the shortcut's shot reused, editor save validation, vision
  request (model, image, window, note), hand-off → recent task → Jira/Asana uploads with stubbed `s.request`
  (URL, headers, multipart fields), region math, front window parsing, the offer.
- UI (`tests/screenshot-task-ui.cjs`): the real picker window answers a mouse drag; the settings card records a
  combination; two cards on a drawn checkout screen; frame, arrow and blur drawn with real mouse events are saved with
  the PNG (blur checked as blocky pixels); the Jira button (Jira connected from the page) hands the bug to the chat and
  the card offers «Прикрепить скриншот к MOB-321» (upload stubbed, called only on the press). Screenshots:
  `petya-screenshot-task.png`, `-bottom.png`, `-bare.png`, `-bare-bottom.png`, `-settings.png` in the temp folder.
- Not verified live: macOS screen recording permission prompts and Retina cropping, the picker over full-screen apps and
  several displays, osascript/PowerShell window titles, a real vision model's draft quality, real Jira/Asana uploads
  (no credentials here), Windows global shortcut conflicts.
