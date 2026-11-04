# Statuses and voice recovery

While a command is running, the panel shows the stage and the elapsed time. Clarifying questions and answer options are spoken aloud. A question can be answered with a name, a number, or the words «первый» (first), «второй» (second), «третий» (third).

After a safe failure while reading attachments or selecting context, say «Петя, повтори» (Petya, repeat) (or «повтори» (repeat) in an active dialog). Petya keeps the original command in the window's memory and uses the results of stages already completed. A retry button is also available. Pressing it again during execution does not start a second request. Restarting the app clears the retry state.

For the question «что с билдом» (what's up with the build) in Slack, an unambiguous recipient does not require confirmation. After a search error you can say «повтори» (repeat). A retry is tied to the company, connection and topic; it is valid for 10 minutes. A sent message and a send with an unknown result are not sent again. If the recipient is ambiguous, Petya reads out the options.

Automatic retry of arbitrary external actions is not enabled: if the result of a send is unknown, the interface keeps the text and reports that the result needs to be checked. Cancelling an external action that has already been sent is not supported by this feature.

## Repeated utterances, November 4, 2026

Added `tests/voice-conversation.cjs`: five consecutive PCM utterances through AudioListener and VoiceTurn, with suppression of the reply's echo, a missed `ended` event, a hung `play()`, recovery of a suspended AudioContext, and cancellation. After a voice reply, a 12-second follow-up window opens without needing to say «Петя» (Petya) again. After it, addressing Petya is required again. Silence by itself does not send a request.

The player checks that currentTime is advancing: if playback finishes without an event or there is no progress for 5 seconds, it releases the microphone. Capture tries to resume a suspended AudioContext; if no PCM frames arrive for 6 seconds, it shows an explicit error. Added a microphone level and state indicator, without writing audio to disk.

An old Base server on port 8080 was found on the machine and was being mistaken for the current server. Now the built-in local pool uses its own main port and the selected model. The other process is not terminated. Three consecutive synthetic phrases were successfully recognized by a real Small server while 8080 was occupied. This is not a test of a live USB microphone; its symptom remains unverified until dictation is repeated in the updated build.
