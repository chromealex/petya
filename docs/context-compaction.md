# Context of any size

The local model has one fixed window (`src/model-context.cjs`, 16384 tokens). Petya never cuts text blindly to fit
it: originals are kept where they are stored (the archive), and what goes to the model is compacted.

## The compactor

`src/context-compactor.cjs` is shared by everything below:

* `tokens()` — a conservative estimate (about 2.4 characters per token for Cyrillic, 3.5 for Latin text and code).
* `excerpt()` — head and tail of a text at line or sentence boundaries, with a note of how much was left out.
* `sections()`, `lineChunks()`, `choose()` — Markdown split by headings, files split by lines with their real
  numbers, and the pieces that fit a budget chosen by relevance.
* `compact()` — map-reduce with the local model: pieces are summarised independently (keeping facts, numbers,
  names, decisions and line numbers), the joined summaries are compacted again until they fit. Summaries are cached
  by the hash of their source, purpose, question and model. A failed call falls back to an excerpt, never to
  nothing; `strict` mode reports the failure instead (for summaries that are stored).

## Chats

* Recent history (`src/conversation-archive.cjs`): messages go in full while they fit; a long one is compacted
  (its model summary when ready, its head and tail until then) instead of pushing everything before it out; older
  recent messages that no longer fit in full keep a short form.
* The archived part (older than the last 20 messages) keeps its extractive facts and, after
  `src/features/context-compaction.cjs` has run, a model summary of each block of 12 messages with both sides of
  the conversation. The feature works after a reply, only while no model request and no chat job is running, one
  block at a time; a summary is kept only if its block did not change meanwhile. Setting: `contextCompaction`.
* Every dialogue request is fitted to the window (`fit()` in `src/dialogue-request.cjs`): if the whole request does
  not fit, reference data is compacted first (restored history, summaries, service data), then older turns, and as
  a last resort the head and tail of an oversized request. The system rules are never touched, and every compacted
  part says so.

## Attachments

Text files, DOCX and every page of a PDF are read in full. When the files do not fit the window together with the
question, `fitFiles()` in `src/attachment-assistant.cjs` compacts each long file for that question into excerpts
that keep the original line numbers, so cited lines still point at the real file. The attachment stays whole.

## Skills

See [skills.md](skills.md): long skills are fitted per request; long reference files are read by sections.
