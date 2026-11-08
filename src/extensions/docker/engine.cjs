// «Docker», what is read from and done to the local engine. Reads: containers with live CPU/memory, compose
// projects, images (dangling ones apart), volumes, disk usage, a container's logs and the facts about why it
// stops. Writes (start/stop/restart, compose up/down, removing dangling images) are separate functions the card
// calls only after the user confirmed; each target is re-checked against the engine before the command runs.
const fs=require('node:fs');
const path=require('node:path');
const {bytes}=require('./cli.cjs');

const ID=/^[a-f0-9]{12,64}$/;
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const IMAGE_ID=/^(?:sha256:)?[a-f0-9]{12,64}$/;

function label(labels,key){
 if(labels&&typeof labels==='object')return labels[key]||'';
 for(const part of String(labels||'').split(',')){const i=part.indexOf('=');if(i>0&&part.slice(0,i)===key)return part.slice(i+1);}
 return '';
}
// «0.0.0.0:5432->5432/tcp, :::5432->5432/tcp, 6379/tcp» → [{host:'5432',container:'5432/tcp',bind:'0.0.0.0'}, {container:'6379/tcp'}]
function ports(text){
 const seen=new Set(),out=[];
 for(const raw of String(text||'').split(/,\s*/).filter(Boolean)){
  const m=/^(?:(.*):(\d+(?:-\d+)?)->)?(\d+(?:-\d+)?\/\w+)$/.exec(raw.trim());
  if(!m)continue;
  const item=m[2]?{host:m[2],container:m[3],bind:m[1]==='::'||m[1]==='[::]'?'::':m[1]}:{container:m[3]};
  const key=(item.host||'')+'>'+item.container;
  if(seen.has(key))continue;seen.add(key);out.push(item);
 }
 return out;
}
const percent=v=>{const n=parseFloat(String(v||'').replace('%',''));return Number.isFinite(n)?n:null;};
// «25.3MiB / 7.66GiB» → {used, limit}
function memory(text){const [a,b]=String(text||'').split('/');return {used:bytes(a),limit:bytes(b)};}
function exitCode(status){const m=/\((-?\d+)\)/.exec(String(status||''));return m?Number(m[1]):null;}

function container(row,stats){
 const name=String(row.Names||'').split(',')[0];
 const s=stats.find(x=>x.Name===name||String(row.ID).startsWith(String(x.ID||x.Container||'_')));
 const mem=s?memory(s.MemUsage):null;
 const state=String(row.State||'').toLowerCase()||(/^up/i.test(row.Status)?'running':'exited');
 return {
  id:String(row.ID||''),name,image:String(row.Image||''),state,status:String(row.Status||''),
  health:/\((healthy|unhealthy|health: starting)\)/i.exec(row.Status||'')?.[1]?.toLowerCase()||'',
  exitCode:state==='exited'||state==='restarting'?exitCode(row.Status):null,
  ports:ports(row.Ports),created:String(row.CreatedAt||''),runningFor:String(row.RunningFor||''),
  project:label(row.Labels,'com.docker.compose.project'),service:label(row.Labels,'com.docker.compose.service'),
  cpu:s?percent(s.CPUPerc):null,memPercent:s?percent(s.MemPerc):null,memUsed:mem?.used??null,memLimit:mem?.limit??null
 };
}
function image(row){
 const dangling=row.Repository==='<none>'&&row.Tag==='<none>'||row.Dangling===true;
 return {id:String(row.ID||'').replace(/^sha256:/,''),repository:String(row.Repository||''),tag:String(row.Tag||''),dangling,
  size:bytes(row.Size||row.VirtualSize),created:String(row.CreatedSince||row.CreatedAt||''),containers:Number(row.Containers)||0};
}
function composeProject(row){
 const status=String(row.Status||'');
 const running=[...status.matchAll(/running\((\d+)\)/g)].reduce((a,m)=>a+Number(m[1]),0);
 const total=[...status.matchAll(/\w+\((\d+)\)/g)].reduce((a,m)=>a+Number(m[1]),0);
 return {name:String(row.Name||''),status,running,total,files:String(row.ConfigFiles||'').split(',').map(f=>f.trim()).filter(Boolean)};
}
// `docker system df --format json`: «Images», «Containers», «Local Volumes», «Build Cache».
const DF_TYPES={'Images':'images','Containers':'containers','Local Volumes':'volumes','Build Cache':'cache'};
function df(rows){
 return rows.filter(r=>DF_TYPES[r.Type]).map(r=>({type:DF_TYPES[r.Type],count:Number(r.TotalCount)||0,active:Number(r.Active)||0,size:bytes(r.Size),reclaimable:bytes(String(r.Reclaimable||'').split(' ')[0])}));
}

function create(cli){
 const soft=p=>p.catch(e=>{if(['missing','stopped','denied'].includes(e.kind))throw e;return null;});
 async function containers({stats=true}={}){
  const rows=await cli.json(['ps','--all','--format','json']);
  const running=rows.some(r=>String(r.State||'').toLowerCase()==='running'||/^up/i.test(r.Status));
  // stats waits for one sample from every running container: skipped when nothing runs.
  const st=stats&&running?await soft(cli.json(['stats','--no-stream','--format','json'],{timeout:25000})):[];
  return {containers:rows.map(r=>container(r,st||[])),statsMissing:stats&&running&&!st};
 }
 async function overview(){
  const [c,compose,images,volumes]=await Promise.all([containers(),soft(cli.json(['compose','ls','--all','--format','json'])),soft(cli.json(['images','--format','json'])),soft(cli.json(['volume','ls','--format','json']))]);
  const order={running:0,restarting:1,paused:2,created:3,exited:4,dead:5};
  c.containers.sort((a,b)=>(order[a.state]??9)-(order[b.state]??9)||(!a.project)-(!b.project)||a.project.localeCompare(b.project)||a.name.localeCompare(b.name));
  return {...c,compose:compose?compose.map(composeProject):null,
   images:images?images.map(image):null,volumes:volumes?volumes.map(v=>({name:String(v.Name||''),driver:String(v.Driver||'')})):null};
 }
 async function disk(){
  const [rows,images,volumes]=await Promise.all([cli.json(['system','df','--format','json']),soft(cli.json(['images','--format','json'])),soft(cli.json(['volume','ls','--format','json']))]);
  const list=(images||[]).map(image);
  return {usage:df(rows),dangling:list.filter(i=>i.dangling),images:list.filter(i=>!i.dangling).sort((a,b)=>b.size-a.size).slice(0,8),volumes:(volumes||[]).length};
 }
 const safeTarget=t=>{if(!ID.test(String(t))&&!NAME.test(String(t)))throw Error('Некорректное имя контейнера.');return String(t);};
 // Plain inspect prints a JSON array on every CLI version.
 async function inspect(target){
  const [info]=await cli.json(['container','inspect',safeTarget(target)]);
  if(!info)throw Error('Контейнер не найден.');
  return info;
 }
 // Logs: stdout and stderr both, with timestamps so the two streams can be merged in order.
 async function logs(target,{tail=200,since=''}={}){
  safeTarget(target);
  const args=['logs','--timestamps','--tail',String(Math.max(1,Math.min(5000,tail|0)))];
  if(since){if(!/^\d{1,5}[smh]$/.test(since))throw Error('Некорректный период логов.');args.push('--since',since);}
  args.push(target);
  const {stdout,stderr}=await cli.run(args,{timeout:20000});
  return mergeLogs(stdout,stderr);
 }
 async function crash(target){
  const info=await inspect(target);
  const st=info.State||{};
  const lines=await logs(target,{tail:60}).catch(()=>[]);
  return {
   id:String(info.Id||'').slice(0,12),name:String(info.Name||'').replace(/^\//,''),image:String(info.Config?.Image||''),
   state:String(st.Status||''),running:!!st.Running,restarting:!!st.Restarting,exitCode:Number.isInteger(st.ExitCode)?st.ExitCode:null,
   oomKilled:!!st.OOMKilled,error:String(st.Error||''),startedAt:String(st.StartedAt||''),finishedAt:String(st.FinishedAt||''),
   restartCount:Number(info.RestartCount)||0,restartPolicy:String(info.HostConfig?.RestartPolicy?.Name||''),
   memoryLimit:Number(info.HostConfig?.Memory)||0,health:String(st.Health?.Status||''),
   healthLog:(st.Health?.Log||[]).slice(-3).map(h=>({exitCode:h.ExitCode,output:String(h.Output||'').trim().slice(0,300)})),
   project:String(info.Config?.Labels?.['com.docker.compose.project']||''),lines:lines.slice(-60)
  };
 }

 // --- Writes: called from the card after the user confirmed --------------------------------------------
 async function findContainer(target){
  const t=String(target||'');
  if(!ID.test(t)&&!NAME.test(t))throw Error('Некорректное имя контейнера.');
  const {containers:list}=await containers({stats:false});
  const found=list.find(c=>c.id===t||c.id.startsWith(t)&&t.length>=12||c.name===t);
  if(!found)throw Error('Контейнер «'+t+'» больше не найден. Обновите список.');
  return found;
 }
 async function containerAction(verb,target){
  if(!['start','stop','restart'].includes(verb))throw Error('Неизвестное действие.');
  const c=await findContainer(target);
  await cli.run([verb,c.id],{timeout:verb==='start'?60000:90000});
  const after=(await containers({stats:false})).containers.find(x=>x.id===c.id);
  return {container:after||c,before:c.state};
 }
 async function findProject(name){
  const n=String(name||'');
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(n))throw Error('Некорректное имя compose-проекта.');
  const rows=(await cli.json(['compose','ls','--all','--format','json'])).map(composeProject);
  const p=rows.find(r=>r.name===n);
  if(!p)throw Error('Compose-проект «'+n+'» не найден. Обновите список.');
  return p;
 }
 async function compose(verb,name){
  if(!['up','down'].includes(verb))throw Error('Неизвестное действие.');
  const p=await findProject(name);
  const files=p.files.filter(f=>path.isAbsolute(f)&&fs.existsSync(f));
  if(verb==='up'&&!files.length)throw Error('Файл compose проекта «'+p.name+'» не найден на диске: '+(p.files.join(', ')||'не указан')+'.');
  const args=['compose','--project-name',p.name,...files.flatMap(f=>['--file',f]),...(verb==='up'?['up','--detach']:['down'])];
  await cli.run(args,{timeout:10*60000,cwd:files[0]?path.dirname(files[0]):undefined});
  const after=(await cli.json(['compose','ls','--all','--format','json']).catch(()=>[])).map(composeProject).find(r=>r.name===p.name);
  return {project:after||{...p,status:verb==='down'?'':p.status,running:verb==='down'?0:p.running}};
 }
 // Removes exactly the dangling images the user saw and confirmed that are still dangling now.
 async function removeDangling(ids){
  const wanted=[...new Set((Array.isArray(ids)?ids:[]).map(String))];
  if(!wanted.length)throw Error('Ничего не выбрано.');
  if(wanted.some(id=>!IMAGE_ID.test(id)))throw Error('Некорректный идентификатор образа.');
  const now=(await cli.json(['images','--filter','dangling=true','--format','json'])).map(image);
  const removed=[],failed=[];let freed=0;
  for(const id of wanted.map(x=>x.replace(/^sha256:/,''))){
   const img=now.find(i=>i.id.startsWith(id)||id.startsWith(i.id));
   if(!img){failed.push({id,error:'уже не висячий или удалён'});continue;}
   try{await cli.run(['image','rm',img.id],{timeout:60000});removed.push(img.id);freed+=img.size;}
   catch(e){failed.push({id:img.id,error:/being used|conflict/i.test(e.message)?'используется контейнером':e.message});}
  }
  return {removed,failed,freed};
 }
 return {containers,overview,disk,inspect,logs,crash,containerAction,compose,removeDangling,findContainer};
}

// «2026-11-09T10:00:01.123456789Z message» lines from both streams, merged by time.
function mergeLogs(stdout,stderr){
 const parse=(text,stream)=>String(text||'').split(/\r?\n/).filter(l=>l.trim()).map(l=>{
  const m=/^(\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d))\s?(.*)$/.exec(l);
  return m?{time:m[1],text:m[2].slice(0,2000),stream}:{time:'',text:l.slice(0,2000),stream};
 });
 const all=[...parse(stdout,'out'),...parse(stderr,'err')];
 return all.map((l,i)=>({...l,i})).sort((a,b)=>(a.time&&b.time?a.time.localeCompare(b.time):0)||a.i-b.i).map(({i,...l})=>({...l,level:level(l.text,l.stream)}));
}
function level(text,stream){
 if(/\b(?:FATAL|PANIC|CRIT(?:ICAL)?|EMERG)\b|level=(?:fatal|panic)|"level":"(?:fatal|panic)"/i.test(text))return 'fatal';
 if(/\b(?:ERROR|ERR|Exception|Traceback)\b|level=error|"level":"error"|\bE\d{4}\b/i.test(text))return 'error';
 if(/\bWARN(?:ING)?\b|level=warn|"level":"warn/i.test(text))return 'warn';
 if(/\bDEBUG|TRACE\b|level=debug|"level":"debug"/i.test(text))return 'debug';
 return stream==='err'?'err':'info';
}

// Exit codes worth explaining without a model.
function exitMeaning(code,oom){
 if(oom)return 'процесс убит из-за нехватки памяти (OOMKilled)';
 const known={0:'процесс завершился сам, без ошибки',1:'приложение завершилось с ошибкой',2:'ошибка запуска или неверные аргументы',125:'Docker не смог запустить контейнер',126:'команда запуска не исполняемая',127:'команда запуска не найдена в образе',134:'процесс аварийно прерван (SIGABRT)',137:'процесс убит (SIGKILL): нехватка памяти или принудительная остановка',139:'ошибка сегментации (SIGSEGV)',143:'процесс остановлен сигналом SIGTERM (обычная остановка)'};
 if(code===null||code===undefined)return '';
 return known[code]||(code>128?'процесс завершён сигналом '+(code-128):'приложение завершилось с кодом '+code);
}
module.exports={create,ports,memory,container,image,composeProject,df,mergeLogs,level,exitMeaning,label,ID,NAME};
