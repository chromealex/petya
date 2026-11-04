# Review, Corrections and Watching

All commands are available by voice and by text. Materials are reviewed locally through Ollama; Petya does not run code from logs or saved solutions.

## Correcting the context

- «Я про другое» (I mean something else) — choose a different saved material.
- «Не этот лог, предыдущий» (Not this log, the previous one) — switch to the previous available log.
- «Я про Android, не про iOS» (I mean Android, not iOS) — look for material for the corresponding platform; an ambiguous choice is clarified with buttons or a number.
- «Возьми тред, который сейчас открыт» (Take the thread that is open now) — read specifically the active Slack app. If there is no live accessible thread, history is not substituted for it.
- «Нет, причина другая — вот здесь смотри» (No, the cause is different — look here) — reconsider the conclusion in the current topic. You can attach a new file; without a specific line Petya will ask for clarification. Corrections are saved in the topic and passed on in subsequent local reviews.

## Showing the source

«Покажи, откуда ты это взял» (Show where you got this from) / «покажи строку ошибки» (show the error line): show the verbatim lines with signs of an error and highlight them in Petya's window. If the permalink is known, the Slack message is opened. The highlighting is in Petya, not in the Slack interface. These are verifiable source fragments, not a claim that the model has proven causality. The line number refers to the saved fragment. For files without an explicitly marked error, Petya asks you to specify the conclusion to verify.

## Comparing failures

«Сравни с прошлым падением» (Compare with the previous failure): choose the previous saved log of the same known platform/project. If there are several candidates, choose a number or a button. The model receives limited fragments of both logs and exact lists of matching, added and disappeared error lines. It must separate textual matches from a hypothesis about a common cause and must not invent code changes. Continuing the comparison uses the saved link to the previous topic; after that topic is deleted, its material is no longer available.

## Watching a build

«Следи за этим билдом» (Watch this build) / «следи за билдом 123» (watch build 123) — watch a specific number in a specific Slack thread. Without a link to the thread or an unambiguous number, Petya asks for the details. There is no direct connection to CI: Petya tracks Slack bot messages with the build number and an explicit success/failure status. Formats that do not contain such text are not recognized. «Покажи наблюдения» (Show watches) shows states and errors, «останови наблюдение» (stop watching) cancels the current topic's watch; «останови все наблюдения» (stop all watches) cancels all of them.

Petya checks one page (15 messages) at a time, no more often than once every 61 seconds, and respects Retry-After. Long threads are read gradually; several watches share a queue. Reading Slack context uses a separate queue, so under the shared Slack rate limit checks may be delayed. Notifications arrive on a result, unavailability or expiry of the term (24 hours), with no periodic reports. Old results do not trigger notifications at startup; an edit of an existing bot message with a new status is taken into account. States, message signatures and the fact of completion are stored encrypted, so a restart does not repeat a notification. Up to ten active watches. When the Slack account changes, the watch stops, and when the module is disabled it is not polled. A fully closed app cannot check threads; after launch, checking continues until the term expires.

## Remembering a solution

«Запомни: у нас это чинится вот так — …» (Remember: here we fix this like so — …) saves the fix text itself together with the exact error lines of the current material, the project and the known platform. If the project is not determined, reply «для проекта Название» (for project Name). When such a line recurs in this project, the solution is passed to the model as past user experience, not as a proven diagnosis. If the project of a new log is unknown, Petya asks you to specify it before applying the solution. Commands from a solution are never executed automatically.

«Покажи сохранённые решения» (Show saved solutions) displays a numbered list; «забудь решение 2» (forget solution 2) deletes the selected solution. Up to 100 solutions. Unlike temporary logs, explicitly learned solutions are kept until the user deletes them, without rebuilding the app.

Context and watches are deleted according to the shared retention period of 1–7 days. «Очистить память» (Clear memory) also cancels watches; learned solutions are deleted with a separate command. Reading the real Slack requires OS and Slack access; local automated tests use controlled snapshots/API responses, not real CI.
