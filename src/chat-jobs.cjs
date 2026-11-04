const {randomUUID}=require('node:crypto');
const {Dialogue,intent,actionRequest}=require('./dialogue.cjs');
function eligible(text,topic){
 if(require('./git-workspace.cjs').commandRoute(text))return false;
 if(actionRequest(text)||topic?.pending||topic?.chatJob?.state==='attention')return false;
 if(/(?:запомни|забудь|работаем над|переключись|заполни|подключи|покажи.{0,12}откуда|источник|сводк|что у нас сегодня|напомни|встреч|билд|сборк|slack|слак|почт|браузер|интернет|погода|новост|поиск|найди|telegram|телеграм|confluence|notion|asana)/iu.test(text))return false;
 if(require('./ui/conversation-input.js').ConversationInput.isProjectCatalogQuestion(text))return false;
 const route=require('./work-query-route.cjs').classify(text,topic);if(route&&!['chat','personal'].includes(route.kind))return false;
 return true;
}
class ChatJobs{
 constructor({dialogue,scope,emit=()=>{},run=fn=>fn(),limit=3}){Object.assign(this,{dialogue,scope,emit,run,limit});this.jobs=new Map();this.running=0;let changed=false;for(const t of dialogue.state.topics)if(['running','queued'].includes(t.chatJob?.state)){t.chatJob={...t.chatJob,state:'attention',label:'Запрос прерван перезапуском. Повторите его.',at:Date.now()};changed=true;}if(changed)dialogue.persist();}
 acknowledge(id,at){const topic=this.dialogue.state.topics.find(t=>t.id===id);if(!topic?.chatJob||topic.chatJob.at!==at||!['done','attention'].includes(topic.chatJob.state))return false;topic.chatJob.acknowledged=true;this.dialogue.persist();return true;}
 busy(id){return this.jobs.has(id);}
 any(){return this.jobs.size>0;}
 update(topic,state,label){topic.chatJob={...topic.chatJob,state,label,at:Date.now(),acknowledged:false};this.dialogue.persist();this.emit({topicId:topic.id,job:topic.chatJob});}
 start(id,projectId,text){
  if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Введите запрос до 4000 символов.');
  const d=this.dialogue,project=d.state.projects.find(p=>p.id===projectId);if(!project||project.archived)throw Error('Проект не найден или находится в архиве.');
  let topic=id?d.state.topics.find(t=>t.id===id):null;if(id&&(!topic||topic.archived||topic.projectId!==projectId))throw Error('Чат не найден в проекте.');
  if(!eligible(text,topic))return {foreground:true};if(topic&&this.busy(id))throw Error('В этом чате уже выполняется запрос.');
  if(!topic){topic={id:randomUUID(),projectId,title:text.trim().slice(0,80),kind:'chat',messages:[],at:Date.now(),...(project.memoryId?{projectMemoryId:project.memoryId}:{})};d.state.topics.push(topic);if(d.state.activeProjectId===projectId&&!d.active()){d.state.activeId=topic.id;delete d.state.newChat;}}
  const job={topic,scope:this.scope(projectId),command:text.trim(),snapshot:structuredClone(topic)};this.jobs.set(topic.id,job);topic.messages.push({role:'user',text:job.command,at:Date.now()});topic.at=Date.now();topic.chatJob={command:job.command,startedAt:Date.now()};delete topic.lastChatResult;this.update(topic,'queued','В очереди');queueMicrotask(()=>this.pump());return {topicId:topic.id,messages:topic.messages,job:topic.chatJob};
 }
 pump(){for(const job of this.jobs.values()){if(this.running>=this.limit)break;if(job.started)continue;job.started=true;this.running++;this.execute(job).catch(error=>this.emit({topicId:job.topic.id,job:{state:'attention',label:error.message}})).finally(()=>{this.jobs.delete(job.topic.id);this.running--;this.pump();});}}
 async execute(job){const {topic,snapshot,command}=job,d=this.dialogue;
  this.update(topic,'running','Готовлю ответ');
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
module.exports={ChatJobs,eligible};
