// Feature: Petya writes code himself on a local model. A task runs in its own git worktree on a `petya/…` branch;
// the chat gets a diff card, and nothing reaches the project folder until the user accepts it.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {localEndpoint}=require('../../core.cjs');
const cancel=require('../../answer-cancel.cjs');
const {CoderWorkspace}=require('./workspace.cjs');
const agent=require('./agent.cjs');

const defaults={coderModel:'',coderRun:'tests',coderSteps:'40'};
function validate(next){
 if(typeof next.coderModel!=='string'||next.coderModel.length>200||!/^[\w.:/-]*$/.test(next.coderModel))next.coderModel='';
 if(!['tests','off'].includes(next.coderRun))next.coderRun='tests';
 const steps=Number(next.coderSteps);next.coderSteps=String(Number.isInteger(steps)&&steps>=10&&steps<=100?steps:40);
}

function setup(s){
 const root=s.coderRoot||path.join(require('electron').app.getPath('userData'),'coder-worktrees');
 const workspace=s.coderWorkspace||new CoderWorkspace({root});
 const busy=new Set();let operation=null,controller=null;
 const model=()=>s.settings.coderModel||s.settings.model;
 function publish(id,text,state){
  operation={id:'coder:'+id,title:'Программист',text,busy:state==='running',kind:state==='running'?'info':state,version:state+':'+text.slice(0,40)};
  if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('coder-progress',operation);
 }
 async function chat({messages,tools,format}){
  const name=model();if(!name)throw Error('Выбери модель для кода в настройках «Программиста» или общую модель Ollama.');
  const response=await s.request(localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:10*60000,signal:controller?.signal,
   body:JSON.stringify({model:name,stream:false,think:false,keep_alive:'20m',options:{temperature:0.2,num_predict:4096},messages,...tools?{tools}:{},...format?{format}:{}})});
  if(response?.error)throw Error(String(response.error));
  return response?.message||{};
 }
 // The repository of the current project: the one Git already selected, the only one, or the user's choice.
 async function repository(check,choice){
  if(!s.gitWorkspace)throw Error('Git недоступен.');
  const found=await s.gitWorkspace.discover();check();
  if(choice){const pick=found.repositories.find(r=>r===choice||path.basename(r)===choice);if(pick)return pick;}
  if(found.selected)return found.selected;
  if(!found.repositories.length)throw Error(found.folders?.length?'В папках проекта нет Git-репозитория. Программист работает только с Git: скажи «создай git», и я подготовлю репозиторий.':'У проекта нет папки на компьютере. Подключи папку проекта в настройках проекта — тогда смогу писать код.');
  return null;
 }
 function view(run,diff){
  return {id:run.id,state:run.state,title:run.title,branch:run.branch,repo:path.basename(run.repo),summary:run.summary||'',question:run.question||'',
   files:diff?.files||run.files||[],added:diff?.added??run.added??0,removed:diff?.removed??run.removed??0,patch:diff?.patch??run.patch??'',
   verification:run.verification||null,steps:(run.steps||[]).slice(-60),model:run.model,dirtyBase:!!run.dirtyBase,error:run.error||''};
 }
 function reply(topic,command,text,run,diff){
  s.dialogue.rememberAction(command,text);
  const t=s.dialogue.active(),last=t?.messages?.at(-1);
  if(last?.role==='assistant'){last.by='Программист';if(run){last.codingRun=view(run,diff);run.messageAt=t.messages.length-1;}}
  s.dialogue.persist();
  return {handled:true,text,by:'Программист',topicId:t?.id,messages:t?.messages};
 }
 // Keep older cards of the same run in sync, so their buttons disappear after a decision.
 function settle(topic,run){for(const m of topic.messages||[])if(m.codingRun?.id===run.id)m.codingRun={...m.codingRun,state:run.state};}

 async function work(topic,command,run,check,task=command){
  if(busy.has(run.id))throw Error('Программист уже работает над этой задачей.');
  if(controller)throw Error('Программист уже работает в другом чате. Дождись окончания.');
  busy.add(run.id);controller=new AbortController();
  const outer=cancel.signal(),abort=()=>controller?.abort();outer?.addEventListener('abort',abort,{once:true});
  run.state='running';run.model=model();s.dialogue.persist();publish(run.id,'Работаю над кодом: '+run.title,'running');
  try{
   const history=(topic.messages||[]).filter(m=>!m.pending&&['user','assistant'].includes(m.role)).slice(-6);
   const testCommand=s.settings.coderRun==='off'?'':await workspace.testCommand(run);check();
   const result=await agent.run({task,history,workspace,record:run,chat,check,signal:controller.signal,
    maxSteps:Number(s.settings.coderSteps)||40,testCommand,runCommands:s.settings.coderRun!=='off',
    report:label=>{s.requestProgress?.report(label);publish(run.id,label,'running');}});
   check();
   run.steps=[...(run.steps||[]),...result.steps].slice(-120);
   run.summary=result.summary;run.question=result.question||'';run.verification=result.verification||null;
   const diff=await workspace.diff(run);check();
   run.files=diff.files;run.added=diff.added;run.removed=diff.removed;run.patch=diff.patch;
   run.state=diff.files.length?'review':'empty';
   const verdict=result.verification?(result.verification.ok?' Проверка «'+result.verification.command+'» прошла.':' Проверка «'+result.verification.command+'» не прошла — посмотри вывод в карточке.'):'';
   let text;
   if(run.question&&!diff.files.length)text=run.question;
   else if(!diff.files.length)text=(result.summary||'Изменений не понадобилось.')+' Код не менял.';
   else text=result.summary+verdict+' Изменения в ветке '+run.branch+': скажи «прими», чтобы влить, «оставь в ветке» или «отклони».'+(run.question?'\nВопрос: '+run.question:'');
   if(run.dirtyBase)text+='\nВ папке проекта были незакоммиченные правки — в рабочую копию они не попали.';
   if(run.state==='empty'&&!run.question){await workspace.discard(run).catch(()=>{});run.state='discarded';}
   publish(run.id,diff.files.length?'Готово: '+diff.files.length+' файл(ов) изменено, жду решения.':'Готово без изменений.','success');
   return reply(topic,command,text,run,diff);
  }catch(e){
   run.state=(await workspace.exists(run))?'review':'failed';run.error=e.message;
   publish(run.id,e.name==='AbortError'?'Остановлено.':e.message,'error');
   if(e.name==='AbortError'){const diff=await workspace.diff(run).catch(()=>null);if(diff?.files.length){run.files=diff.files;run.patch=diff.patch;return reply(topic,command,'Остановил. Что успел изменить — в ветке '+run.branch+': «прими», «оставь в ветке» или «отклони».',run,diff);}}
   throw e;
  }finally{busy.delete(run.id);controller=null;outer?.removeEventListener('abort',abort);s.dialogue.persist();}
 }

 async function start(command,check,choice){
  const topic=s.dialogue.active();if(!topic)throw Error('Открой чат проекта.');
  const open=current(topic);if(open)return refine(command,check);
  const repo=await repository(check,choice);
  if(!repo){const found=await s.gitWorkspace.discover();check();
   return require('../../input-required.cjs').ask({text:'В каком репозитории писать код?',label:'Репозиторий',options:found.repositories.map(r=>path.basename(r)),strictChoices:true},answer=>{check();return start(command,check,found.repositories.find(r=>path.basename(r)===answer)||answer);});}
  s.requestProgress?.report('Готовлю отдельную рабочую копию '+path.basename(repo));
  const title=require('./intent.cjs').clean(command).replace(/\s+/g,' ').slice(0,80);
  const run={...await workspace.create(repo,title),title,state:'running',at:Date.now()};check();
  (topic.codingRuns||=[]).push(run);topic.codingRunId=run.id;s.dialogue.persist();
  return work(topic,command,run,check);
 }
 function current(topic){const run=topic?.codingRuns?.find(r=>r.id===topic.codingRunId);return run&&['review','running','empty'].includes(run.state)?run:null;}
 async function refine(command,check){
  const topic=s.dialogue.active(),run=current(topic);if(!run)return start(command,check);
  if(!await workspace.exists(run)){run.state='failed';s.dialogue.persist();return reply(topic,command,'Рабочая копия прошлой задачи удалена. Повтори задачу целиком.',null);}
  return work(topic,command,run,check,'Продолжение задачи «'+run.title+'». Уже сделано: '+(run.summary||'—')+'\nНовая просьба: '+command);
 }
 async function decide(kind,command,check){
  const topic=s.dialogue.active(),run=current(topic);
  if(!run)return reply(topic,command,'Нет изменений, которые ждут решения.',null);
  if(busy.has(run.id))throw Error('Программист ещё работает. Дождись окончания или останови ответ.');
  if(kind==='show'){const diff=await workspace.diff(run);check();return reply(topic,command,diff.files.length?'Изменено файлов: '+diff.files.length+' (+'+diff.added+' −'+diff.removed+').':'Изменений нет.',run,diff);}
  let text;
  try{
   if(kind==='discard'){await workspace.discard(run);run.state='discarded';text='Отклонил: ветка '+run.branch+' и рабочая копия удалены, проект не менялся.';}
   else{
    const message='Петя: '+run.title;
    const result=await workspace.accept(run,message,{merge:kind==='accept'});
    run.state=result.merged?'merged':'kept';
    text=result.merged?'Влил изменения в ветку '+result.into+' ('+run.files?.length+' файл(ов)). Рабочая копия удалена. Отправить на сервер можно командой «git push».':'Сохранил коммит в ветке '+run.branch+'. Рабочая копия удалена, ветка осталась в репозитории.';
   }
  }catch(e){check();return reply(topic,command,e.message,null);}
  check();settle(topic,run);publish(run.id,text,'success');delete topic.codingRunId;
  return reply(topic,command,text,null);
 }
 async function models(){
  const base=new URL(localEndpoint(s.settings.ollamaUrl));
  const tags=await (s.directRequest||s.request)(new URL('/api/tags',base).href,{signal:AbortSignal.timeout(4000)});
  return {current:s.settings.coderModel||'',fallback:s.settings.model||'',models:(tags?.models||[]).filter(m=>typeof m.name==='string'&&!/embed|cloud/i.test(m.name)).map(m=>({name:m.name,size:Number(m.size)||0,coder:/coder|code|devstral|codestral|starcoder|deepseek/i.test(m.name)}))};
 }
 const api={start,refine,decide,current,models,progress:()=>operation,stop(){controller?.abort();return {stopped:!!controller};}};
 return {coder:api,ipc:{models,progress:api.progress,stop:api.stop}};
}
module.exports={name:'coder',defaults,validate,setup};
