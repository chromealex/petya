# Local model comparison — 5 November 2026

The 80-turn live check (`src/live-check.cjs`, `PETYA_LIVE_MODEL=<model>`) was run on every local chat model
installed on the development Mac (96 GB, Ollama). Only turns answered by the dialogue model are scored
(`tests/results/score.py` on the Mac: 22–26 questions with an expected pattern: self-correction, follow-ups,
knowledge, everyday questions, translation, advice, «Важно», noise). Routing, Jira, Git, calculator, weather
and rates do not depend on the model and passed for all of them.

| Model | Correct | Errors in the run | Median answer |
|---|---|---|---|
| qwen3.5:9b | 23/26 (88%) | 1 | 3.5 s |
| qwen3:4b | 18/22 (82%) | 2 | 2.5 s |
| gemma3:4b | 21/24 (88%), 6 failed turns | 6 | 2.6 s |
| qwen2.5-coder:7b | 15/22 (68%) | 2 | 2.8 s |

- **qwen3.5:9b stays the default.** Its misses: «Назови проект Альфа, нет, проект Бета» looks the project up
  instead of naming it, and «Посоветуй фильм» asks for a genre instead of suggesting films.
- **qwen3:4b** is ~1 s faster but refuses everyday questions («Как сварить гречку?» — «не относится к моим
  возможностям») and loses «Важно» after a topic switch. Fine as the small default for weak machines.
- **gemma3:4b** (the vision model) answers well when it answers but breaks the answer format six times.
- **qwen2.5-coder:7b** is not suitable for conversation: «testing» for an arithmetic question, refusals.

The per-chat model picker lets a user try another model in one chat without changing the default.
