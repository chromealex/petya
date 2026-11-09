// Chat route «send»: «Попроси команду …» / «… в #канал» (team-request.cjs) — a channel confirmed for the project or a
// question with concrete options, then the text with «Отправить»; nothing is sent from the chat turn itself.
module.exports={id:'slack-send',stage:'send',by:'Slack',turn:async(s,command,{choice})=>!choice&&s.slack?await s.slack.request.turn(command):null};
