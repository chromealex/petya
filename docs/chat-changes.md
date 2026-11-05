# Confirmed chat changes

Result cards expose Edit for Jira issues and original local files. The composer hosts the editor; preparing a change adds a before/after card to the conversation. Only Apply writes to the service or file. Cancel discards a pending change. Undo prepares another explicit preview.

Jira supports one field per change: summary, plain-text description, or an assignee selected from Jira search. Replacing a description converts the entered text into ADF; the preview shows the text and undo restores the original rich ADF. Existing issue changes use the durable History journal and never authorize issue deletion. Files must be UTF-8, at most 512 KiB, and have an original absolute local path. File changes use a temporary sibling and atomic rename, preserving permissions and CRLF where present.

Each extension may export `change.cjs` with `load(row, services, check)`, `prepare(record, input, services, check)`, `apply(record, services, check, starting)`, and `undo(record, services, check)`. Jira additionally implements `people`. Adapters return private targets/snapshots and public editor/diff/receipt data. Call `check` after asynchronous reads and before writes, and `starting` immediately before the first write. Never accept arbitrary renderer paths or identifiers as targets.

The shared feature binds changes to company, project, chat, and version; serializes each operation and target; publishes stable notification events plus a snapshot; and persists uncertain outcomes rather than retrying them after a restart. External changes invalidate apply or undo. The filesystem check plus rename is not an operating-system compare-and-swap against concurrent external writers.

Tests: `tests/chat-changes.cjs`, `tests/chat-changes-jira.cjs`, `tests/history.cjs`, and `tests/chat-results.cjs`. Jira tests use a simulated API and do not modify live issues.

## Natural requests and refinements

Explicit commands can prepare assignee changes, summary changes, rich-description append operations, and literal file replacements. The source remains the selected result card or an exact issue key/file name already present in the current chat. Ambiguous targets keep the instruction while the user chooses a result; unrelated subsequent requests clear that pending selection.

Assignee lookup never picks the first of several matches. Missing acceptance-criteria text opens a focused append field instead of inventing requirements. Appending clones the original ADF and adds paragraphs, retaining existing rich content and links. File previews show differing lines; insertions/deletions show the changed span. “Only the second item” supersedes the earlier preview, so its old Apply button cannot write. Restriction supports plain numbered/bulleted file lists and newly appended Jira list text; ambiguous structures request a more precise edit.

`tests/chat-change-natural.cjs` covers multi-turn edits and `tests/chat-change-ui.cjs` exercises an isolated Electron window, including report-channel lookup and the return-summary layout. No live Jira or Slack writes are used.

Report sharing uses a bounded initial channel list and an inline exact-name/link lookup. Search preserves the draft text and never sends; Enter in the lookup field performs only search. The final send revalidates the selected channel by ID with [Slack conversations.info](https://docs.slack.dev/reference/methods/conversations.info/), rather than requiring another full directory scan.
