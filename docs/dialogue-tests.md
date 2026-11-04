# Dialogue checks

Run of November 4, 2026: 61 steps in `tests/dialogue-scenarios.cjs` and separate project memory scenarios passed. Live Qwen3:4b run: 22/22 utterances in seven multi-step scenarios. Full inputs, answers and timings are in `dialogue-live-results.json`.

Coverage: greeting after an old typo and after bugs; project list; clarification by name, number and ordinal word; wrong number; switching between Альфа/Бета (Alpha/Beta); previous version; the follow-up «сколько осталось» (how many are left); changing topic and returning to a saved answer; explicit refresh; service error; cancellation; negations and quoted commands; unknown assignee; no actual sending of a message; isolation of Slack channels by project and company; stale clarification.

Found and fixed: losing the follow-up when switching project, an old clarification after changing topic, running a check despite a negation, treating a selection number as a new project name, a made-up assignee, falling back to bugs on a greeting, an incorrect expansion of ANR, output of internal fields. The production model request has been moved to `src/dialogue-request.cjs`; the live tests use the same one.

Run from the repository root with a modern Node:

- `npm run test:dialogues` — scenarios with controlled data, also included in `npm test`.
- `npm run test:dialogues:live` — real local Ollama at 127.0.0.1:11434; default model `qwen3:4b`. Override: `PETYA_TEST_MODEL`.
- `PETYA_TEST_REPORT=/tmp/petya-results.json npm run test:dialogues:live` — save a report.

On this Mac, Electron is used instead of the system Node: `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/dialogue-scenarios.cjs` (similarly for dialogue-live).

Limitations: these are text dialogues, without a microphone or Whisper checks. Real work services are not called; their responses are fixtures. The live run checks the local topic router and the answer generator, not the app's entire IPC route; the main interface is checked by a separate Electron smoke test. Automated criteria check specific properties of an answer and do not guarantee the quality of arbitrary phrasings. Answers were reviewed manually: some stylistic and grammatical rough edges remain in places. The time in the report is not the full latency of a voice reply. The run is executed explicitly, without a background schedule.
