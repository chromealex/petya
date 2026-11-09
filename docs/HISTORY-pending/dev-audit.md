- Git is now entirely the «Git» app: the repository workspace, Git requests in the chat and the Git panel behind the
  chat's «Git» button moved out of Petya's core; nothing changes in how they work.
- «Сборки» now owns Petya's Slack/Jira build flows too: «почини билд» (an agent fixes a failing build from its log),
  «что с билдом» (asks the person responsible in Slack) and «следи за билдом» in a Slack thread. Companies that used
  them get the app added once by themselves; without it, these requests offer «Сборки».
- Unity Editor: chat requests, Unity project icons and the «Версия Unity» line come from the app; its progress card
  and Blender's use the notification center's common channel.
- For app authors: chat routes (`chat-route`), project kinds (`project-detector`) and the company lifecycle
  (`src/features/lifecycle.cjs`) — see docs/extensions.md; the plan for moving the rest out of the core is
  docs/core-audit.md.
