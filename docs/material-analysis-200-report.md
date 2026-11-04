# Code, log and image analysis: 200 scenarios

November 4, 2026. The real Peter attachment handler was tested: file intake, image normalization, local model selection, the Ollama request and response parsing. Code from the materials was not executed; work accounts and employee data were not used.

| Set | Before | After |
|---|---:|---:|
| Code and logs | 67/100 | 91/100 |
| Images | 88/100 | 97/100 |

## Composition and criteria

Code and logs: 25 different logs and 25 code fragments, each with two independent questions — find the problem and propose a concrete fix/check. 100 checks in total. The set includes correct materials, ambiguous causes and foreign instructions inside files. Languages: JavaScript, Python, C#, SQL; logs covering network, permissions, memory, database, build, Android and Unity.

Images: 50 real PNGs and 100 independent questions. Ten categories: console errors, task boards, charts, tables, monitoring, form validation, error stack traces, insufficient information, foreign instructions, dependency diagrams. PNGs were passed to the local vision model through the production readImage; the HTML text and reference answers were not passed to it. These are mostly readable work screenshots with English labels and Russian questions, not photographs or a general OCR benchmark.

The same final criteria were applied to both versions. After reviewing the answers, the acceptable wordings were refined (for example, code 429 without the HTTP prefix, a Russian translation of a field name) and checks for detected false claims were added. The original score of each row is also preserved. Matching key indicators does not guarantee that the whole explanation is error-free; limitations and remaining failures are listed separately below.

## Changes

- Instructions for analyzing exact text, reading an image and answering from observations were separated. Text files are no longer offered to be read as OCR.
- For technical files the local qwen2.5-coder:7b is selected when available; the main conversational mode does not change. For an image, gemma3:4b extracts observations, then the selected text model (qwen3:4b in the run) answers the question. The models were prepared locally; there is no automatic download when a file is opened. [Specialized model card](https://ollama.com/library/qwen2.5-coder:7b).
- sourceLines references are checked by name and an existing line number; the source line is copied by the app verbatim. Unknown/ambiguous files and line numbers are discarded. This is not a check of whether the diagnosis is true.
- An empty, invalid or limit-truncated answer is retried at most once. A network error is not masked by regeneration.
- Service line numbers are removed from fully numbered blocks of suggested code so that the block can be copied; explicitly requested numbering is kept. A single word without a source in place of the requested analysis is rejected and retried. This is a limited check of the answer's form, not a universal protection against instructions in a file.
- SQL, CJS/MJS, JSX/TSX, Java, Go, Rust, C/C++ and shell are read as plain text without any external format handling.

The first code run used the previous handler with qwen3:4b, the final one used the fixed handler and qwen2.5-coder:7b. Therefore this is a comparison of the whole workflow, not an independent experiment with only the prompt or only the model. Model weights were not fine-tuned. Between the full runs there were targeted checks and unsuccessful instruction variants; the final table uses the last full runs plus a subsequent targeted check of six cases after adding the check for meaningless answers and the removal of line numbers in suggested code. The previous results of these six cases are preserved; they were not replaced with the best attempts. Positive criteria assess the answer itself, without the automatically added source lines. Manual notes about erroneous explanations and incomplete fixes lower the final score and are stored in the JSON.

## Remaining failures: code and logs

- No. 37, json: Найди проблему в этом материале. Назови подтверждающую строку или выражение, отдели факт от предположения. (Find the problem in this material. Name the confirming line or expression, separate fact from assumption.)
  Received: Проблема в строке 2: Input: {"enabled":true,}  Исходные строки (дословно): config.log:2 Input: {"enabled":true,} (The problem is in line 2: … Source lines (verbatim): …)
  Criterion: Missing: запят|JSON
- No. 50, untrusted: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи. (Propose a minimal fix or the next concrete check for this material. Do not execute anything. If no error is visible, say so.)
  Received: 
  Criterion: Missing: upstream|тайм.?аут|timeout|abc42; Модель вернула отдельное слово вместо разбора материала. Повторите вопрос или разберите меньший фрагмент. (The model returned a single word instead of analyzing the material. Repeat the question or analyze a smaller fragment.)
- No. 62, js-zero: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи.
  Received: Код корректен. Нет видимых ошибок. (The code is correct. No visible errors.)
  Criterion: Missing: \?\?|nullish|undefined|===\s*0
- No. 64, js-mutate: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи.
  Received: Код корректен. Нет видимых ошибок.
  Criterion: Missing: \.\.\.state\.user|structuredClone|глубок|вложенн.*коп|коп.*вложенн|копи.*user|user.*копи
- No. 65, js-race: Найди проблему в этом материале. Назови подтверждающую строку или выражение, отдели факт от предположения.
  Received: Проблема в коде заключается в том, что метод `forEach` не поддерживает асинхронные колбэки. Это приводит к тому, что все асинхронные операции выполняются параллельно, а не последовательно, как ожидалось. В результате функция `saveAll` завершается слишком рано, прежде чем все файлы будут записаны.  Исходные строки (дословно): files.js:3   items.forEach(async item => { await fs.promises.writeFile(item.path, item.text); }); (The problem in the code is that the `forEach` method does not support async callbacks. This causes all async operations to run in parallel rather than sequentially as expected. As a result, the `saveAll` function finishes too early, before all files are written. Source lines (verbatim): …)
  Criterion: Manual audit: forEach accepts an async callback; the problem is the missing await, not a lack of async support or a requirement for sequential execution.
- No. 68, js-splice: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи.
  Received: Цикл for не учитывает изменение длины массива при удалении элементов. Используйте while для корректного удаления элементов.  Исходные строки (дословно): filter.js:2 for (let i = 0; i < values.length; i++) { (The for loop does not account for the array length changing when elements are removed. Use while to remove elements correctly. Source lines (verbatim): …)
  Criterion: Missing: filter|обрат|i--
- No. 70, js-regex: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи.
  Received: Код корректен. Нет видимых ошибок.
  Criterion: Missing: lastIndex|убра|без.*g
- No. 72, py-default: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи.
  Received: Минимальное исправление: добавьте аннотацию типа для параметра `items` и используйте `None` по умолчанию. Это предотвратит использование изменяемого объекта по умолчанию в каждом вызове функции.  Исходные строки (дословно): items.py:1 def append_item(value, items=[]): (Minimal fix: add a type annotation for the `items` parameter and use `None` as the default. This will prevent using a mutable default object in every function call. Source lines (verbatim): …)
  Criterion: Manual audit: Replacing the default with None is not accompanied by creating a new list before append; the proposed change is incomplete.
- No. 88, sql-join: Предложи минимальное исправление или следующую конкретную проверку по этому материалу. Ничего не выполняй. Если ошибки не видно, так и скажи.
  Received: В данном SQL-запросе нет явных ошибок, но есть потенциальная проблема с логикой. Запрос возвращает пользователей, у которых есть оплаченные заказы, а также пользователей, у которых нет заказов. Если это не является желаемым поведением, следует добавить условие для включения пользователей без заказов. Например:  ```sql SELECT u.id, o.id FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE o.status='paid' OR o.id IS NULL; ```  Исходные строки (дословно): report.sql.txt:1 SELECT u.id, o.id FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE o.status='paid'; (There are no obvious errors in this SQL query, but there is a potential logic problem. The query returns users who have paid orders as well as users who have no orders. If this is not the desired behavior, a condition should be added to include users without orders. For example: … Source lines (verbatim): …)
  Criterion: Manual audit: It wrongly claims that the original WHERE already includes users without orders.

Real model requests in the final run: 101. All 100 checks were performed with real model calls; no reference answers were substituted.

## Remaining failures: images

- No. 11, image-06: Сколько карточек в колонке In Progress? Ответь числом. (How many cards are in the In Progress column? Answer with a number.)
  Received: 2
  Criterion: Missing: 1
- No. 19, image-10: Сколько карточек в колонке In Progress? Ответь числом.
  Received: Не удалось прочитать количество карточек в колонке In Progress. Пожалуйста, предоставьте крупный фрагмент данных. (Could not read the number of cards in the In Progress column. Please provide a larger fragment of the data.)
  Criterion: Missing: 5
- No. 53, image-27: К какому полю относится сообщение об ошибке? (Which field does the error message belong to?)
  Received: Input Field
  Criterion: Missing: Password

Real model requests in the final run: 200. All 100 checks were performed with real model calls; no reference answers were substituted.

## Reproduction

- `npm run test:materials` — checks of processing, model locality, source references, retries and format reading.
- `npm run test:logs:live` — 100 code and log tests.
- `npm run test:images:live` — 100 PNG tests.
- `PETYA_REPORT` sets the JSON report; `PETYA_MATERIAL_IDS=11,35` selects cases. A running Ollama is required. On a Mac with system Node 14 you can run `env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tests/material-analysis-live.cjs images`.
- Fixtures: `tests/fixtures/material-analysis/`; reports: `docs/material-code-{before,after}.json`, `docs/material-images-{before,after}.json`.

Limitations of small local models remain: a wrong diagnosis, an incomplete fix, a lost field and an incorrect count of elements are possible. A request for a larger fragment counts as a failure if the field on the test image was readable. This set does not prove protection against all instructions in documents, the quality of arbitrary photographs, or the correctness of a proposed fix on a full project.

## Project and build verification

After the changes were installed, all 80 test scripts of the common suite and 6 packaging verifier checks passed. Both builds were created via `python3 scripts/build.py`; the composition and contents of all 154 src files were compared. macOS: Developer ID Application: Alexander Silaev (2CGDESX4ZX) was preserved, launching the installed app and the tray lifecycle were checked. On test shutdown the previous IPC messages about an already destroyed window remain; the launch check completed successfully. Windows: the installer was built and its contents checked; Windows was not launched here.

Current files: `Petya.app` and `Petya-Setup.exe` in the project root. Analyzing a single image now uses two model stages and may take longer; measurements during tests with several loaded models are not a comparative speed test.
