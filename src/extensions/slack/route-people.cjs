// Chat route «people» (src/features/chat-routes.cjs): «возьми имена из Jira, должности из Slack» — a list of the Jira
// people with their Slack job titles (jira-people.cjs); asked before agents split the request.
module.exports={id:'slack-people',stage:'people',turn:async(s,command)=>s.slack?await s.slack.people.turn(command):null};
