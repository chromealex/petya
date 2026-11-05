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
 return items.length>=2&&!dependentSteps(text);
}
// Items the user already enumerated are taken word for word: the planner only splits free text.
function enumerated(command=''){
 const text=String(command).trim().replace(/^[^:\n]{0,80}:\s*/u,m=>/агент|параллельн|одновременно/iu.test(m)?'':m);
 let items=text.split('\n').map(l=>l.trim()).filter(l=>/^(?:[-•*]|\d+[.)])\s+\S/u.test(l)).map(l=>l.replace(/^(?:[-•*]|\d+[.)])\s+/u,''));
 if(items.length<2)items=text.split(/(?:^|[\s,;])\d+[.)]\s+/u).map(v=>v.trim()).filter(Boolean);
 items=items.map(v=>v.replace(/[,;]\s*(?:и|а также)?\s*$/u,'').replace(/[,;]$/u,'').trim()).filter(v=>v.length>2);
 if(items.length<2)return null;
 const {actionRequest}=require('./dialogue.cjs');
 return {tasks:items.map(v=>{const request=v[0].toLocaleUpperCase('ru')+v.slice(1);return {title:request.slice(0,80),request,action:!!actionRequest?.(request)};})};
}
// A request that touches several independent areas: Petya offers agents instead of starting them.
const AREAS=[/(?:задач|таск|тикет|баг|jira|джир|спринт|релиз|эпик)/iu,/(?:slack|слак)/iu,/(?:(?:^|[\s(])гит|git|коммит|ветк|верси[яюи] проекта|pull request|пулл?-?реквест)/iu,/(?:почт|письм|gmail|outlook)/iu,/(?:telegram|телеграм|(?:^|\s)тг(?:\s|$))/iu,/(?:в интернете|погод|курс (?:доллар|евро|валют)|новост)/iu,/(?:команд[аеуы]|коллег|загрузк)/iu,/(?:notion|ноушн|ноушен|confluence|конфлю|asana|асан)/iu];
const dependentSteps=text=>/(?:^|[\s,;])(?:потом|затем|после\s+этого|после\s+чего|а\s+дальше|в\s+конце)(?=[\s,]|$)|по\s+(?:этим|эти|ним|полученным|найденным|тем\s+же)(?:[\s,]|$)|оттуда|из\s+(?:них|этого|полученного)(?=[\s,]|$)|(?:их|этих\s+людей)\s+(?:должност|рол|почт|контакт|задач)/iu.test(text);
function complexRequest(command=''){
 const text=String(command).trim();
 if(text.length<25||text.length>4000||EXTERNAL.test(text)||EXPLICIT.test(text))return false;
 if(/^(?:не\s|что такое|что значит|объясни|почему|как работает|расскажи про|переведи)/iu.test(text))return false;
 // One command with details («Заполни команду: Полина — релизы», «Создай задачу: …») is not several requests.
 if(/^(?:петя[,!\s]+)?(?:пожалуйста[,\s]+)?(?:заполни|запомни|напомни|забудь|создай|заведи|отправь|напиши|ответь|переименуй|удали|закрой|назначь|переназначь|добавь|измени|обнови|сделай коммит|закоммить|запушь)/iu.test(text))return false;
 if(!/[,;:]|\s(?:и|а также|плюс|ещё|еще)\s/iu.test(text))return false;
 // Steps that feed each other («возьми имена в Jira, потом по этим именам должности в Slack») are one job
 // in order, not independent parts for parallel agents.
 if(dependentSteps(text))return false;
 return AREAS.filter(r=>r.test(text)).length>=2;
}
const OFFER={run:'Раздать агентам',single:'Ответить одним сообщением',always:'Всегда раздавать',never:'Всегда одним сообщением'};
const STATES={queued:'В очереди',running:'Работает',done:'Готово',attention:'Нужно внимание',cancelled:'Остановлен',action:'Ждёт тебя'};
class AgentTeam{
 constructor({dialogue,jobs,plan,summarize,emit=()=>{},preference=()=>'ask',remember=()=>{},now=Date.now,interval=1000,max=6}){Object.assign(this,{dialogue,jobs,plan,summarize,emit,preference,remember,now,interval,max});this.active=new Map();this.offers=new Map();this.skip=new Set();}
 // Ask-mode: «Раздать агентам» / «Ответить одним сообщением», optionally remembered.
 // Returns a reply, {continueWith} to answer the original request normally, or null.
 async offer(command,topic){
  if(!topic||topic.agentOf)return null;
  const text=String(command).trim(),pending=this.offers.get(topic.id);
  if(this.skip.delete(text))return null;
  const mode=this.preference();
  if(/^(?:спрашивай|снова спрашивай|сбрось выбор)(?:\s+(?:про|перед|насч[её]т))?\s+агент/iu.test(text)){this.remember('ask');this.offers.delete(topic.id);return {handled:true,text:'Хорошо, снова буду спрашивать, раздавать ли сложные задачи агентам.',by:'агенты Пети'};}
  if(pending&&this.now()-pending.at<30*60000){
   const said=text.toLowerCase().replace(/^петя[,!\s]+/u,'').replace(/[.!]+$/u,'').trim();
   // Buttons send their label; by voice short answers work too («раздай», «одним», «всегда раздавай»).
   const choice=Object.entries(OFFER).find(([,label])=>label.toLowerCase()===said)?.[0]||
    (/^(?:всегда\s+(?:раздавай|раздавать|через агентов|агентам)|раздавай\s+всегда)/u.test(said)?'always':
     /^(?:всегда\s+(?:одним|сам|без агентов)|никогда не раздавай|не предлагай агентов|больше не предлагай)/u.test(said)?'never':
     /^(?:да|давай|ок|окей|раздай|раздать|раздавай|агентам|запускай|запусти(?:\s+агентов)?|параллельно)(?:\s|,|$)/u.test(said)?'run':
     /^(?:нет|не надо|одним|одним сообщением|ответь одним|сам|ответь сам|без агентов|не раздавай)(?:\s|,|$)/u.test(said)?'single':null);
   if(choice){this.offers.delete(topic.id);this.drop(topic,pending);
    if(choice==='always')this.remember('always');if(choice==='never')this.remember('never');
    const note=choice==='always'?' Запомнил: сложные задачи буду сразу раздавать агентам. Сказать «спрашивай про агентов» — чтобы снова спрашивал.':choice==='never'?' Запомнил: буду отвечать одним сообщением. «Спрашивай про агентов» — чтобы снова спрашивал.':'';
    if(choice==='run'||choice==='always'){const r=await this.start(pending.command,topic,pending.planned);if(r&&note){r.text+=note;topic.messages.at(-1).text=r.text;}return r||{continueWith:pending.command};}
    // «Одним сообщением»: the parts are answered one after another in this chat and joined into one reply,
    // so one handler (e.g. the Slack digest) does not answer for the whole request.
    this.skip.add(pending.command);const parts=this.tasksFrom(pending.planned).map(t=>({title:t.title,request:t.request}));
    return parts.length>1?{continueWith:pending.command,parts,note}:{continueWith:pending.command,note};}
  }
  if(mode==='never'||!complexRequest(text))return null;
  let planned;try{planned=await this.plan(text);}catch{return null;} // no model: answer as usual
  if(this.tasksFrom(planned).length<2)return null;
  if(mode==='always')return this.start(text,topic,planned);
  const tasks=this.tasksFrom(planned);
  const question='Эту задачу можно раздать агентам — '+tasks.length+' параллельно:\n'+tasks.map((t,i)=>(i+1)+'. '+t.title+(t.action?' (меняет данные — запустишь сам)':'')).join('\n')+'\nРаздать или ответить одним сообщением?';
  const asked={role:'user',text,at:this.now()},reply={role:'assistant',text:question,at:this.now(),by:'агенты Пети'};
  topic.messages.push(asked,reply);this.offers.set(topic.id,{command:text,planned,at:this.now(),messages:[asked,reply]});this.dialogue.persist();
  return {handled:true,question:true,text:question,by:'агенты Пети',clarificationOptions:Object.values(OFFER),topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
 }
 drop(topic,pending){for(const m of pending.messages||[]){const i=topic.messages.indexOf(m);if(i>=0)topic.messages.splice(i,1);}}
 tasksFrom(planned){return (Array.isArray(planned?.tasks)?planned.tasks:[]).filter(t=>t&&typeof t.request==='string'&&t.request.trim()).slice(0,this.max).map(t=>({id:randomUUID(),title:String(t.title||t.request).trim().slice(0,80),request:String(t.request).trim().slice(0,1500),action:!!t.action,state:'queued',label:STATES.queued}));}
 // Returns a handled reply (the plan) or null when the request is not for agents.
 async turn(command,topic){
  if(!agentRequest(command)||!topic||topic.agentOf)return null;
  let planned=enumerated(command);
  if(!planned)try{planned=await this.plan(command);}catch(e){return {handled:true,error:true,text:'Чтобы разбить задачу для агентов, нужна локальная модель: '+e.message};}
  return this.start(command,topic,planned);
 }
 async start(command,topic,planned){
  const tasks=this.tasksFrom(planned);
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
  for(const task of plan.tasks){if(!task.topicId||['done','attention','cancelled'].includes(task.state))continue;let child=this.dialogue.state.topics.find(t=>t.id===task.topicId);
   // The pipeline may answer in an existing chat (e.g. «Мои задачи»); the agent's empty chat is then removed.
   if(!child){const moved=this.dialogue.state.topics.find(t=>t.chatJob?.command===task.request&&t.chatJob.startedAt>=plan.startedAt);if(moved){child=moved;task.topicId=moved.id;}}const job=child?.chatJob;
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
module.exports={dependentSteps,agentRequest,complexRequest,enumerated,AgentTeam,OFFER};
