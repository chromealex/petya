# «Петя, что с билдом» (Petya, what's up with the build)

_Owned by «Сборки» (`src/extensions/ci-builds/build-question.cjs`, see docs/apps/ci-builds.md); works while the app is added._

This command means asking people in Slack for the status, not just summarizing a saved log. Supported phrases: «что с билдом» (what's up with the build), «что с билдом 123» (what's up with build 123), «как там сборка» (how's the build going). If the same phrase says «не пиши» (don't write), «не отправляй» (don't send), «без отправки» (without sending), nothing is sent.

The context is taken from the active topic with a link to a Slack thread; otherwise from saved build discussions from the last 24 hours, taking into account the known project and the specified number. Several matching discussions require a choice. The thread content is re-read through the Slack API before sending. Incomplete loading, a change of topic/account during the choice, or several numbers without clarification stop the sending.

The responsible person is determined from recent messages in the current thread: the author of «собираю билд» (I'm building), «запустил сборку» (I started the build), or the single mention of a user in a message with explicit responsibility for the build. The build number, message age and negations are taken into account. QA is not chosen based on job title alone. If responsibility is stated without a Slack identifier or the phrase is not recognized, no recipient is invented. Several responsible people found are offered as buttons/numbers/exact display name; you can choose «в общий чат» (to the shared chat). Before a direct message, the account is checked via users.info.

If no personal responsible person is established, the question is sent as a new message to the channel of the current discussion. This can be a public or private work channel, but not an arbitrary #general. In a direct conversation with no established responsible person, clarification is required.

Petya sends only a fixed short question: what the current build status is, whether it is ready or there is a blocker, plus a link to the discussion. Logs and instructions from messages are not forwarded. Direct messages are sent via conversations.open; for a shared channel, a separate question with its own thread is created. No confirmation is required before an unambiguous send — this action is explicitly specified by the user's command.

Petya checks for replies in the thread of the sent question once a minute (a shared queue for several questions). In a direct message, the reply of the chosen recipient counts; in a channel, the reply of another person. The reply is quoted in the saved topic and arrives as a notification. Messages outside the question's thread are not tracked. A fully closed Petya does not receive replies; at the next launch, checking continues within 24 hours. There are no automatic repeated reminders to colleagues.

Repeating the command within 15 minutes returns the already sent question/received reply. The log is stored encrypted. If delivery is not confirmed due to a network failure, there is no automatic resend, including after a restart; Slack must be checked manually. Such records block a repeat until they are deleted by the shared memory retention period. When Slack is disabled, polling stops. «Очистить память» (Clear memory) deletes the local log but does not delete messages from Slack.

User Token permissions: chat:write, im:write, users:read plus the existing channel/thread read permissions. The new scopes have been added to the OAuth server sources. An already deployed OAuth server is not updated by this: it must be updated and Slack reconnected; with a manual token, add the permissions and reinstall the Slack app in the workspace. A missing_scope error is shown to the user, and the sending is not reported as successful.

Automated tests use a Slack mock and do not send real messages. The live scenario depends on the granted permissions and the availability of an accessible discussion.
