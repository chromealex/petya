# Agent board

The «Агенты» screen shows who is working on what, side by side:

- **Петя** — background chats, Petya's own agents (with the chat that split the request) and agent subtasks that change data and wait for the user.
- **Программист** — coding runs of the coder extension (`topic.codingRuns`).
- **Claude** and **Codex** (OpenAI, GPT) — handoffs from `agent-history.json`, with Codex execution states from the task monitor.

Claude progress (macOS): the task monitor reads Claude chats through the Accessibility helper `native/claude-send.swift` (action `status`): it opens the saved chat link `claude://claude.ai/chat/<id>` without activating Claude, finds Petya's marker `[Петя: <id>]`, and reports `inProgress` (a stop button), `needsAttention` (an allow/deny prompt or a reply ending with a question) or `completed`, with the reply text up to the composer. A background check is skipped while Claude is in front, has an unsent draft or is not running; one chat per tick, each chat every 10 minutes, for 3 days after sending. «Проверить» runs the same check at once and may bring Claude forward, then returns to the previous app. The setting «Проверять ход задач в Claude по его чату» (`claudeStatusCheck`) turns the background checks off; like Codex polling, they also need «Сообщать об изменениях поручений». Claude's button labels are listed at the top of the status section of the helper: re-check them after Claude updates.

Every source maps onto one set of statuses (`src/agent-board.cjs`): `waiting` (needs the user), `running`, `queued`, `sent` (handed off, progress not read yet: active for 3 days for a Claude chat with a link, otherwise a day), `failed`, `stopped`, `done`. «Активные» shows the first four; «Все за неделю» adds tasks finished in the last 7 days.

The feature `src/features/agent-board.cjs` exposes `feature('agent-board','list')`. The renderer `src/ui/agent-board.js` refreshes the board when the screen opens, every 5 seconds while it is open, and on chat job and Programmer events. Cards open the chat, the agent's chat, check a handoff's progress or open the discussion it came from. The older handoff history stays below the board.
