// Petya's own agents: a complex request is split into independent subtasks; each runs in its own chat
// as a background job (the full Petya pipeline, in parallel), and the parent chat tracks them and gets
// one combined answer at the end. Actions that change something are never started automatically.
const {randomUUID}=require('node:crypto');
const EXPLICIT=/(?:раздай|распредели|поручи|отдай|раскидай|запусти|подключи)\s+(?:это\s+|эти\s+|задач[иу]\s+|работу\s+)?(?:по\s+)?агент|агентами|силами агентов|через агентов|(?:сделай|проверь|посмотри|выполни|узнай|собери|подготовь)\s+(?:всё\s+|это\s+)?(?:параллельно|одновременно)|параллельно\s+(?:сделай|проверь|посмотри|выполни|узнай|собери|подготовь)|в несколько потоков/iu;
const EXTERNAL=/(?:codex|кодекс|claude|клод)/iu;
function agentRequest(command=''){
 const text=String(command).trim();
 if(!text||text.length>4000||EXTERNAL.test(text))return false;
 if(/^(?:не\s|что такое|как работают|объясни|расскажи про)/iu.test(text))return false;
 if(EXPLICIT.test(text))return true;
 // An enumerated list of several requests is also a job for agents.
 const items=text.split('\n').filter(line=>/^\s*(?:[-•*]|\d+[.)])\s+\S/u.test(line));
 return items.length>=2;
}
const STATES={queued:'В очереди',running:'Работает',done:'Готово',attention:'Нужно внимание',cancelled:'Остановлен',action:'Ждёт тебя'};
class AgentTeam{
 constructor({dialogue,jobs,plan,summarize,emit=()=>{},now=Date.now,interval=1000,max=6}){Object.assign(this,{dialogue,jobs,plan,summarize,emit,now,interval,max});this.active=new Map();}
 // Returns a handled reply (the plan) or null when the request is not for agents.
 async turn(command,topic){
  if(!agentRequest(command)||!topic||topic.agentOf)return null;
  const planned=await this.plan(command);
  const tasks=(Array.isArray(planned?.tasks)?planned.tasks:[]).filter(t=>t&&typeof t.request==='string'&&t.request.trim()).slice(0,this.max).map(t=>({id:randomUUID(),title:String(t.title||t.request).trim().slice(0,80),request:String(t.request).trim().slice(0,1500),action:!!t.action,state:'queued',label:STATES.queued}));
  if(tasks.length<2)return null; // one task: the normal pipeline answers it
  const plan={id:randomUUID(),command,state:'running',startedAt:this.now(),tasks};
  topic.messages.push({role:'user',text:command,at:this.now()});
  const message={role:'assistant',text:'Раздал задачу агентам: '+tasks.length+'. Каждый работает в своём чате; соберу общий ответ, когда закончат.',at:this.now(),by:'агенты Пети',agentPlan:plan};
  topic.messages.push(message);topic.at=this.now();
  for(const task of tasks){
   if(task.action){task.state='action';task.label='Меняет данные — запусти сам, когда проверишь';continue;}
   try{const started=this.jobs.start(null,topic.projectId,task.request);
    if(started?.foreground){task.state='action';task.label='Нужно подтверждение — запусти в чате';continue;}
    task.topicId=started.topicId;const child=this.dialogue.state.topics.find(t=>t.id===started.topicId);if(child){child.agentOf=topic.id;child.title='Агент · '+task.title;}
   }catch(e){task.state='attention';task.label=e.message;}
  }
  this.dialogue.persist();
  this.active.set(plan.id,{plan,topic});this.watch(plan.id);this.publish(plan,topic);
  // A background chat job marks its chat «Готово» when this turn returns; the team is still working.
  setTimeout(()=>{if(this.active.has(plan.id))this.publish(plan,topic);},150);
  return {handled:true,text:message.text,by:message.by,agentPlan:plan,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
 }
 watch(id){const tick=()=>{const entry=this.active.get(id);if(!entry)return;this.check(entry).catch(e=>console.error(e)).finally(()=>{if(this.active.has(id))entry.timer=setTimeout(tick,this.interval);});};this.active.get(id).timer=setTimeout(tick,this.interval);}
 async check(entry){
  const {plan,topic}=entry;let changed=false;
  for(const task of plan.tasks){if(!task.topicId||['done','attention','cancelled'].includes(task.state))continue;const child=this.dialogue.state.topics.find(t=>t.id===task.topicId);const job=child?.chatJob;
   const state=!child?'cancelled':job?.state||'queued';const label=!child?'Чат удалён':job?.label||STATES[state]||'';
   if(state!==task.state||label!==task.label){task.state=state;task.label=label;changed=true;}}
  const open=plan.tasks.filter(t=>['queued','running'].includes(t.state)).length;
  if(changed)this.publish(plan,topic);
  if(open||plan.state!=='running')return;
  plan.state='summarizing';this.publish(plan,topic);
  const results=plan.tasks.map(t=>{const child=t.topicId&&this.dialogue.state.topics.find(c=>c.id===t.topicId);const answer=child?.messages?.filter(m=>m.role==='assistant').at(-1);return {title:t.title,request:t.request,state:t.state,answer:String(answer?.text||t.label||'').slice(0,4000)};});
  let text;try{text=await this.summarize(plan.command,results);}catch(e){text='Агенты закончили, но собрать общий ответ не получилось: '+e.message;}
  plan.state='done';plan.finishedAt=this.now();
  if(this.dialogue.state.topics.includes(topic)){topic.messages.push({role:'assistant',text:String(text||'').trim()||'Агенты закончили.',at:this.now(),by:'агенты Пети: итог'});topic.at=this.now();}
  this.active.delete(plan.id);this.dialogue.persist();this.publish(plan,topic,true);
 }
 stop(planId){const entry=this.active.get(planId);if(!entry)return {stopped:0};let stopped=0;for(const task of entry.plan.tasks)if(task.topicId&&['queued','running'].includes(task.state)){if(this.jobs.cancel(task.topicId))stopped++;}return {stopped};}
 publish(plan,topic,finished=false){
  const done=plan.tasks.filter(t=>t.state==='done').length,total=plan.tasks.length;
  const state=finished?'done':plan.state==='summarizing'?'running':'running';
  const label=finished?'Агенты закончили':plan.state==='summarizing'?'Собираю общий ответ':'Агенты: готово '+done+' из '+total;
  try{this.jobs.update(topic,state,label);}catch{}
  this.emit({topicId:topic.id,job:topic.chatJob,agentPlan:plan});
 }
}
module.exports={agentRequest,AgentTeam};
