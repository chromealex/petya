// Chat routes of Slack's open window (screen.cjs): a question about Slack while the API is unavailable is answered from
// the visible Slack window («screen» stage), and so is a request that failed because Slack was unreachable (`failure`).
const {reading}=require('./screen.cjs');
module.exports={id:'slack-screen',stage:'screen',
 turn:async(s,command,{choice})=>!choice&&s.slack?await s.slack.screen.turn(command):null,
 failure:async(s,{service,command,reason})=>service==='slack'&&reason&&s.slack&&reading(command)?s.slack.screen.run(command):null};
