// «Docker»: containers, compose projects, images, volumes, logs and «почему контейнер падает» through the local
// docker CLI (cli.cjs: no shell, timeouts). A chat turn only reads; start/stop/restart, compose up/down and removing
// dangling images run from the card after the user pressed the confirming button (ipc below), each target re-checked
// against the engine first. Petya never execs into containers and never runs commands the user typed.
const kit=require('../app-kit.cjs');
const CLI=require('./cli.cjs');
const Engine=require('./engine.cjs');
const ID='docker',BY='Docker',NOTICE='docker-operation';

const deps={cli:null,engine:null};
function engine(){
 if(!deps.engine){deps.cli=deps.cli||CLI.create();deps.engine=Engine.create(deps.cli);}
 return deps.engine;
}
const state={busy:null,operation:null,names:new Set()};

// --- Routing -------------------------------------------------------------------------------------------------
const DOCKER=/(?:^|[^\p{L}])(?:docker|докер\p{L}*|compose|компоуз\p{L}*|docker-compose)(?=$|[^\p{L}])/iu;
const CONTAINER=/контейнер\p{L}*|(?:^|[^\p{L}])container\p{L}*/iu;
// Well-known services people run in Docker: «перезапусти redis» needs no word «докер».
const SERVICES=/(?:^|[^\p{L}])(?:redis|редис\p{L}*|postgres(?:ql)?|постгрес\p{L}*|постгре\p{L}*|mysql|mariadb|mongo(?:db)?|монго\p{L}*|nginx|kafka|кафк\p{L}*|rabbitmq|rabbit|elasticsearch|elastic|clickhouse|кликхаус\p{L}*|minio|memcached|zookeeper|localstack|keycloak)(?=$|[^\p{L}])/iu;
const ALIAS={'редис':'redis','постгрес':'postgres','постгре':'postgres','монго':'mongo','кафк':'kafka','кликхаус':'clickhouse'};
const LOGS=/(?:^|[^\p{L}])(?:лог(?:и|ов|ам|ах|а)?|logs?|вывод)(?=$|[^\p{L}])/iu;
const CRASH=/почему[^.?!]{0,40}(?:пада\p{L}*|упал\p{L}*|падёт|перезапуска\p{L}*|рестарт\p{L}*|умира\p{L}*|умер\p{L}*|вылета\p{L}*|останавлива\p{L}*|не (?:запуска|стартует|поднимается|работает)\p{L}*)|(?:пада\p{L}*|упал\p{L}*|крашит\p{L}*|рестартится|перезапускается)[^.?!]{0,20}контейнер|exit ?code|код(?:ом)? выхода|oom ?kill\p{L}*/iu;
const ACTION=/(?:^|[^\p{L}])(?:перезапусти\p{L}*|перезагрузи\p{L}*|рестартани|рестартни|рестарт|restart|останови\p{L}*|стопни|выключи|stop|запусти\p{L}*|стартани|включи|start|подними|поднять|up|опусти|положи|down)(?=$|[^\p{L}])/iu;
const DISK=/(?:сколько|много)[^.?!]{0,20}(?:мест\p{L}*|занима\p{L}*|весит|весят)|мест\p{L}*[^.?!]{0,20}(?:занима\p{L}*|съел\p{L}*)|висяч\p{L}*|dangling|prune|почист\p{L}*|очист\p{L}*|освобод\p{L}*|мусор\p{L}*/iu;
const OVERVIEW=/(?:что|какие|какой|кто)[^.?!]{0,20}(?:запущен\p{L}*|работа\p{L}*|крутит\p{L}*|поднят\p{L}*)|(?:список|статус|состояние|покажи|выведи|какие)[^.?!]{0,25}(?:контейнер\p{L}*|образ\p{L}*|том\p{L}*|volume\p{L}*|compose|докер\p{L}*|docker)|(?:контейнер\p{L}*|образ\p{L}*|images?|volumes?|тома)(?:[^.?!]{0,15}(?:докер\p{L}*|docker))|(?:^|[^\p{L}])(?:docker|докер\p{L}*)\s*(?:ps|images|compose ls)?\s*\??$/iu;
// Neighbours: a Docker image for Python is the Python app; a UI container in Unity; writing a Dockerfile is coding;
// «что такое докер» is a plain question.
const AVOID=/python|питон|unity|юнити|(?:^|[^\p{L}])ui(?=$|[^\p{L}])|uxml|вёрстк|верстк|css|flex|div|dockerfile|докерфайл|(?:напиши|составь|создай|сделай)[^.?!]{0,20}(?:образ|compose|docker-compose|контейнер)|как (?:установить|поставить|настроить|написать|работает)|что такое|зачем нуж|(?:образ|image)\p{L}* (?:для|с) /iu;

function kind(text){
 const t=String(text||'');
 if(AVOID.test(t))return null;
 const docker=DOCKER.test(t),box=CONTAINER.test(t),known=SERVICES.test(t)||[...state.names].some(n=>n.length>2&&new RegExp('(?:^|[^\\p{L}\\d_-])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\d_-])','iu').test(t));
 if(!docker&&!box&&!known)return null;
 if(CRASH.test(t)&&(docker||box||known))return 'crash';
 if(LOGS.test(t)&&(docker||box||known))return 'logs';
 if(DISK.test(t)&&(docker||/образ|image/iu.test(t)))return 'disk';
 if(ACTION.test(t)&&(docker||box||known)){
  if(/compose|компоуз|проект/iu.test(t)||/(?:^|[^\p{L}])(?:up|down|подними|поднять|опусти|положи)(?=$|[^\p{L}])/iu.test(t))return 'compose';
  return 'action';
 }
 if(docker&&(OVERVIEW.test(t)||/(?:^|[^\p{L}])(?:в|у|по) (?:докер\p{L}*|docker)/iu.test(t)))return 'overview';
 if(box&&OVERVIEW.test(t))return 'overview';
 return null;
}

// Names the user may mean: latin identifiers and known Russian spellings, without the words of the request.
const STOP=new Set(['docker','compose','container','containers','logs','log','up','down','start','stop','restart','grep','tail','since','ps','images','image','exit','code','oom','oomkilled','the','in','json','kill','killed','prune','dangling','errors','error','docker-compose']);
function wantedNames(text){
 const t=String(text||'');
 const quoted=[...t.matchAll(/[«"'`]([A-Za-z0-9][A-Za-z0-9_.-]*)[»"'`]/g)].map(m=>m[1].toLowerCase());
 const latin=(t.match(/[A-Za-z0-9][A-Za-z0-9_.-]*/g)||[]).map(w=>w.toLowerCase().replace(/[.-]+$/,'')).filter(w=>!STOP.has(w)&&!/^\d+$/.test(w)&&w.length>1);
 const ru=[];for(const [k,v] of Object.entries(ALIAS))if(new RegExp(k,'iu').test(t))ru.push(v);
 return [...new Set([...quoted,...latin,...ru])];
}
// Best container for the words: exact name, compose service, a name segment («shop-api-1» for «api»), a substring.
function match(list,words){
 for(const rank of [
  (c,w)=>c.name.toLowerCase()===w||c.id.startsWith(w)&&w.length>=6,
  (c,w)=>c.service.toLowerCase()===w,
  (c,w)=>c.name.toLowerCase().split(/[-_.]/).includes(w),
  (c,w)=>c.name.toLowerCase().includes(w)||c.image.toLowerCase().split(/[/:]/).includes(w)]){
  for(const w of words){const found=list.filter(c=>rank(c,w));if(found.length)return {word:w,found};}
 }
 return {word:words[0]||'',found:[]};
}

function logOptions(text){
 const t=String(text||'');
 const n=/(?:последни\p{L}*|tail|хвост)\s+(\d{1,4})|(\d{1,4})\s+(?:строк|lines)/iu.exec(t);
 const tail=Math.max(10,Math.min(2000,Number(n?.[1]||n?.[2])||200));
 let since='';
 const p=/за\s+(?:последни\p{L}*\s+)?(\d{1,3})?\s*(минут\p{L}*|мин|час\p{L}*|ч|сут\p{L}*|дн\p{L}*|день|недел\p{L}*)/iu.exec(t);
 if(p){const k=Number(p[1])||1,u=p[2].toLowerCase();since=/^мин/.test(u)?k+'m':/^ч|^час/.test(u)?k+'h':/^недел/.test(u)?(k*168)+'h':(k*24)+'h';}
 else if(/сегодня/iu.test(t))since='24h';
 const g=/(?:grep|со словом|с текстом|где есть|содержащ\p{L}*|с фразой|ищи|найди)\s*[«"'`]([^»"'`\n]{1,80})[»"'`]|grep\s+(\S{1,80})/iu.exec(t);
 const grep=(g?.[1]||g?.[2]||'').trim();
 const errors=/(?:только|одни|с)\s+ошибк\p{L}*|ошибки в лог|errors? only/iu.test(t);
 return {tail,since,grep,errors};
}

// --- Notifications ----------------------------------------------------------------------------------------------
function publish(s,item){
 state.operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',state.operation);}catch{/* window closing */}
}
async function operation(s,label,work){
 if(state.busy)throw Error('Docker уже выполняет: '+state.busy+'. Дождитесь окончания.');
 const id=Date.now().toString(36);
 state.busy=label;publish(s,{text:label+'…',busy:true,kind:'info',version:'running:'+id});
 try{const r=await work();publish(s,{text:r.notice||label+' — готово',busy:false,kind:'success',version:'done:'+id});return r;}
 catch(e){publish(s,{text:label+': '+problem(e),busy:false,kind:'error',version:'error:'+id});throw Error(problem(e));}
 finally{state.busy=null;}
}

// --- Failures ---------------------------------------------------------------------------------------------------
const INSTALL='Для приложения «Docker» нужен Docker Desktop (macOS, Windows) или Docker Engine (Linux). Петя ничего не скачивает сам: он работает через установленную команду docker.';
function problem(e){
 if(e?.kind==='missing')return 'Docker не установлен. '+INSTALL;
 if(e?.kind==='stopped')return 'Docker не запущен. Запустите Docker Desktop и повторите.';
 if(e?.kind==='denied')return 'Нет доступа к Docker: добавьте пользователя в группу docker или запустите Docker Desktop.';
 if(e?.kind==='timeout')return 'Docker не ответил вовремя. Возможно, он ещё запускается или перегружен.';
 return e?.message||String(e);
}
function failed(s,command,e,retry){
 if(e?.kind==='stopped'){
  // The engine is down: a clarification that resumes the same request once Docker Desktop is started.
  return require('../../input-required.cjs').ask({text:'Docker не запущен. Запустите Docker Desktop и нажмите «Проверить снова» — продолжу с этим же запросом.',label:'Docker',options:['Проверить снова']},()=>retry());
 }
 if(e?.kind==='missing')return kit.reply(s,command,{by:BY,text:'Docker не найден на этом компьютере. '+INSTALL+' Установите Docker Desktop с docker.com, запустите его и повторите запрос.',data:{dockerContainers:{mode:'missing'}}});
 if(e?.kind==='denied'||e?.kind==='timeout')return kit.reply(s,command,{by:BY,error:true,text:problem(e)});
 return kit.reply(s,command,{by:BY,error:true,text:'Docker · '+problem(e)});
}
function remember(list){for(const c of list){state.names.add(c.name.toLowerCase());if(c.service)state.names.add(c.service.toLowerCase());}while(state.names.size>200)state.names.delete(state.names.values().next().value);}

// --- Turns ------------------------------------------------------------------------------------------------------
const H=CLI.human;
function overviewText(o){
 const run=o.containers.filter(c=>c.state==='running'),bad=o.containers.filter(c=>c.state==='restarting'||c.state==='exited'&&c.exitCode&&c.exitCode!==0&&c.exitCode!==143);
 const parts=[];
 if(!o.containers.length)parts.push('Контейнеров нет.');
 else parts.push('Запущено '+run.length+' из '+o.containers.length+' '+kit.plural(o.containers.length,['контейнера','контейнеров','контейнеров'])+'.');
 if(o.compose?.length)parts.push('Compose: '+o.compose.slice(0,4).map(p=>p.name+' ('+(p.running?p.running+' запущено':'остановлен')+')').join(', ')+'.');
 if(bad.length)parts.push('С проблемами: '+bad.slice(0,4).map(c=>c.name+(c.state==='restarting'?' (перезапускается)':' (код '+c.exitCode+')')).join(', ')+'.');
 const dangling=(o.images||[]).filter(i=>i.dangling);
 if(dangling.length)parts.push('Висячих образов: '+dangling.length+' ('+H(dangling.reduce((a,i)=>a+i.size,0))+').');
 return parts.join(' ');
}
async function overviewTurn(s,command){
 s.requestProgress?.report?.('Смотрю контейнеры Docker');
 try{
  const o=await engine().overview();remember(o.containers);
  return kit.reply(s,command,{by:BY,text:overviewText(o),data:{dockerContainers:{mode:'list',at:Date.now(),...o}}});
 }catch(e){return failed(s,command,e,()=>overviewTurn(s,command));}
}

async function pick(s,command,words,{what='контейнер'}={}){
 const {containers:list}=await engine().containers({stats:false});remember(list);
 const {word,found}=match(list,words);
 if(found.length===1)return found[0];
 if(found.length>1)return require('../../input-required.cjs').ask({text:'Под «'+word+'» подходит несколько контейнеров. Какой '+what+'?',label:'Контейнер',options:found.slice(0,6).map(c=>c.name)},answer=>turn(s,command.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),String(answer).trim())));
 if(!list.length)return kit.reply(s,command,{by:BY,text:'Контейнеров в Docker нет.'});
 return require('../../input-required.cjs').ask({text:(words.length?'Контейнер «'+words[0]+'» не нашёл. ':'')+'Какой контейнер?',label:'Контейнер',options:list.slice(0,6).map(c=>c.name)},answer=>turn(s,command+' '+String(answer).trim()));
}

async function logsTurn(s,command){
 try{
  const c=await pick(s,command,wantedNames(command));
  if(c?.handled)return c;
  const o=logOptions(command);
  s.requestProgress?.report?.('Читаю логи '+c.name);
  const raw=await engine().logs(c.id,{tail:o.grep||o.errors?Math.min(5000,o.tail*10):o.tail,since:o.since});
  const needle=o.grep.toLowerCase();
  const lines=raw.filter(l=>(!needle||l.text.toLowerCase().includes(needle))&&(!o.errors||['error','fatal'].includes(l.level))).slice(-o.tail);
  const errors=lines.filter(l=>l.level==='error'||l.level==='fatal').length;
  const text=(lines.length?'Логи '+c.name+': '+lines.length+' '+kit.plural(lines.length,['строка','строки','строк'])+(errors?', ошибок: '+errors:'')+'.':'В логах '+c.name+' ничего'+(o.grep?' со словом «'+o.grep+'»':'')+(o.since?' за этот период':'')+' нет.')+(c.state!=='running'?' Контейнер сейчас не запущен ('+c.status+').':'');
  return kit.reply(s,command,{by:BY,text,data:{dockerLogs:{container:{id:c.id,name:c.name,state:c.state,status:c.status,image:c.image},tail:o.tail,since:o.since,grep:o.grep,errors:o.errors,lines,at:Date.now()}}});
 }catch(e){if(e?.name==='InputRequired')throw e;return failed(s,command,e,()=>logsTurn(s,command));}
}

const EXPLAIN={type:'object',properties:{cause:{type:'string'},explanation:{type:'string'},evidence:{type:'array',items:{type:'string'},maxItems:4},steps:{type:'array',items:{type:'string'},maxItems:4}},required:['cause','explanation','evidence','steps']};
function factsText(f){
 const out=[];
 if(f.running&&!f.restarting)out.push('Сейчас работает');
 if(f.restarting)out.push('Сейчас перезапускается');
 if(f.exitCode!==null&&!f.running)out.push('код выхода '+f.exitCode+(Engine.exitMeaning(f.exitCode,f.oomKilled)?' — '+Engine.exitMeaning(f.exitCode,f.oomKilled):''));
 if(f.oomKilled)out.push('OOMKilled: да'+(f.memoryLimit?' (лимит памяти '+CLI.memory(f.memoryLimit)+')':''));
 if(f.restartCount)out.push('перезапусков: '+f.restartCount+(f.restartPolicy?' (политика '+f.restartPolicy+')':''));
 if(f.health)out.push('health-check: '+f.health);
 if(f.error)out.push('ошибка Docker: '+f.error);
 return out;
}
async function crashTurn(s,command){
 try{
  const c=await pick(s,command,wantedNames(command));
  if(c?.handled)return c;
  s.requestProgress?.report?.('Смотрю, почему падает '+c.name);
  const f=await engine().crash(c.id);
  const lastErrors=f.lines.filter(l=>['error','fatal','err'].includes(l.level)).slice(-8);
  const facts=factsText(f);
  let explained=null;
  if(s.settings.model){
   s.requestProgress?.report?.('Объясняю причину по фактам');
   explained=await kit.modelJSON(s,{system:'Ты помогаешь понять, почему контейнер Docker падает или перезапускается. Опирайся только на факты из данных: код выхода, OOMKilled, число перезапусков, политику перезапуска, health-check и последние строки логов. Не выдумывай причин, которых нет в данных; если фактов мало — так и скажи. cause — причина одной фразой, explanation — 2–3 предложения, evidence — дословные строки из логов, на которые опираешься, steps — что проверить или сделать. По-русски.',
    user:{container:f.name,image:f.image,state:f.state,exitCode:f.exitCode,exitMeaning:Engine.exitMeaning(f.exitCode,f.oomKilled),oomKilled:f.oomKilled,memoryLimit:f.memoryLimit?CLI.memory(f.memoryLimit):'нет',restartCount:f.restartCount,restartPolicy:f.restartPolicy,health:f.health,healthLog:f.healthLog,dockerError:f.error,lastLogLines:f.lines.slice(-40).map(l=>l.text)},schema:EXPLAIN,predict:900}).catch(()=>null);
   // Quotes the model invented (not in the logs) are dropped rather than shown as evidence.
   if(explained)explained={cause:String(explained.cause||'').slice(0,300),explanation:String(explained.explanation||'').slice(0,900),
    evidence:(explained.evidence||[]).map(String).filter(q=>q.length>3&&f.lines.some(l=>l.text.includes(q.trim()))).slice(0,4),steps:(explained.steps||[]).map(x=>String(x).slice(0,240)).slice(0,4)};
  }
  const healthy=f.running&&!f.restarting&&!f.restartCount&&f.health!=='unhealthy';
  const fallback=f.oomKilled||f.exitCode?Engine.exitMeaning(f.exitCode,f.oomKilled):healthy?'Сейчас контейнер работает и не перезапускался.':'';
  const cause=explained?.cause||fallback||(lastErrors.length?'Последняя ошибка в логах: '+lastErrors.at(-1).text.slice(0,200):'Явной причины в данных Docker нет.');
  const text=f.name+': '+cause.replace(/\.$/,'')+'.'+(facts.length?' Факты: '+facts.join('; ')+'.':'')+(explained?.explanation?' '+explained.explanation:'');
  return kit.reply(s,command,{by:BY,text,data:{dockerCrash:{...f,facts,cause,explanation:explained?.explanation||'',evidence:explained?.evidence||[],steps:explained?.steps||[],explainedBy:explained?'model':'code',meaning:Engine.exitMeaning(f.exitCode,f.oomKilled),at:Date.now()}}});
 }catch(e){if(e?.name==='InputRequired')throw e;return failed(s,command,e,()=>crashTurn(s,command));}
}

// «перезапусти redis»: nothing runs from the chat; the card shows the row with the confirming button.
function verbOf(text){
 if(/перезапусти|перезагрузи|рестарт|restart/iu.test(text))return 'restart';
 if(/останови|стопни|выключи|(?:^|[^\p{L}])stop(?=$|[^\p{L}])/iu.test(text))return 'stop';
 return 'start';
}
const VERB={start:'Запустить',stop:'Остановить',restart:'Перезапустить'};
async function actionTurn(s,command){
 try{
  const c=await pick(s,command,wantedNames(command));
  if(c?.handled)return c;
  const verb=verbOf(command);
  const note=verb==='start'&&c.state==='running'?' Он уже запущен.':verb==='stop'&&c.state!=='running'?' Он уже остановлен.':'';
  return kit.reply(s,command,{by:BY,text:VERB[verb]+' контейнер '+c.name+'? Подтвердите в карточке — без нажатия ничего не делаю.'+note,
   data:{dockerContainers:{mode:'confirm',at:Date.now(),containers:[c],compose:null,images:null,volumes:null,pending:{type:'container',verb,target:c.id,name:c.name}}}});
 }catch(e){if(e?.name==='InputRequired')throw e;return failed(s,command,e,()=>actionTurn(s,command));}
}
async function composeTurn(s,command){
 try{
  const verb=/(?:^|[^\p{L}])(?:down|опусти|положи|останови\p{L}*|стопни|выключи)(?=$|[^\p{L}])/iu.test(command)?'down':'up';
  const o=await engine().overview();remember(o.containers);
  const projects=o.compose||[];
  if(!projects.length)return kit.reply(s,command,{by:BY,text:'Compose-проектов в Docker нет. Петя поднимает только проекты, которые Docker уже знает (docker compose ls).'});
  const words=wantedNames(command);
  const p=projects.find(x=>words.includes(x.name.toLowerCase()))||projects.find(x=>words.some(w=>x.name.toLowerCase().includes(w)))||(projects.length===1?projects[0]:null);
  if(!p)return require('../../input-required.cjs').ask({text:'Какой compose-проект '+(verb==='up'?'поднять':'остановить')+'?',label:'Compose-проект',options:projects.slice(0,6).map(x=>x.name)},answer=>composeTurn(s,command+' '+String(answer).trim()));
  const members=o.containers.filter(c=>c.project===p.name);
  return kit.reply(s,command,{by:BY,text:(verb==='up'?'Поднять':'Остановить и удалить контейнеры')+' compose-проекта '+p.name+'? Подтвердите в карточке.',
   data:{dockerContainers:{mode:'confirm',at:Date.now(),containers:members,compose:[p],images:null,volumes:null,pending:{type:'compose',verb,target:p.name,name:p.name}}}});
 }catch(e){if(e?.name==='InputRequired')throw e;return failed(s,command,e,()=>composeTurn(s,command));}
}
async function diskTurn(s,command){
 s.requestProgress?.report?.('Считаю, сколько места занимает Docker');
 try{
  const d=await engine().disk();
  const total=d.usage.reduce((a,u)=>a+u.size,0),free=d.usage.reduce((a,u)=>a+u.reclaimable,0);
  const name={images:'образы',containers:'контейнеры',volumes:'тома',cache:'кэш сборки'};
  const dangling=d.dangling.reduce((a,i)=>a+i.size,0);
  const text='Docker занимает '+H(total)+': '+d.usage.filter(u=>u.size).map(u=>name[u.type]+' '+H(u.size)).join(', ')+'.'+(free?' Можно освободить около '+H(free)+'.':'')+
   (d.dangling.length?' Висячих образов: '+d.dangling.length+' ('+H(dangling)+') — удалить можно в карточке после подтверждения.':' Висячих образов нет.');
  const prune=/висяч|dangling|prune|почист|очист|освобод|мусор|удали/iu.test(command)&&d.dangling.length>0;
  return kit.reply(s,command,{by:BY,text,data:{dockerDisk:{...d,total,reclaimable:free,confirmPrune:prune,at:Date.now()}}});
 }catch(e){return failed(s,command,e,()=>diskTurn(s,command));}
}

async function turn(s,command){
 const text=String(command||'');
 const k=kind(text);
 if(!k||!kit.installed(s,ID))return null;
 return {overview:overviewTurn,logs:logsTurn,crash:crashTurn,action:actionTurn,compose:composeTurn,disk:diskTurn}[k](s,text);
}

// --- Card and settings calls -------------------------------------------------------------------------------------
async function status(){
 const cli=deps.cli||(engine(),deps.cli);
 const file=cli.binary();
 if(!file)return {installed:false,running:false,text:'Docker не найден. '+INSTALL};
 let client='',server='',context='';
 try{client=(await cli.run(['--version'],{timeout:8000})).stdout.trim();}catch{/* old CLI */}
 try{context=(await cli.run(['context','show'],{timeout:8000})).stdout.trim();}catch{/* no contexts */}
 try{const v=JSON.parse((await cli.run(['version','--format','json'],{timeout:10000})).stdout);server=String(v?.Server?.Version||'');}
 catch(e){return {installed:true,running:false,binary:file,client,context,text:problem(e)};}
 return {installed:true,running:true,binary:file,client,server,context,text:'Docker работает'+(server?' (движок '+server+')':'')+'.'};
}
function setup(s){
 return {ipc:{
  progress:()=>state.operation,
  status,
  async overview(){const o=await engine().overview().catch(e=>{throw Error(problem(e));});remember(o.containers);return {mode:'list',at:Date.now(),...o};},
  async disk(){const d=await engine().disk().catch(e=>{throw Error(problem(e));});return {...d,total:d.usage.reduce((a,u)=>a+u.size,0),reclaimable:d.usage.reduce((a,u)=>a+u.reclaimable,0),at:Date.now()};},
  async logs(target,options={}){
   const o={tail:Math.max(10,Math.min(2000,Number(options.tail)||200)),since:typeof options.since==='string'?options.since:''};
   return {lines:await engine().logs(String(target),o).catch(e=>{throw Error(problem(e));}),tail:o.tail,at:Date.now()};
  },
  // The card calls these only from the confirming button the user pressed.
  async container(verb,target){
   return operation(s,(VERB[verb]||'Действие')+' контейнер',async()=>{const r=await engine().containerAction(verb,target);return {...r,notice:r.container.name+': '+r.container.status};});
  },
  async compose(verb,name){
   return operation(s,(verb==='up'?'Поднимаю':'Останавливаю')+' compose-проект '+name,async()=>{const r=await engine().compose(verb,name);return {...r,notice:'Compose '+name+': '+(r.project.status||'остановлен')};});
  },
  async removeDangling(ids){
   return operation(s,'Удаляю висячие образы',async()=>{const r=await engine().removeDangling(ids);return {...r,notice:'Удалено образов: '+r.removed.length+' · освобождено '+H(r.freed)+(r.failed.length?' · не удалось: '+r.failed.length:'')};});
  }
 }};
}
module.exports={name:'dockerApp',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,wantedNames,match,logOptions,overviewText,state,deps,problem};
