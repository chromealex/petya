# Parallel Answer Preparation

Petya runs independent parts of processing at the same time with limited concurrency:

- After checking that the model is local, tool selection and topic classification run in parallel. The preliminary classification does not read services, does not perform actions and does not write messages to history. The result is used only for the same dialogue instance, the same original phrase and an unchanged state. When the context changes, a new classification is performed. Actions, clarifications, explicit topic selection and attachments keep the previous path.
- Web search reads up to three pages at the same time in separate hidden windows. Results and links keep the order of the search results. Failed sources are replaced with the next ones. The final model receives no more than three read pages. Disabling the module stops further processing.
- Mail summaries for different accounts run with at most two model requests at the same time. Each request receives only the messages of its own account. The final sections keep the order of the accounts; a summary error uses the previous fallback with message excerpts.

A regular single-model answer is not split word by word into independent tasks. The speed of parallel requests depends on the capabilities and settings of the running Ollama, the load and the available memory. The app does not restart someone else's Ollama and does not change its global settings. Confirmations and write operations are not parallelized.

Tests: tests/parallel-thinking.cjs, tests/dialogue.cjs, tests/semantic-tools.cjs, tests/web-search.cjs, tests/mail-skills.cjs.

Measurement on November 4, 2026, installed qwen3:4b on M3 Ultra: two classifiers after warm-up, three repetitions. Sequential 865/855/865 ms, concurrent 865/859/877 ms. The running Ollama's log shows a single slot (`n_slots = 1`), so two requests give no real compute speedup. The classifiers have been given the same `num_ctx: 8192`: before that, the second one used the automatically chosen 262144 and caused repeated model reloads. This fix concerns the short routing steps; the context of the main answer and documents is not reduced.

## Priority of the current question

A reproducible bug has been fixed: with an old dialogue «кгдер» (a garbled input), the classifier repeated the old clarification «Костя где?» (Where's Kostya?) in response to the new request «Ты тут?» (Are you there?). In the classification request, the current utterance is now passed as the last separate message; the instructions distinguish a standalone question from a continuation of the history. On the same local qwen3:4b, the control request after the fix gives `chat` instead of the old `clarify`.

Presence checks «ты тут» (are you there), «ты здесь» (are you here), «ты на связи» (are you on the line), «ты меня слышишь» (can you hear me) are handled by an exact short rule before the routers, attachments, meeting waiting and the model. They do not resume an old choice even without a question mark. Extended commands and quotes do not fall under this rule. History and pending actions are not deleted. Tests: current-question.cjs and current-question-ui.cjs.
