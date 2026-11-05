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
 cancel(id){const job=this.jobs.get(id);if(!job)return false;job.cancelled=true;job.controller.abort(require('./answer-cancel.cjs').stopped());delete job.placeholder.pending;delete job.topic.lastChatResult;this.update(job.topic,'cancelled','Ответ остановлен');if(!job.started)this.jobs.delete(id);return true;}
 async resume(id){
  const running=this.jobs.get(id);if(running&&!running.cancelled)throw Error('Ответ уже выполняется.');if(running?.settled)await running.settled;
  const topic=this.dialogue.state.topics.find(t=>t.id===id),last=topic?.messages.at(-1);
  if(topic?.chatJob?.state!=='cancelled'||last?.role!=='user'||last.text!==topic.chatJob.command)throw Error('Этот ответ уже нельзя продолжить.');
  topic.messages.pop();try{const result=this.start(id,topic.projectId,topic.chatJob.command);if(result.foreground)throw Error('Продолжите запрос в открытом чате.');return result;}catch(error){topic.messages.push(last);this.dialogue.persist();throw error;}
 }
 busy(id){return this.jobs.has(id);}
 any(){return this.jobs.size>0;}
 update(topic,state,label){const at=Date.now();topic.chatJob={...topic.chatJob,state,label,at,finishedAt:['done','attention','cancelled'].includes(state)?at:null,acknowledged:false};this.dialogue.persist();this.emit({topicId:topic.id,job:topic.chatJob});}
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
  const job={controller:new AbortController(),topic,scope:this.scope(projectId),command:text.trim(),snapshot:structuredClone(topic)};this.jobs.set(topic.id,job);job.created=!id;const replyTo=topic.nextQuote;delete topic.nextQuote;job.placeholder={role:'user',text:job.command,at:Date.now(),pending:true,...(replyTo?{replyTo}:{}),...(topic.pendingEditAttachments?.length?{attachments:topic.pendingEditAttachments}:{})};delete topic.pendingEditAttachments;topic.messages.push(job.placeholder);topic.at=Date.now();topic.chatJob={command:job.command,startedAt:Date.now()};delete topic.lastChatResult;this.update(topic,'queued','В очереди');queueMicrotask(()=>this.pump());return {topicId:topic.id,messages:topic.messages,job:topic.chatJob};
 }
 pump(){for(const job of this.jobs.values()){if(this.running>=this.limit)break;if(job.started)continue;job.started=true;this.running++;job.settled=require('./answer-cancel.cjs').run(job.controller.signal,()=>this.execute(job)).catch(error=>this.emit({topicId:job.topic.id,job:{state:'attention',label:error.message}})).finally(()=>{this.jobs.delete(job.topic.id);this.running--;this.pump();});}}
 async execute(job){const {topic,snapshot,command}=job,d=this.dialogue;
  this.update(topic,'running','Готовлю ответ');
  if(this.converse)return this.executeFull(job);
  try{
   const kind=require('./personal-tasks.cjs').personalTasks(command)?'tasks':intent(command,snapshot);snapshot.kind=kind;snapshot.background=true;const clone=new Dialogue({state:{projects:structuredClone(d.state.projects),activeProjectId:topic.projectId,topics:[snapshot],activeId:snapshot.id},days:d.days,context:d.context,answer:d.answer,readers:d.readers});
   const result=await this.run(()=>clone.turn(command,undefined,kind),label=>{if(!job.cancelled&&!job.answered&&d.state.topics.includes(topic))this.update(topic,'running',label);},topic.projectId);
   job.answered=true;
   if(job.cancelled||!d.state.topics.includes(topic))return;
   if(job.scope!==this.scope(topic.projectId))throw Error('Настройки или компания изменились. Повторите запрос с новым контекстом.');
   if(!result.handled)throw Error('Для этого запроса нужно действие. Откройте чат и повторите запрос.');
   const completed=clone.active();const {id,projectId,title,messages,background,chatJob,pinned,order,archived,...fields}=completed;
   Object.assign(topic,fields);topic.messages.push({role:'assistant',text:result.text,error:!!result.error,sources:result.sources||[],usedMaterials:result.usedMaterials||[],at:Date.now()}); // Merge only this conversation; never change the selected chat.
   if(topic.title==='Новый чат')topic.title=command.slice(0,80);
   topic.lastChatResult={...result,topicId:topic.id,topicTitle:topic.title,messages:undefined,topics:undefined};
   this.update(topic,result.error||result.question?'attention':'done',result.error?'Ошибка — откройте чат':result.question?'Нужно уточнение':'Готово');
  }catch(e){if(!job.cancelled&&d.state.topics.includes(topic)){topic.messages.push({role:'assistant',text:e.message,error:true,at:Date.now()});this.update(topic,'attention',e.message);}}
 }
}
const CHOICES=['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices','interpretChoices','clarificationOptions'];
// A result that waits for the user (a question, choices or an approval) is shown when the chat is opened.
const needsUser=result=>!!(result.question||result.computerApproval||CHOICES.some(key=>result[key]?.length));
ChatJobs.prototype.executeFull=async function(job){
 const {topic,command,placeholder}=job,d=this.dialogue;
 // The question stays visible while the job runs. The pipeline usually takes the placeholder over;
 // otherwise it is kept as the recorded question (or dropped when the pipeline recorded its own).
 const settle=()=>{const at=topic.messages.indexOf(placeholder);if(at<0)return -1;if(topic.messages.slice(at+1).some(m=>m.role==='user')){topic.messages.splice(at,1);return -1;}delete placeholder.pending;return at;};
 const record=target=>{if(!target.messages.some(m=>m.role==='user'&&m.at>=placeholder.at))target.messages.push({role:'user',text:command,at:placeholder.at});};
 try{
  // A progress label can arrive after the answer (a throttled stream update); it must not turn a finished job back into «running».
  const result=await this.run(()=>d.within(topic.id,topic.projectId,()=>this.converse(command)),label=>{if(!job.cancelled&&!job.answered&&d.state.topics.includes(topic))this.update(topic,'running',label);},topic.projectId,topic.id);
  job.answered=true;
  if(job.cancelled)return;
  if(job.scope!==this.scope(topic.projectId))throw Error('Настройки или компания изменились. Повторите запрос с новым контекстом.');
  if(!result||!result.handled)throw Error('Для этого запроса нужно действие. Откройте чат и повторите запрос.');
  // The pipeline may answer in another chat, e.g. an existing «Баги в Jira» topic or a new Slack log.
  // An agent's chat keeps its own answer even when the pipeline also wrote it into another chat: it sits under
  // the chat that started the agents, and the combined answer reads it from there.
  const target=!topic.agentOf&&result.topicId&&result.topicId!==topic.id?d.state.topics.find(t=>t.id===result.topicId)||topic:topic;
  if(target!==topic){const at=topic.messages.indexOf(placeholder);if(at>=0)topic.messages.splice(at,1);if(job.created&&!topic.messages.length&&d.state.topics.includes(topic))d.state.topics.splice(d.state.topics.indexOf(topic),1);}
  else settle();
  if(!d.state.topics.includes(target))return;
  record(target);
  if(placeholder.replyTo){const turn=target.messages.findLast(m=>m.role==='user'&&m.at>=placeholder.at);if(turn)turn.replyTo=placeholder.replyTo;}
  const last=target.messages.at(-1);if(result.error&&last?.role==='assistant'&&last.text===result.text)last.error=true;
  if(result.text&&!(last?.role==='assistant'&&last.text===result.text))target.messages.push({role:'assistant',text:result.text,error:!!result.error,sources:result.sources||[],usedMaterials:result.usedMaterials||[],at:Date.now(),...(result.by?{by:result.by}:{})});
  if(target.title==='Новый чат')target.title=command.slice(0,80);
  const waiting=needsUser(result);
  target.lastChatResult={...result,question:result.question||waiting,topicId:target.id,topicTitle:target.title,messages:undefined,topics:undefined};
  if(target!==topic){target.chatJob={...topic.chatJob};if(d.state.topics.includes(topic))this.update(topic,'done','Ответ в чате «'+target.title+'»');}
  this.update(target,result.error||waiting?'attention':'done',result.error?'Ошибка — откройте чат':waiting?'Нужно уточнение':'Готово');
 }catch(e){job.answered=true;settle();if(!job.cancelled&&d.state.topics.includes(topic)){record(topic);topic.messages.push({role:'assistant',text:e.message,error:true,at:Date.now(),error:true});this.update(topic,'attention',e.message);}}
};
module.exports={ChatJobs,eligible,needsUser};
