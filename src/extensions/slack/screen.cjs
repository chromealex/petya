const {randomUUID}=require('node:crypto');
const {scope}=require('../../features/chat-results.cjs');
const {ready,detect}=require('../../service-access.cjs');
function reading(command){return detect(command).includes('slack')&&!/(?:^|\s)(?:не\s|отправ|напиши|опубликуй|перешли|удали|измени|создай|ответь)/iu.test(command);}
// Reading the open Slack window when Slack as a service is unavailable (rate limits, an error, not connected):
// progress goes to the notification center; created by the Slack app's feature (feature.cjs).
function create(s,deps){
 const digest={screen:()=>deps.digest.screen(),summarize:(...args)=>deps.digest.summarize(...args)};
 let progress=null;
 const publish=(id,text,busy,kind='info')=>{progress={id:'slack-screen:'+id,title:'Контекст из окна Slack',text,busy,kind,version:busy?'reading':kind};if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',progress);};
 async function run(command,saved){
  if(s.modules.projectDisabled('slack'))return {handled:true,text:'Slack отключён в настройках этого проекта.',error:true};
  let topic=s.dialogue.active(),message;
  if(saved){if(!topic||scope(s,topic)!==saved.expected)throw Error('Чат или проект изменился. Повторите запрос.');message=topic.messages.find(m=>m.slackScreenId===saved.id);if(!message)throw Error('Исходный запрос больше недоступен.');}
  else{s.dialogue.rememberAction(command,'Читаю открытое окно Slack…');topic=s.dialogue.active();message=topic.messages.at(-1);message.slackScreenId=randomUUID();}
  const expected=scope(s,topic),id=message.slackScreenId;
  const check=()=>{require('../../answer-cancel.cjs').check();if(s.dialogue.active()?.id!==topic.id||scope(s,topic)!==expected)throw Error('Чат или проект изменился. Повторите запрос.');};
  const finish=result=>{message.text=result.text;message.error=!!result.error;message.by='Slack: экран';s.dialogue.persist();return {...result,handled:true,topicId:topic.id,messages:topic.messages};};
  publish(id,'Читаю видимый контекст Slack…',true);s.requestProgress.report('Slack недоступен: смотрю открытое приложение');
  try{
   const view=await s.computerLock(()=>digest.screen());check();
   const text=String(view?.text||'').trim();if(!text)throw Error('В окне Slack нет доступного текста. Откройте нужный канал или тред и повторите запрос.');
   const named=command.match(/#([\p{L}\p{N}_-]+)/u)?.[1],channels=s.projectMemory.context().projectChannels||[];
   const names=named?[named]:channels.map(c=>c.name).filter(Boolean);
   if(names.length&&!names.some(name=>String(view.title||'').toLowerCase().split(/[^\p{L}\p{N}_-]+/u).includes(name.toLowerCase())))return finish({text:'Откройте в Slack '+names.map(n=>'#'+n).join(' или ')+' и повторите запрос. Текущий канал окна не удалось подтвердить.',question:true});
   const answer=await digest.summarize(command,[{channel:view.title||'Окно Slack',at:Date.now(),user:'',text:text.slice(0,24000)}],{screen:true});check();
   return finish({text:answer+'\n\nИсточник: открытое окно Slack. Прочитана только видимая часть обсуждения.'});
  }catch(e){
   check();
   if(e.code==='COMPUTER_PERMISSION_REQUIRED'){const approval=s.computerApproval.request(command,{type:'slackScreenRead',expected,id});return finish({...approval,text:'Slack недоступен как сервис. '+approval.text});}
   return finish({text:e.message,error:true});
  }finally{publish(id,message.text,false,message.error?'error':'info');}
 }
 s.computerApproval.register?.('slackScreenRead',(command,action)=>run(command,action));
 deps.digest.fallback=command=>run(command);
 return {run,status:()=>progress,async turn(command){if(!reading(command))return null;const status=deps.sync?.status||{};if(ready('slack',s.settings)&&!require('../../connection-failure.cjs').classify(Error(status.message||''))&&!/ошиб|недоступ|HTTP 5\d\d/iu.test(status.message||''))return null;return run(command);}};
}
module.exports={create,reading};
