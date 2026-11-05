# Confirmed chat changes

Result cards expose Edit for Jira issues and original local files. The composer hosts the editor; preparing a change adds a before/after card to the conversation. Only Apply writes to the service or file. Cancel discards a pending change. Undo prepares another explicit preview.

Jira supports one field per change: summary, plain-text description, or an assignee selected from Jira search. Replacing a description converts the entered text into ADF; the preview shows the text and undo restores the original rich ADF. Existing issue changes use the durable History journal and never authorize issue deletion. Files must be UTF-8, at most 512 KiB, and have an original absolute local path. File changes use a temporary sibling and atomic rename, preserving permissions and CRLF where present.

Each extension may export `change.cjs` with `load(row, services, check)`, `prepare(record, input, services, check)`, `apply(record, services, check, starting)`, and `undo(record, services, check)`. Jira additionally implements `people`. Adapters return private targets/snapshots and public editor/diff/receipt data. Call `check` after asynchronous reads and before writes, and `starting` immediately before the first write. Never accept arbitrary renderer paths or identifiers as targets.

The shared feature binds changes to company, project, chat, and version; serializes each operation and target; publishes stable notification events plus a snapshot; and persists uncertain outcomes rather than retrying them after a restart. External changes invalidate apply or undo. The filesystem check plus rename is not an operating-system compare-and-swap against concurrent external writers.

Tests: `tests/chat-changes.cjs`, `tests/chat-changes-jira.cjs`, `tests/history.cjs`, and `tests/chat-results.cjs`. Jira tests use a simulated API and do not modify live issues.
