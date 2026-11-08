// Agent board: who is working on what right now. Collects tasks from Petya's background chats and agent
// team, the Programmer's coding runs, and Claude/Codex handoffs, and maps each source's own states onto
// one common set, so the «Агенты» screen can show them side by side.
//
// Common statuses: running, queued, sent (handed off, progress not readable), waiting (needs the user),
// done, failed, stopped. Active = running, queued, sent, waiting.
const ACTIVE=new Set(['running','queued','sent','waiting']);
const DAY=86400000;
const LANES=[
 {id:'petya',name:'Петя',hint:'Фоновые чаты и агенты Пети. Скажи: «Раздай по агентам: …»'},
 {id:'coder',name:'Программист',hint:'Код в отдельной ветке на локальной модели. Скажи: «Исправь баг в …»'},
 {id:'claude',name:'Claude',hint:'Скажи: «Передай задачу Claude: …»'},
 {id:'codex',name:'Codex',hint:'Агент OpenAI (GPT). Скажи: «Передай задачу Codex: …»'}
];

const text=(value,max=160)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);

// A background chat job (src/chat-jobs.cjs): queued, running, done, attention, cancelled.
function chatJobStatus(job){
 return ({queued:'queued',running:'running',done:'done',attention:'waiting',cancelled:'stopped'})[job?.state]||'';
}
// The chat that split a request across agents and waits to combine their answers.
const leads=topic=>(topic.messages||[]).some(m=>m.agentPlan&&m.agentPlan.state!=='done');
function petyaTasks(topics,project){
 const rows=[];
 for(const topic of topics){
  if(topic.archived)continue;
  const job=topic.chatJob,status=chatJobStatus(job);
  if(status){
   const parent=topic.agentOf&&topics.find(t=>t.id===topic.agentOf);
   rows.push({id:'chat:'+topic.id,lane:'petya',status,
    title:text(job.command||topic.title,200)||'Чат без названия',
    label:text(job.label,200),project:project(topic.projectId),
    role:topic.agentOf?'Агент':leads(topic)?'Раздаёт агентам':'Фоновый чат',parent:parent?text(parent.title,80):'',
    at:job.at||job.startedAt||topic.at||0,startedAt:job.startedAt||0,finishedAt:job.finishedAt||0,
    steps:Array.isArray(job.steps)?job.steps.length:0,open:{kind:'chat',id:topic.id}});
  }
  // Subtasks of a running agent plan that change data are not started automatically: they wait for the user.
  for(const m of topic.messages||[]){
   const plan=m.agentPlan;if(!plan||plan.state==='done')continue;
   (plan.tasks||[]).forEach((task,i)=>{
    if(task.topicId||!['action','attention'].includes(task.state))return;
    rows.push({id:'plan:'+plan.id+':'+i,lane:'petya',status:'waiting',title:text(task.request||task.title,200),
     label:text(task.label,200),project:project(topic.projectId),role:'Агент',parent:text(topic.title,80),
     at:plan.startedAt||0,startedAt:plan.startedAt||0,finishedAt:0,steps:0,open:{kind:'chat',id:topic.id}});
   });
  }
 }
 return rows;
}

// The Programmer's runs (src/extensions/coder): running, review, empty, merged, kept, discarded, failed.
function coderStatus(run){
 if(run.state==='running')return ['running','Пишет код'];
 if(run.state==='review')return ['waiting','Ждёт решения: прими, оставь в ветке или отклони'];
 if(run.state==='empty')return run.question?['waiting','Задал вопрос']:['done','Готово без изменений'];
 if(run.state==='merged')return ['done','Влито в проект'];
 if(run.state==='kept')return ['done','Оставлено в ветке'];
 if(run.state==='discarded')return ['stopped','Отклонено'];
 if(run.state==='failed')return ['failed',text(run.error,200)||'Ошибка'];
 return ['',''];
}
function coderTasks(topics,project){
 const rows=[];
 for(const topic of topics){
  if(topic.archived)continue;
  for(const run of topic.codingRuns||[]){
   const [status,label]=coderStatus(run);if(!status)continue;
   const files=Array.isArray(run.files)?run.files.length:0;
   rows.push({id:'code:'+run.id,lane:'coder',status,title:text(run.title,200)||'Задача по коду',
    label:run.question&&status==='waiting'?text(run.question,200):label,
    project:project(topic.projectId),role:'',parent:'',repo:text(run.repo?String(run.repo).split(/[\\/]/).pop():'',80),branch:text(run.branch,120),
    files,at:run.at||topic.at||0,startedAt:run.at||0,finishedAt:0,steps:Array.isArray(run.steps)?run.steps.length:0,open:{kind:'chat',id:topic.id}});
  }
 }
 return rows;
}

// Claude/Codex handoffs (src/agents.cjs, src/task-monitor.cjs).
function handoffStatus(row,now){
 const run={inProgress:['running','В работе'],completed:['done','Работа завершена'],failed:['failed','Ошибка выполнения'],interrupted:['stopped','Работа прервана'],needsAttention:['waiting','Нужно твоё решение']}[row.executionState];
 if(row.state==='submitted'){
  if(run)return run;
  // Sent, progress not read yet. Claude chats with a link are read by the task monitor for 3 days (macOS);
  // without a link progress stays in the app, and after a day the task is no longer shown as active.
  const watched=row.target==='claude'&&row.url;
  return now-(row.at||0)<(watched?3:1)*DAY?['sent',watched?'Отправлена в чат · Петя проверит ход работы':'Отправлена в чат · ход работы виден в приложении']:['done','Отправлена в чат'];
 }
 return ({
  routing:['waiting',row.deferred?'Передача отложена':'Нужно выбрать агента'],
  ready:['waiting','Запрос готов к передаче'],
  'project-required':['waiting','Нужно уточнить проект'],
  'send-required':['waiting','Нажми отправку в приложении агента'],
  'paste-required':['waiting','Вставь запрос из буфера и нажми отправку'],
  opening:['running','Открываю приложение'],
  submitting:['running','Отправляю в чат'],
  unknown:['waiting','Результат отправки неизвестен — проверь приложение'],
  failed:['failed',text(row.error,200)||'Не удалось передать']
 })[row.state]||['',''];
}
function handoffTasks(records,now){
 const rows=[];
 for(const row of records){
  if(row.state==='expired')continue;
  const [status,label]=handoffStatus(row,now);if(!status)continue;
  const lane=row.target==='claude'||row.target==='codex'?row.target:row.preferred==='claude'||row.preferred==='codex'?row.preferred:'';
  const keys=Array.isArray(row.keys)?row.keys.filter(Boolean):[];
  rows.push({id:'agent:'+row.id,lane:lane||'claude',unassigned:!lane,status,
   title:text(row.command,200)||keys.join(', ')||'Передача задачи',label:row.error&&status!=='failed'?label+': '+text(row.error,120):label,
   project:text(row.project?.name,80),keys,role:'',parent:'',at:row.checkedAt||row.at||0,startedAt:row.at||0,finishedAt:0,steps:0,
   open:{kind:'agent',id:row.id,chat:!!row.url,origin:row.originTopicId||''}});
 }
 return rows;
}

const ORDER={waiting:0,running:1,queued:2,sent:3,failed:4,stopped:5,done:6};
function sort(a,b){return (ORDER[a.status]-ORDER[b.status])||(b.at-a.at);}

// Finished tasks older than `keep` are left out; each lane keeps at most `limit` tasks.
function board({records=[],topics=[],projects=[],now=Date.now(),keep=7*DAY,limit=60}={}){
 const names=new Map(projects.map(p=>[p.id,text(p.name||p.title,80)]));
 const project=id=>names.get(id)||'';
 const all=[...petyaTasks(topics,project),...coderTasks(topics,project),...handoffTasks(records,now)]
  .filter(t=>ACTIVE.has(t.status)||now-t.at<=keep);
 const lanes=LANES.map(lane=>{
  const tasks=all.filter(t=>t.lane===lane.id).sort(sort);
  const counts={};for(const t of tasks)counts[t.status]=(counts[t.status]||0)+1;
  return {...lane,active:tasks.filter(t=>ACTIVE.has(t.status)).length,counts,tasks:tasks.slice(0,limit)};
 });
 const totals={};for(const t of all)totals[t.status]=(totals[t.status]||0)+1;
 return {at:now,lanes,totals,active:all.filter(t=>ACTIVE.has(t.status)).length};
}
module.exports={board,ACTIVE:[...ACTIVE],LANES,handoffStatus,coderStatus,chatJobStatus};
