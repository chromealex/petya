// Git requests in chat («статус гита», «покажи diff», «создай ветку …», «git push»), asked by the pipeline where
// Petya's own Git handler used to run (src/features/chat-routes.cjs, stage 'commands'). They always run inline,
// never as a background chat job, and the read-only ones are an entry of the meaning router.
const {commandRoute}=require('./workspace.cjs');
const READ=new Set(['status','diff','log','branches']);
const HELP='Git: «статус гита», «покажи diff», «история коммитов», «добавь в коммит путь/файл», «сделай коммит: описание», «создай ветку feature/name», «переключись на ветку main», «git fetch», «git pull», «git push». Git автоматически определяется по папкам текущего проекта. Панель открывается кнопкой Git в чате.';
module.exports={
 id:'git',stage:'commands',order:10,foreground:true,
 route:text=>commandRoute(text),
 capability:{id:'git-read',says:'посмотреть состояние git в папке проекта: статус, изменения, историю коммитов, ветки',examples:['статус гита','покажи diff','история коммитов','покажи ветки'],reads:route=>READ.has(route.action)},
 resume:{kind:'git-input',answer:(s,restart)=>answer=>s.chatJobs.converse((restart.prefix||'')+answer+(restart.suffix||''))},
 async run(s,route,{text,pipeline,background}){
  if(route.action==='clarify')return require('../../input-required.cjs').ask({text:route.question,label:'Параметры Git',restart:{kind:'git-input',prefix:route.input?.prefix||'',suffix:route.input?.suffix||''}},answer=>pipeline((route.input?.prefix||'')+answer+(route.input?.suffix||''),undefined,background));
  if(route.action==='help')return {handled:true,text:HELP};
  s.dialogue.rememberAction(text,'Выполняю Git…');const topic=s.dialogue.active(),message=topic.messages.at(-1);
  try{s.requestProgress.report('Выполняю Git: '+route.action);const result=route.action==='init'?await s.gitWorkspace.init(null,(await s.gitWorkspace.discover()).projectId):await s.gitWorkspace.execute(route);message.text=result.text;const card=require('../../features/chat-results.cjs').extract({git:{action:route.action,...result}});if(card)message.extensionData={...message.extensionData,...card};}catch(error){message.text=error.message;message.error=!error.gitDiscovery;if(error.gitDiscovery){message.gitDiscovery=error.gitDiscovery;message.question=true;}}
  if(!s.dialogue.state.topics.includes(topic))return {handled:true,text:message.text,error:!!message.error};
  s.dialogue.persist();return {handled:true,text:message.text,error:!!message.error,question:!!message.question,gitDiscovery:message.gitDiscovery,gitCommand:text,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
 }
};
