# Petya answer check: 100 dialogues

Date: 4 November 2026. Model: local Ollama `qwen3:4b` (Q4_K_M). 100 two-step dialogues, 200 turns in total in each full run.

Before the changes: **185/200 turns, 85/100 dialogues**. After: **200/200 turns, 100/100 dialogues**.

| Category | Before, turns | After, turns |
|---|---:|---:|
| Calculations | 20/20 | 20/20 |
| General knowledge | 17/20 | 20/20 |
| Memory | 20/20 | 20/20 |
| Corrections | 20/20 | 20/20 |
| Translations | 19/20 | 20/20 |
| Unknown work data | 17/20 | 20/20 |
| Prohibitions | 13/20 | 20/20 |
| Action confirmation | 19/20 | 20/20 |
| Instructions inside quotations | 20/20 | 20/20 |
| Topic change | 20/20 | 20/20 |

## Changes

- The generator instruction was rewritten: common knowledge is separated from private work data; corrections, topic changes, answer format, prohibitions and action confirmation were clarified.
- The ANR (Application Not Responding) reference note was kept for questions about this term; it prevents substitution with a network error when the conversation continues.
- Reasoning is enabled for Qwen3, and the generation limit was increased to 2048 tokens. For other model families, reasoning mode is not enabled automatically.
- When the limit is exhausted and there is no valid JSON, one local retry without reasoning is performed. The question, history and format are preserved. Network errors do not trigger a retry or interpretation; a repeated cutoff remains an explicit error.
- Simple greetings get a direct answer using the informal «ты» ("you", informal), without calling the model; questions and commands after a greeting are not intercepted.
- Unambiguous single prohibitions are confirmed directly, without calling the model. Questions, quotations and compound requests go through normal processing.
- The retry parameter is passed to the app's main handler and to the existing live test. The model weights were not changed.

## Errors found

The original version confused the Earth's satellite with Mars, answered «нет данных об исполнителе» ("no data about the assignee") to a question about Pushkin, named oxygen in connection with photosynthesis, translated moon as «лунь» (harrier, a bird), lost the meaning of a prohibition and once claimed that it had bought a ticket. On an intermediate variant, short prohibitions could also trigger a greeting or a false «настройки сохранены» ("settings saved"); direct confirmation rules out these answers for an unambiguous prohibition. In the intermediate reasoning mode, cutoffs without a final JSON were found; limited recovery was added for them.

An intermediate replacement of the instruction alone did not give enough improvement and was not installed. An intermediate full run with reasoning was stopped after the cutoff was reproduced; the variant with recovery was re-checked on all 100 dialogues. Then, for the detected instability of short prohibitions, a direct answer was added and all 10 affected dialogues (20 turns) were repeated. An additional check through the router found an incorrect expansion of ANR; the reference note from the previous instruction was restored and all 11 affected dialogues (22 turns) were repeated. During the manual review, two instances of the formal «вы» ("you", formal) in greetings were found: a direct answer to simple greetings and a general criterion of informal «ты» address were added, and then the greetings/ANR group was repeated once more. The final table uses the latest results; previous attempts of these turns are saved in the previousAttempt field.

Seven multi-step scenarios (22 turns), including a confirmed action in the history, were additionally checked through the existing router. The results before and after restoring the ANR reference note are nested in routingRegression of the final JSON. The criteria for greetings and honest answers about missing information were refined: they are no longer mistakenly flagged as an invented assignee.

## Reproduction

- `npm run test:answers` — checks of the request and the handler, without Ollama.
- `npm run test:answers:live` — all 100 dialogues through the local Ollama; real external services are not called.
- `PETYA_TEST_MODEL` selects the model; `PETYA_REPORT` sets the report path. By default, the report is saved to the system temporary directory.
- On this Mac, the system Node 14 is too old. `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/answer-100-live.cjs` is used.

Source scenarios: `tests/fixtures/answer-100.json`. Full turns, answers and durations: `docs/answer-100-before.json` and `docs/answer-100-after.json`.

## Speed and limits of the check

Median turn time: 0.25 s before, 4.01 s after. P95: 0.57 s before, 13.94 s after. Retries due to the limit in the final run: 4. Reasoning increases latency; this is the time of the text call, not of a full voice answer. This is not a controlled benchmark: some of the additional checks ran at the same time and created a queue for Ollama.

The real `dialogueRequest` and `localAnswer` are tested on a synthetic history. These 100 dialogues isolate the answer generator: they do not test speech recognition, routing through the interface or the accuracy of data from real services.

Automatic scoring uses meaning and format criteria based on regular expressions. It allows е/ё and several correct phrasings of missing data. The same criteria were applied to both runs. Full answers are available for manual review; a passing set does not guarantee the absence of errors for arbitrary questions.

## Project and packaging checks

After the changes were installed, 77 JavaScript test files passed. The macOS build was launched by the builder check and keeps Developer ID Application: Alexander Silaev (2CGDESX4ZX).

During Windows packaging, a false package-contents error caused by the Python cache was found. The check now excludes only `.pyc`/`.pyo` inside `__pycache__`; real sources, extra files and missing local imports are still checked. Six tests were added: `python3 tests/package-verifier.py`.
