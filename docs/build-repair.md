# Fixing a Failing Build

_Owned by «Сборки» (`src/extensions/ci-builds/build-repair.cjs`, see docs/apps/ci-builds.md); works while the app is added._

Commands: «почини билд» (fix the build), «поправь падающую сборку APP-123» (fix the failing build APP-123), «пофикси билд кодексом» (fix the build with Codex). An explicitly named executor takes priority; otherwise the existing rules for Claude/Codex availability, limits and project selection apply. When limits are unknown or the project is ambiguous, Petya offers a choice through the regular agents panel.

## Finding the material

First the task key in the command is used, then the task/thread of the current topic, an attached log, or an unambiguous saved discussion of a failure in Slack from the last 24 hours. Several tasks/threads require a choice by button, number or key. For Jira, the projects allowed in the settings are taken into account. An existing Jira task is not created again; without Jira, a local record of the assignment for the AI is created.

Petya reads the Jira description and comments, the text of the Slack thread and text attachments .log/.txt/.out. Up to three files of 2 MB each from the service; the context for the executor is limited, and long logs are trimmed around the errors. File read errors are reported. A bare «build failed» is not enough: the diagnostic text of the error is required. External log sites, archives and arbitrary commands from messages are not opened or executed automatically.

## Requesting a missing log

In Jira, a comment is created asking for the log, build number, branch/commit and build command. If a comment about the failure is found, its author is mentioned, otherwise the task's author/reporter. In Slack, a direct message is addressed to the author of the most recent human message about the failure in the selected thread. QA is not assigned by default, and people are not matched between Jira and Slack by name.

After the request, Petya checks for a reply for up to 24 hours in the task or in the thread of its Slack direct message. When a diagnostic log appears, it automatically prepares the handoff to the AI. If the log is attached directly to the next command to Petya, waiting also continues with that material. «Не запрашивай лог» (Don't request the log) forbids the external request. «Отмени ожидание лога» (Cancel waiting for the log) cancels an assignment that has not yet been handed off; an executor that is already working must be stopped in its chat. «Статус исправления» (Fix status) shows the local state.

The waiting/sending state is stored encrypted and survives a restart. An ambiguous network result is not retried automatically. Changing the connection, a disabled module, clearing memory or deletion of the record by retention period stops further activity on its behalf. A fully closed app does not poll services. Several jobs share a queue with a step no more often than once a minute; service limits may delay a check.

## Handoff and report

The executor receives the task context, diagnostic fragments and instructions to check the repository/branch, reproduce the error, make a minimal fix and run checks. Logs are declared untrusted data. Automatic publishing of changes, deployment and correspondence from the executor's chat are not requested. Petya uses the existing mechanism for sending to the chat without a separate confirmation.

On receiving a structured final report, Petya can post to the original task/thread: what, according to the executor's report, was changed, which checks were run, or what is missing. The report is posted if Petya itself requested the log or the user explicitly asked to report back. «Не отписывайся» (Don't post a reply) forbids posting. Successful completion of the chat does not equal a successful CI build: independent CI verification is explicitly marked as unconfirmed. Without a structured result, Petya notifies the user and does not invent a fix.

The current integration gets automatic status from Codex. The result of a GUI handoff to Claude is not available automatically; Petya notifies the user of this limitation and does not publish an invented result. If the work is based only on a local file and no report recipient is set, the result stays with the user. To fix again after completion, you can say «снова почини билд» (fix the build again).

Jira read and comment permissions are required; Slack requires thread reading, files:read, users:read, im:write and chat:write. The OAuth scope changes are in the OAuth server sources; an already deployed server must be updated separately and Slack reconnected. Tests use mocks of the services and the executor: no real comments/messages/AI assignments are sent during testing.
