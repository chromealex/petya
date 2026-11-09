// The Slack/Jira build flows of «Сборки» in chat (build-flows.cjs), asked where Petya's core used to run them:
// after the attachment and messenger flows, right before the Slack log review (src/features/chat-routes.cjs, stage
// 'builds'). Every request is offered to them (they also take a bare number answering their own list); each
// returns null when the request is not its own.
const {isRepair}=require('./build-repair.cjs');
const {isBuildQuestion}=require('./build-question.cjs');
module.exports={
 id:'ci-builds',stage:'builds',
 capability:{id:'build-question',says:'спросить в Slack ответственного, что со сборкой (билдом), или починить падающую сборку',examples:['что с билдом','спроси что с билдом','почини билд'],
  accepts:text=>isBuildQuestion(text)||isRepair(text)},
 resume:{kind:'repair-input',answer:(s,restart)=>answer=>s.ciBuilds.repair.turn(restart.command+' '+answer)},
 async run(s,_route,{text}){
  const flows=s.ciBuilds;if(!flows?.repair)return null;
  // A repair asked with log files attached: the files become the repair's own chat (they are its source).
  if(isRepair(text)&&s.attachments.list().length){
   const files=s.attachments.take(s.attachments.list().map(a=>a.id)),previous=s.dialogue.active();
   const topic={repairSource:previous?.repairSource,slackSource:previous?.slackSource,reviewScope:previous?.reviewScope,jiraProject:previous?.jiraProject,id:s.randomUUID(),title:'Исправление сборки: '+files.map(a=>a.name).join(', ').slice(0,60),kind:'chat',attachments:files,messages:[],at:Date.now()};
   s.dialogue.state.topics.push(topic);s.dialogue.state.activeId=topic.id;s.dialogue.persist();for(const file of files)s.attachments.remove(file.id);
  }
  return (await flows.repair.turn(text))||(await flows.question.turn(text))||null;
 }
};
