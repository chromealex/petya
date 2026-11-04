const {randomUUID}=require('node:crypto');
const {Dialogue,intent,actionRequest}=require('./dialogue.cjs');
// With the full pipeline (`converse`), every request can run in the background except UI-driven
// action flows (Jira drafts and plans). Without it, only plain model questions can (legacy clone path).
function eligible(text,topic,full=false){
 if(full)return !actionRequest(text);
 if(require('./git-workspace.cjs').commandRoute(text))return false;
 if(actionRequest(text)||topic?.pending||topic?.chatJob?.state==='attention')return false;
 if(/(?:запомни|забудь|работаем над|переключись|заполни|подключи|покажи.{0,12}откуда|источник|сводк|что у нас сегодня|напомни|встреч|билд|сборк|slack|слак|почт|браузер|интернет|погода|новост|поиск|найди|telegram|телеграм|confluence|notion|asana)/iu.test(text))return false;
 if(require('./ui/conversation-input.js').ConversationInput.isProjectCatalogQuestion(text))return false;
 const route=require('./work-query-route.cjs').classify(text,topic);if(route&&!['chat','personal'].includes(route.kind))return false;
 return true;
}
class ChatJobs{
 constructor({dialogue,scope,emit=()=>{},run=fn=>fn(),converse=null,limit=10}){Object.assign(this,{dialogue,scope,emit,run,converse,limit});this.jobs=new Map();this.running=0;let changed=false;for(const t of dialogue.state.topics)if(['running','queued'].includes(t.chatJob?.state)){t.chatJob={...t.chatJob,state:'attention',label:'Запрос прерван перезапуском. Повторите его.',at:Date.now()};changed=true;}if(changed)dialogue.persist();}
 acknowledge(id,at){const topic=this.dialogue.state.topics.find(t=>t.id===id);if(!topic?.chatJob||topic.chatJob.at!==at||!['done','attention'].includes(topic.chatJob.state))return false;topic.chatJob.acknowledged=true;this.dialogue.persist();return true;}
 busy(id){return this.jobs.has(id);}
 any(){return this.jobs.size>0;}
 update(topic,state,label){const at=Date.now();topic.chatJob={...topic.chatJob,state,label,at,finishedAt:['done','attention'].includes(state)?at:null,acknowledged:false};this.dialogue.persist();this.emit({topicId:topic.id,job:topic.chatJob});}
 finishForeground(id,state,result){
  const topic=this.dialogue.state.topics.find(t=>t.id===id);
  if(!topic?.chatJob||this.busy(id)||!['done','attention'].includes(state))return false;
  // Replace the old question before emitting completion; listeners must never replay it.
  if(result&&typeof result==='object'&&typeof result.text==='string')topic.lastChatResult={...result,topicId:id,messages:undefined,topics:undefined};
  else delete topic.lastChatResult;
  this.update(topic,state,state==='done'?'Готово':result?.question?'Нужно уточнение':'Нужно внимание');return true;
 }
 start(id,projectId,text){
  if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Введите запрос до 4000 символов.');
  const d=this.dialogue,project=d.state.projects.find(p=>p.id===projectId);if(!project||project.archived)throw Error('Проект не найден или находится в архиве.');
  let topic=id?d.state.topics.find(t=>t.id===id):null;if(id&&(!topic||topic.archived||topic.projectId!==projectId))throw Error('Чат не найден в проекте.');
  if(!eligible(text,topic,!!this.converse))return {foreground:true};if(topic&&(this.busy(id)||d.running?.has(id)))throw Error('В этом чате уже выполняется запрос.');
  if(!topic){topic={id:randomUUID(),projectId,title:text.trim().slice(0,80),kind:'chat',messages:[],at:Date.now(),...(project.memoryId?{projectMemoryId:project.memoryId}:{})};d.state.topics.push(topic);if(d.state.activeProjectId===projectId&&!d.active()){d.state.activeId=topic.id;delete d.state.newChat;}}
  const job={topic,scope:this.scope(projectId),command:text.trim(),snapshot:structuredClone(topic)};this.jobs.set(topic.id,job);job.created=!id;job.placeholder={role:'user',text:job.command,at:Date.now(),pending:true};topic.messages.push(job.placeholder);topic.at=Date.now();topic.chatJob={command:job.command,startedAt:Date.now()};delete topic.lastChatResult;this.update(topic,'queued','В очереди');queueMicrotask(()=>this.pump());return {topicId:topic.id,messages:topic.messages,job:topic.chatJob};
 }
 pump(){for(const job of this.jobs.values()){if(this.running>=this.limit)break;if(job.started)continue;job.started=true;this.running++;this.execute(job).catch(error=>this.emit({topicId:job.topic.id,job:{state:'attention',label:error.message}})).finally(()=>{this.jobs.delete(job.topic.id);this.running--;this.pump();});}}
 async execute(job){const {topic,snapshot,command}=job,d=this.dialogue;
  this.update(topic,'running','Готовлю ответ');
  if(this.converse)return this.executeFull(job);
  try{
   const kind=require('./personal-tasks.cjs').personalTasks(command)?'tasks':intent(command,snapshot);snapshot.kind=kind;snapshot.background=true;const clone=new Dialogue({state:{projects:structuredClone(d.state.projects),activeProjectId:topic.projectId,topics:[snapshot],activeId:snapshot.id},days:d.days,context:d.context,answer:d.answer,readers:d.readers});
   const result=await this.run(()=>clone.turn(command,undefined,kind),label=>{if(d.state.topics.includes(topic))this.update(topic,'running',label);},topic.projectId);
   if(!d.state.topics.includes(topic))return;
   if(job.scope!==this.scope(topic.projectId))throw Error('Настройки или компания изменились. Повторите запрос с новым контекстом.');
   if(!result.handled)throw Error('Для этого запроса нужно действие. Откройте чат и повторите запрос.');
   const completed=clone.active();const {id,projectId,title,messages,background,chatJob,pinned,order,archived,...fields}=completed;
   Object.assign(topic,fields);topic.messages.push({role:'assistant',text:result.text,sources:result.sources||[],at:Date.now()}); // Merge only this conversation; never change the selected chat.
   if(topic.title==='Новый чат')topic.title=command.slice(0,80);
   topic.lastChatResult={...result,topicId:topic.id,topicTitle:topic.title,messages:undefined,topics:undefined};
   this.update(topic,result.error||result.question?'attention':'done',result.error?'Ошибка — откройте чат':result.question?'Нужно уточнение':'Готово');
  }catch(e){if(d.state.topics.includes(topic)){topic.messages.push({role:'assistant',text:e.message,at:Date.now()});this.update(topic,'attention',e.message);}}
 }
}
const CHOICES=['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices','interpretChoices','clarificationOptions'];
// A result that waits for the user (a question, choices or an approval) is shown when the chat is opened.
const needsUser=result=>!!(result.question||result.computerApproval||CHOICES.some(key=>result[key]?.length));
ChatJobs.prototype.executeFull=async function(job){
 const {topic,command,placeholder}=job,d=this.dialogue;
 const drop=()=>{const at=topic.messages.indexOf(placeholder);if(at>=0)topic.messages.splice(at,1);return at;};
 // The pipeline records the request itself; the placeholder only shows it while queued.
 const base=drop();
 try{
  const result=await this.run(()=>d.within(topic.id,topic.projectId,()=>this.converse(command)),label=>{if(d.state.topics.includes(topic))this.update(topic,'running',label);},topic.projectId);
  if(job.scope!==this.scope(topic.projectId))throw Error('Настройки или компания изменились. Повторите запрос с новым контекстом.');
  if(!result||!result.handled)throw Error('Для этого запроса нужно действие. Откройте чат и повторите запрос.');
  // The pipeline may answer in another (new) chat, e.g. a Slack log or mail thread.
  const target=result.topicId&&result.topicId!==topic.id?d.state.topics.find(t=>t.id===result.topicId)||topic:topic;
  if(target!==topic&&job.created&&!topic.messages.length){d.state.topics.splice(d.state.topics.indexOf(topic),1);}
  if(!d.state.topics.includes(target))return;
  const start=target===topic?(base>=0?base:topic.messages.length):0;
  if(!target.messages.slice(start).some(m=>m.role==='user'&&m.text===command))target.messages.splice(target===topic?(base>=0?base:topic.messages.length):target.messages.length,0,{role:'user',text:command,at:placeholder.at});
  const last=target.messages.at(-1);
  if(result.text&&!(last?.role==='assistant'&&last.text===result.text))target.messages.push({role:'assistant',text:result.text,sources:result.sources||[],at:Date.now(),...(result.by?{by:result.by}:{})});
  if(target.title==='Новый чат')target.title=command.slice(0,80);
  const waiting=needsUser(result);
  target.lastChatResult={...result,question:result.question||waiting,topicId:target.id,topicTitle:target.title,messages:undefined,topics:undefined};
  if(target!==topic){target.chatJob={...topic.chatJob};if(d.state.topics.includes(topic))this.update(topic,'done','Ответ в чате «'+target.title+'»');}
  this.update(target,result.error||waiting?'attention':'done',result.error?'Ошибка — откройте чат':waiting?'Нужно уточнение':'Готово');
 }catch(e){if(d.state.topics.includes(topic)){if(!topic.messages.some(m=>m.role==='user'&&m.text===command&&m.at>=placeholder.at))topic.messages.splice((base>=0?base:topic.messages.length),0,{role:'user',text:command,at:placeholder.at});topic.messages.push({role:'assistant',text:e.message,at:Date.now(),error:true});this.update(topic,'attention',e.message);}}
};
module.exports={ChatJobs,eligible,needsUser};
