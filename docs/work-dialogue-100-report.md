# Another 100 Petya work dialogues

Date: 4 November 2026. Local Ollama, Qwen3:4b. New set: 100 dialogues with two turns each — 200 checks. Project, team and task data are entirely synthetic; work services are not called.

Before the changes: **171/200 turns, 74/100 dialogues**. Latest results after the fixes: **200/200 turns, 100/100 dialogues**.

| Category | Before | After |
|---|---:|---:|
| Status, assignee, due date, priority | 20/20 | 20/20 |
| Switching projects and keys | 20/20 | 20/20 |
| Role and actual workload | 19/20 | 20/20 |
| Number of tasks and free time | 20/20 | 20/20 |
| Missing information | 13/20 | 20/20 |
| Saved and current statuses | 17/20 | 20/20 |
| Namesakes and identical tasks | 10/20 | 20/20 |
| Blockers and release guarantees | 20/20 | 20/20 |
| New card after an old answer | 20/20 | 20/20 |
| Plans, drafts and instructions in the description | 12/20 | 20/20 |

## What was found and fixed

- Jira did not request the assignee, due date, last-modified date and links. Shortened bug cards lost additional fields. Now the required fields reach the saved snapshot and the next question. Extra profile fields and nested link cards are not copied into the context.
- The model inferred current workload and project leadership from the role; calculated a sprint percentage without its contents; guessed the number of hidden tasks; confused the absence of information about a vacation with the absence of a vacation. Restrictions based on the presence of confirmed data have been added.
- The model answered about old cards as if it were a fresh check and sometimes claimed it had contacted the service. The generator now explicitly distinguishes a saved snapshot from a new network request.
- Namesakes and identical task names now produce specific options with projects or keys. An explicit key is not replaced by an old topic.
- A task description containing an unrelated instruction could override the status or assignee. Unambiguous questions about structured fields are now answered directly from the card; free text does not override a field.
- In a draft, the side of a blocking link was mixed up. For a simple request for a draft about a blocker, the link direction is used instead of the model's guess. Discussing and preparing text do not confirm sending or changing tasks.
- In a deadline recommendation, the model attributed work happening right now to a person based on the task status. A simple request for such advice now relies only on the saved due date and phrases questions without inventing current activity.

The instructions and the app's answer processing were changed; the Qwen3 weights were not fine-tuned. Direct answers are used only for recognized unambiguous questions. Non-standard phrasings, complex questions and discussions remain with the model.

## How it was checked

First, a full run of the 100 dialogues was performed on the original handler, then a full run on the fixed one. After subsequent narrow changes, all affected scenarios were repeated. During the fixture audit, the save and update dates of cards were reconciled in 20 scenarios; these were repeated on both versions. The final result uses the latest answers actually received for each step. Previous answers and source versions are saved in JSON.

The criteria are the same for both versions: required semantic features, a ban on specific unconfirmed claims and manual review of the answers. Correct short answers such as «да» ("yes"), «никто» ("nobody"), «не указано в данных» ("not specified in the data") and «не отправлено» ("not sent") are not counted as errors in themselves; for the vacation question, a bare «нет» ("no") is not accepted as an absence of information. After the manual review, checks were added for the blocking direction, the explanation of the closing command and unconfirmed current workload.

Of the last 200 answers: 100 direct answers from the app and 100 answers involving a call to the local model. The report checks the entire answer handler, not just raw Qwen3 generation. A zero request count in a row means a direct answer, not a simulated model call.

The JiraInsights → Dialogue → request/answer handler chain was checked separately: requested fields are not lost, and the question about the assignee uses the card. Names without an assignment, ambiguity, unsupported formats, explicit facts, arithmetic hypotheses, link directions and saving of confirmed actions in the history were checked.

The old general set has been kept. Its 200 model requests without work data match the previous ones; the 200 handler steps were additionally replayed on the saved answers. This is a compatibility check, not a new live run of the old set.

## Files and running

- Scenarios: `tests/fixtures/work-dialogue-100.json`.
- Full answers: `docs/work-dialogue-100-before.json` and `docs/work-dialogue-100-after.json`.
- `npm run test:work-dialogues` — checks of the handler and Jira data transfer, without Ollama.
- `npm run test:work-dialogues:live` — 100 dialogues through the local Ollama.
- `PETYA_TEST_MODEL` selects the model, `PETYA_REPORT` the report file; `PETYA_WORK_IDS=27,43` repeats the selected scenarios.
- On this Mac with the system Node 14, `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/work-dialogue-live.cjs` is used.

## Limits of the result

These are text checks on synthetic data, without a microphone and without requests to a real Jira. They do not guarantee quality for arbitrary free-form phrasings or the completeness of connected sources. Missing fields are not made up: old saved cards may need to be refreshed to get the assignee and due date. A direct answer does not perform actions in services. The times in the JSON include queueing for the local model during several control runs and are not a comparative speed benchmark.
