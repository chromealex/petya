// The «bugs» chat subject of Jira (dialogue-kind, src/features/dialogue-kinds.cjs): «Проверь баги», «сколько багов в
// последней версии», «какие баги открыты?» read the bugs of a project version in the open chat; the chat is titled
// «Баги в Jira» and keeps the project and version for follow-ups (`carry`). Voice commands with «Проверить баги в
// Jira» run it too (voice-action.cjs); the tool router picks it through route-tool.cjs.
module.exports={
 id:'bugs',title:'Баги в Jira',by:'Jira: баги',label:'запрос к Jira',service:'jira',
 router:'проверить дефекты, ошибки и баги проекта.',
 carry:['jiraProject','versionId'],
 detect(text){
  if(/(?:верн|продолж).*(?:баг|bug|жир|jira)/iu.test(text))return true;
  if(/(?:баг|bug|ошиб).*(?:верс|релиз|сколько|jira|жир)|(?:сколько|посмотр|провер).*(?:баг|bug)/iu.test(text))return true;
  return /(?:какие|покажи|список|открыт|остал|висит|глянь).*(?:баг|bug)|(?:баг|bug)\p{L}*\s+(?:открыт|остал|какие|висят|есть)/iu.test(text)&&!require('../../dialogue.cjs').actionRequest(text);
 },
 read:(s,command,topic,context)=>require('./read.cjs').read(s,command,topic,context,'bugs')
};
