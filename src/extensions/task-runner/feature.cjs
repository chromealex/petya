// Task runner plugin: «Реализовать» / «Исправить» on a task card opens a separate chat for the work.
// 1. Petya proposes a plan (local model). 2. The user approves it or keeps chatting with corrections —
//    every message in that chat while the plan is open revises it. 3. After approval the steps go to the
//    code agents (Codex or Claude) one after another; the plan card shows each step's progress.
const {randomUUID}=require('node:crypto');
const plans=require('./plan.cjs');
const FINAL=new Set(['done','stopped']);
// Local models that can write code; without one, code goes to Claude Code or Codex (GPT).
const CODER=/coder|codestral|devstral|codellama|starcoder|codegemma|deepseek-coder|granite-code/i;
let instance=null;

function setup(s){
 const topics=()=>s.dialogue.state.topics;
 const find=id=>{const topic=topics().find(t=>t.taskRun?.id===id);if(!topic)throw Error('План работ не найден.');return {topic,run:topic.taskRun};};
 const model=async(system,data)=>{
  if(!s.settings.model)throw Error('no model');
  const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,format:'json',options:{temperature:0.2,num_predict:1400},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]})});
  return JSON.parse(response?.message?.content||'null');
 };
 let coderCache={at:0,name:''};
 async function codingModel(){
  if(Date.now()-coderCache.at<60000)return coderCache.name;
  let name='';
  try{const base=s.core.localEndpoint(s.settings.ollamaUrl).replace(/\/api\/chat$/,'');const tags=await (s.directRequest||s.request)(base+'/api/tags',{signal:AbortSignal.timeout(3000)});
   name=(Array.isArray(tags?.models)?tags.models:[]).map(m=>m?.name).find(n=>typeof n==='string'&&CODER.test(n)&&!/cloud/i.test(n))||'';}catch{}
  coderCache={at:Date.now(),name};return name;
 }
 const view=run=>({id:run.id,state:run.state,version:run.version,agent:run.agent,localCoder:run.localCoder||'',task:{key:run.task.key,title:run.task.title,url:run.task.url,kind:run.task.kind,app:run.task.app},
  plan:{summary:run.plan.summary,questions:run.plan.questions||[],steps:run.plan.steps.map(({id,title,details,check,state,note,url,result})=>({id,title,details,check,state:state||'waiting',note:note||'',hasChat:!!url,result:result?String(result).slice(0,run.agent==='local'?20000:600):''}))}});
 const text=run=>['План работ · '+run.task.key+' · вариант '+run.version,run.plan.summary,...run.plan.steps.map((st,i)=>(i+1)+'. '+st.title),...(run.plan.questions?.length?['Вопросы: '+run.plan.questions.join('; ')]:[])].filter(Boolean).join('\n');
 function push(topic,run){
  // Each plan version is its own message; older versions stay in the history but lose their buttons.
  topic.messages.push({role:'assistant',text:text(run),at:Date.now(),by:'план работ',extensionData:{taskRun:{runId:run.id,version:run.version}}});
  s.dialogue.persist();
 }

 async function start(task){
  if(!task||typeof task.key!=='string'||typeof task.title!=='string')throw Error('Нет данных задачи.');
  const clean={app:String(task.app||'jira').slice(0,20),key:task.key.slice(0,40),title:task.title.slice(0,300),type:String(task.type||'').slice(0,60),
   kind:/bug|баг|ошибк|дефект/i.test(String(task.type||''))?'bug':'feature',description:String(task.description||'').slice(0,20000),url:/^https:\/\//.test(task.url||'')?task.url:''};
  // An unfinished run for the same task is reopened instead of starting a duplicate.
  const existing=topics().find(t=>!t.archived&&t.taskRun?.task.key===clean.key&&t.taskRun.task.app===clean.app&&!FINAL.has(t.taskRun.state));
  // The card opens the chat (selectDialogueTopic): switching here made the card's own action fail with «Чат изменился».
  if(existing){return {handled:true,text:'Открыл чат выполнения '+clean.key+'.',topicId:existing.id,reopened:true};}
  const source=s.dialogue.active();
  const topic={id:randomUUID(),projectId:source?.projectId||s.dialogue.state.activeProjectId||'general',title:(clean.kind==='bug'?'Исправить ':'Реализовать ')+clean.key+' · '+clean.title.slice(0,60),kind:'chat',messages:[],at:Date.now(),projectMemoryId:source?.projectMemoryId||''};
  topic.messages.push({role:'user',text:(clean.kind==='bug'?'Исправь ':'Реализуй ')+clean.key+': '+clean.title,at:Date.now()});
  s.requestProgress?.report('Составляю план работ по '+clean.key);
  const plan=await plans.propose(model,clean);
  const localCoder=await codingModel();
  topic.taskRun={id:randomUUID(),task:clean,state:'proposed',version:1,feedback:[],agent:localCoder?'local':'auto',localCoder,plan,startedAt:Date.now()};
  topics().push(topic);push(topic,topic.taskRun);
  return {handled:true,text:'Составил план работ по '+clean.key+' в отдельном чате.',topicId:topic.id};
 }

 // A message in the run's chat while the plan is open is a correction: Petya revises the plan.
 async function revise(topic,command){
  const run=topic.taskRun;
  run.feedback.push(String(command).slice(0,1000));
  s.requestProgress?.report('Переделываю план с учётом поправки');
  run.plan=await plans.propose(model,run.task,run.feedback,run.plan);run.version++;run.localCoder=await codingModel();
  topic.messages.push({role:'user',text:command,at:Date.now()});push(topic,run);
  return {handled:true,text:text(run),topicId:topic.id,messages:topic.messages,by:'план работ'};
 }

 async function approve(id,agent='auto'){
  const {topic,run}=find(id);
  if(run.state!=='proposed')throw Error('План уже утверждён.');
  if(!['auto','codex','claude','local'].includes(agent))throw Error('Неизвестный агент.');
  if(agent==='local'){run.localCoder=await codingModel();if(!run.localCoder)throw Error('Локальная модель для кода не найдена в Ollama. Выберите Claude или Codex.');}
  else s.modules.assertEnabled(s.settings,'ai');
  run.agent=agent;run.state='running';run.approvedAt=Date.now();
  for(const step of run.plan.steps)step.state='waiting';
  topic.messages.push({role:'user',text:'Утверждаю план',at:Date.now()});s.dialogue.persist();
  await next(topic,run);
  return view(run);
 }
 // Steps run one after another: each one sees the code the previous one left.
 async function next(topic,run){
  if(run.state!=='running')return;
  const step=run.plan.steps.find(st=>st.state==='waiting');
  if(!step){run.state='done';run.doneAt=Date.now();topic.messages.push({role:'assistant',text:'Все шаги плана по '+run.task.key+' выполнены. Проверьте изменения в репозитории и задачу '+run.task.key+'.',at:Date.now(),by:'план работ'});s.dialogue.persist();return;}
  step.state='running';s.dialogue.persist();
  if(run.agent==='local'){await local(topic,run,step);return;}
  try{
   const record=s.agents.create(run.agent,plans.prompt(run,step));
   Object.assign(record,{originTopicId:topic.id,command:'Выполнение '+run.task.key+': '+step.title,contextText:run.task.title+'\n'+run.task.description.slice(0,2000),projectMemoryId:topic.projectMemoryId||''});s.agents.persist();
   step.recordId=record.id;s.dialogue.persist();
   const routed=await s.agents.route(record.id,run.agent==='auto'?'':run.agent);
   const row=routed.record||record;
   if(!routed.ready){step.state='attention';step.note=routed.reason||row.error||'Нужно выбрать агента или проект.';}
   else if(row.state==='project-required'){step.state='attention';step.note=row.error||'Уточните проект в разделе «Агенты».';}
   else{step.url=row.url||'';step.state=row.target==='codex'&&row.state==='submitted'?'running':'sent';step.note=step.state==='sent'?'Отправлено в '+(row.target==='claude'?'Claude':'Codex')+'. Отметьте шаг, когда он готов.':'';}
  }catch(e){step.state='failed';step.note=e.message;}
  s.dialogue.persist();
 }
 // A local coding model cannot touch the repository: it prepares the change as a diff, the user applies it.
 async function local(topic,run,step){
  try{
   const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:run.localCoder,stream:false,think:false,options:{temperature:0.2,num_predict:2400},messages:[
    {role:'system',content:'Ты программист. У тебя нет доступа к файлам: верни изменения как unified diff по путям из описания, затем коротко — как проверить. Не выдумывай файлы, которых нет в задаче; если не хватает кода, перечисли, какие файлы нужны.'},
    {role:'user',content:plans.prompt(run,step)}]})});
   const text=String(response?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();
   if(!text)throw Error('Локальная модель не вернула правку.');
   step.result=text.slice(0,20000);step.state='sent';step.note='Правку подготовила локальная модель '+run.localCoder+'. Примените её и отметьте «Шаг готов».';
  }catch(e){step.state='failed';step.note=e.message;}
  s.dialogue.persist();
 }
 // Codex reports progress; Claude does not, so its steps wait for «Шаг готов».
 async function poll(){
  for(const topic of topics()){
   const run=topic.taskRun;if(!run||run.state!=='running')continue;
   const step=run.plan.steps.find(st=>st.state==='running'&&st.recordId);if(!step)continue;
   const record=s.agents.records.find(r=>r.id===step.recordId);if(!record||record.target!=='codex'||record.state!=='submitted')continue;
   let live;try{live=await s.agents.delivery.status(record);}catch{continue;}
   if(live.status==='completed'){step.state='done';step.result=live.answer||'';s.dialogue.persist();await next(topic,run);}
   else if(['failed','interrupted'].includes(live.status)){step.state='failed';step.note='Codex остановил выполнение: '+live.status+'. Откройте чат агента.';s.dialogue.persist();}
   else if(live.status==='needsAttention'){step.state='attention';step.note='Codex ждёт вашего ответа в своём чате.';s.dialogue.persist();}
  }
 }
 async function stepDone(id,stepId){const {topic,run}=find(id);const step=run.plan.steps.find(st=>st.id===stepId);if(!step||!['sent','attention','failed','running'].includes(step.state))throw Error('Шаг нельзя отметить.');step.state='done';s.dialogue.persist();await next(topic,run);return view(run);}
 async function retry(id,stepId){const {topic,run}=find(id);const step=run.plan.steps.find(st=>st.id===stepId);if(!step||!['failed','attention'].includes(step.state))throw Error('Шаг нельзя повторить.');if(run.state!=='running')throw Error('План не выполняется.');step.state='waiting';step.note='';await next(topic,run);return view(run);}
 function stop(id){const {topic,run}=find(id);if(FINAL.has(run.state))return view(run);run.state='stopped';for(const st of run.plan.steps)if(['waiting'].includes(st.state))st.state='skipped';topic.messages.push({role:'assistant',text:'Остановил выполнение '+run.task.key+'. Уже отправленные агентам шаги продолжают работу в их чатах.',at:Date.now(),by:'план работ'});s.dialogue.persist();return view(run);}
 async function openStep(id,stepId){const {run}=find(id);const step=run.plan.steps.find(st=>st.id===stepId);if(!step?.recordId)throw Error('У шага нет чата агента.');const record=s.agents.records.find(r=>r.id===step.recordId);if(!record?.url)throw Error('Ссылка на чат агента пока недоступна.');await require('electron').shell.openExternal(record.url.startsWith('claude.ai/')?'https://'+record.url:record.url);return true;}

 if(!s.smoke){const timer=setInterval(()=>poll().catch(()=>{}),20000);timer.unref?.();}
 instance={start,revise,approve,poll,next};
 return {taskRunner:{start,revise,poll},ipc:{status:id=>view(find(id).run),approve,stepDone,retry,stop,openStep}};
}
// Generic plugin turn: messages in a run's chat while its plan is open revise the plan.
async function turn(s,command){
 const topic=s.dialogue.active(),run=topic?.taskRun;
 if(!instance||!run||run.state!=='proposed')return null;
 if(/^\s*(?:утвержда\S*|утверди\S*|(?:ок|ладно|да)?,?\s*запускай|поехали)\s*[.!]?\s*$/iu.test(command)){
  await instance.approve(run.id,run.agent||'auto');
  return {handled:true,text:'План утверждён, раздаю шаги агентам.',topicId:topic.id,messages:topic.messages,by:'план работ'};
 }
 return instance.revise(topic,command);
}
module.exports={name:'taskRunner',setup,turn};
