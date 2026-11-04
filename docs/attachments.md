# «Петя, посмотри вот это» (Petya, look at this)

A file can be selected with the «Показать файл» (Show file) button, dragged into the window, or a screenshot can be pasted from the clipboard. Then ask a question in the command field, press «Разобрать вложения» (Analyze attachments) or say «Петя, посмотри вот это» (Petya, look at this). While there are attached files, the next command is processed as a question about them. To return to ordinary actions, remove the attachments you no longer need.

Supported: TXT, MD, LOG, CSV, JSON, XML, YAML and common text code formats; DOCX (main text), PDF with a text layer; PNG, JPEG and WebP; MP4, MOV, WebM video. Up to 5 files: documents/images up to 10 MB each, video without an artificial size or duration limit. For PDF the first 30 pages and at most 40000 characters are read, for texts — 40000 characters per file, up to 60000 in total per request. Petya reports the limits. PDF text is extracted by the built-in PDF.js 6.5.438 (Apache-2.0 license in src/vendor/pdfjs/LICENSE), without external programs or a network service. DOCX is read without executing macros or unpacking to disk; formatting, images and footnotes are not taken into account. Scanned PDFs without text require an image of the needed page.

Screenshots are downscaled to 1600 pixels on the long side. They are passed only to a local Ollama model with the vision capability. If there is no such model, the attachments section offers the «Подготовить модель для скриншотов» (Prepare the screenshot model) button: it downloads gemma3:4b via Ollama (several gigabytes) and shows the preparation progress. The download can be stopped and retried. Petya's text model does not change. Ollama cloud models are rejected for attachments. Image recognition quality depends on the selected local model; small text may be illegible.

Analysis creates a separate topic. In it you can ask follow-up questions, return to it after a restart, and delete it with the «Удалить эту тему и её вложения» (Delete this topic and its attachments) button. The content and answers are stored together with the topic in the OS encrypted storage and are deleted according to the general context retention period. Original files are not modified. Before analysis starts, attachments are kept only in memory, for up to 30 minutes or until the app exits. Deleting the topic also deletes the extracted text and normalized images.

Files are data, not instructions: Petya does not execute code, macros or commands from them. There is no automatic forwarding of attachments to Claude/Codex or to web search. If the local model is not ready, the topic is saved with a clear error; after setup you can repeat the question.

Checks: DOCX, limits and attachment lifetime, absence of a vision/cloud model, IPC for topic creation/deletion, a text PDF with Cyrillic in real Chromium, UI regression tests. The text model's answer is checked on a synthetic file. A real vision model was not downloaded automatically.

## Screenshots, code errors and video

For large screenshots the overall view is supplemented with full-resolution fragments (up to six 1280×1280 tiles, if the whole image fits in them). This helps read small errors and code. For longer/larger screenshots Petya asks for a larger fragment. This is recognition by a vision model, not a guaranteed-accurate text parser: illegible characters must be marked explicitly.

MP4, MOV, WebM video — without a size or duration limit, up to 16 MP. Decoding is performed by a hidden sandboxed Chromium without network access and without playing sound to the user. An unsupported codec returns an error; MP4/H.264 and WebM are preferred. Up to 12 evenly spaced frames up to 1600 px with timestamps are saved; the original clip is not saved. Sampling may miss a short event: for an exact moment, attach a short fragment or a screenshot. Speech is recognized by local Whisper in fragments with timestamps and is considered together with the frames. Details and limitations are in video-audio.md.

Each image view is first read separately by the vision model; then the local text model answers the question based on the observations with file names. This also applies to a single screenshot. The request keeps the file name, the frame/region label, the context of the source discussion and the question. The analysis highlights the visible error text, the actual behavior of the game/interface, hypotheses and missing reproduction steps. Up to 24 frames/views per analysis. The model must distinguish an observed symptom from a proven cause. The vision model is not installed automatically; use the existing model preparation button.

## Media from Telegram and Slack

The «Медиа из Telegram / Slack» (Media from Telegram / Slack) button shows up to 80 recent attachments from synchronized chats of the current company. Telegram: only the selected chats of the currently connected account. Slack: only the current channel selection; access is re-checked before loading a message. The files:read scope is required. Files from Slack external storage are not downloaded. The Slack token is sent only to files.slack.com, redirects are prohibited; size is limited both by metadata and during reading.

You can say «разбери видео из телеграма» (analyze the video from Telegram) or «посмотри скрин из слака» (look at the screenshot from Slack). If there are several attachments, Petya offers a list. The chat and its saved text are added to the file's source; if the connection changes or the context is deleted, an unfinished import is discarded. Telegram synchronization collects only media metadata; downloading and analysis happen on request.

Checks: a real synthetic WebM, timestamps and different frames, rejection of a corrupted video, screenshot fragments; test model answers, checks of source/size boundaries, Telegram messages with media only. Real messages and user videos were not downloaded during tests; the quality of analyzing a real bug depends on the local vision model.


## Code, log and image analysis (November 2026)

SQL, CJS/MJS, JSX/TSX, Java, Go, Rust, C/C++ and shell sources are now read as text without looking for an external handler. Code is not executed. For technical files the installed local `qwen2.5-coder:7b` is used if available; otherwise, the text model selected by the user. There is no automatic download when a file is opened. You can prepare the model with `ollama pull qwen2.5-coder:7b`; the general conversational mode does not change.

The answer may contain «Исходные строки (дословно)» (Source lines (verbatim)): the app checks the file name and line number, then copies the line from the saved text. This confirms the content of the source, but by itself does not prove the model's diagnosis.

An empty, invalid or limit-truncated answer is retried once; a repeated error is returned explicitly. A network failure is not masked by regeneration. Text from a screenshot does not gain the right to perform actions. Recognition and conclusions can still be wrong; exact results and remaining failures are listed in `material-analysis-200-report.md`.

Checks: `npm run test:materials`; live suites — `npm run test:logs:live` and `npm run test:images:live`. Each contains 100 questions about 50 different materials. Images are real PNGs passed to the local vision model. `PETYA_REPORT` sets the report path, `PETYA_MATERIAL_IDS=11,35` selects scenarios.
