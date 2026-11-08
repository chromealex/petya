# Agent board

The «Агенты» screen shows who is working on what, side by side:

- **Петя** — background chats, Petya's own agents (with the chat that split the request) and agent subtasks that change data and wait for the user.
- **Программист** — coding runs of the coder extension (`topic.codingRuns`).
- **Claude** and **Codex** (OpenAI, GPT) — handoffs from `agent-history.json`, with Codex execution states from the task monitor.

Every source maps onto one set of statuses (`src/agent-board.cjs`): `waiting` (needs the user), `running`, `queued`, `sent` (handed off, progress not readable — Claude; shown as active for a day), `failed`, `stopped`, `done`. «Активные» shows the first four; «Все за неделю» adds tasks finished in the last 7 days.

The feature `src/features/agent-board.cjs` exposes `feature('agent-board','list')`. The renderer `src/ui/agent-board.js` refreshes the board when the screen opens, every 5 seconds while it is open, and on chat job and Programmer events. Cards open the chat, the agent's chat, check a handoff's progress or open the discussion it came from. The older handoff history stays below the board.
