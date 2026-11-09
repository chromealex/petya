// «Мониторинг»: are the servers and services alive — one chat card from every monitor source
// (src/features/monitor-sources.cjs): Prometheus, Alertmanager, Grafana alerting and Petya's own uptime checks.
//  - «что с серверами», «всё ли живое»: a health board (status, since, sparklines of error rate / p95 latency / RPS),
//    the alerts firing now, incidents of the week, uptime per check with a 30-day strip and TLS expiry warnings;
//  - «какие алерты горят», «аптайм за неделю», «инциденты за неделю», «почему лежит api» (the facts about one service);
//  - «заглуши алерт на час»: a card with the exact matchers and duration; the Alertmanager silence is created only
//    when the user presses «Заглушить» there;
//  - «найди все адреса серваков в проекте», «какие сервера использует игра»: endpoint discovery in the project's
//    files (discover.cjs), and «Следить за выбранными» proposes uptime checks that are added only after confirmation.
// Everything shown is computed by code; the model only maps a free-text question to a known service / signal.
// Background state-change notifications (watch.cjs) are off until the user turns them on.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const kit=require('../app-kit.cjs');
const Q=require('./query.cjs');
const U=require('./uptime.cjs');
const H=require('./http.cjs');
const P=require('./promql.cjs');
const D=require('./discover.cjs');
const Store=require('./store.cjs');
const Watch=require('./watch.cjs');
const M=require('../../features/monitor-sources.cjs');
const ID='monitoring',BY='Мониторинг';
const DAY=86400000,MIN=60000;

const registry=s=>s.monitorSources||M.create(s);
const store=s=>Store.open(s);
const tr=text=>{try{return require('../../interface-language.cjs').t(text);}catch{return text;}};
const ago=ms=>{const m=Math.max(1,Math.round(ms/MIN));return m<60?m+' мин':m<1440?Math.round(m/60)+' ч':Math.round(m/1440)+' дн';};
const pct=v=>v==null?'—':(Math.floor(v*10000)/100).toLocaleString('ru-RU')+'%';
const num=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1});

// Whether «Логи сервера» can take «логи сервиса X за последний час»: added → ask it; only offered → the shared offer.
function logsApp(s){
 if(kit.installed(s,'logs'))return 'installed';
 try{return fs.existsSync(path.join(__dirname,'..','logs','offer.cjs'))?'offer':'';}catch{return '';}
}
const canTrack=s=>{try{return (s.appLinks||require('../../features/app-links.cjs').create(s)).available('task-tracker').length>0;}catch{return false;}};

// --- Connect question -------------------------------------------------------------------------------------------
function connectQuestion(s,command,intent){
 const text=intent==='uptime'?'Проверок доступности пока нет. Добавьте адреса (https://…/health) в настройках «Мониторинга» — или скажите «найди адреса серверов в проекте», и я предложу, что проверять.':
  'Мониторингу пока неоткуда брать данные: укажите адрес Prometheus, Alertmanager или Grafana в настройках «Мониторинга» или добавьте свои проверки доступности. Можно начать с «найди адреса серверов в проекте».';
 return kit.reply(s,command,{by:BY,question:true,text});
}

// --- Service from free text: code first, then (optionally) the model, restricted to known names ----------------
async function serviceFor(s,text,names,aliases){
 const found=M.findService(text,names,aliases);
 if(found||!names.length||!s.settings.model)return found;
 try{
  const r=await kit.modelJSON(s,{system:'Пользователь спрашивает о сервисах. Выбери из списка один сервис, о котором вопрос, или пустую строку, если ни один не подходит. Не придумывай.',
   user:{question:text,services:names.slice(0,40)},schema:{type:'object',properties:{service:{type:'string',enum:[...names.slice(0,40),'']}},required:['service']},predict:60,temperature:0});
  return names.includes(r?.service)?r.service:'';
 }catch{return '';}
}

// --- Board ---------------------------------------------------------------------------------------------------------
function uptimeRows(s,now,{days=30,from}={}){
 const st=store(s);
 return st.checks().map(c=>{const x=U.stats(st,c,{now,days,from});const cur=U.status(st,c);return {id:c.id,name:c.name,url:c.url,service:c.service,enabled:c.enabled!==false,status:cur.status,since:cur.since,
  percent:x.percent,probes:x.probes,strip:x.strip.map(d=>d.percent),last:x.last,tlsDays:x.tlsDays,latencyP95:x.latencyP95,failures:x.failures.length};});
}
function incidentsOf(snap,s,from,now){
 const out=[];
 for(const e of snap.history.filter(e=>Date.parse(e.from)>=from))out.push({service:e.service,title:e.title,from:e.from,to:e.to,kind:e.kind,status:e.status,source:e.source});
 for(const a of store(s).alertLog(from)){
  const fromIso=new Date(a.from).toISOString();
  if(out.some(e=>e.service===a.service&&e.title===a.name&&Math.abs(Date.parse(e.from)-a.from)<10*MIN))continue;
  out.push({service:a.service,title:a.name,from:fromIso,to:a.resolved?new Date(a.resolved).toISOString():null,kind:'alert',status:a.severity==='critical'?'critical':'warn',source:a.source});
 }
 return out.map(e=>({...e,ms:(e.to?Date.parse(e.to):now)-Date.parse(e.from)})).sort((a,b)=>b.from.localeCompare(a.from)).slice(0,25);
}
const slimSeries=list=>{const out={};for(const [k,v] of Object.entries(list||{}))out[k]=v.length>48?v.filter((_,i)=>i%Math.ceil(v.length/48)===0||i===v.length-1):v;return out;};

function summary(card,intent){
 const down=card.services.filter(x=>x.status==='critical'),warn=card.services.filter(x=>x.status==='warn');
 const firing=card.alerts.filter(a=>!a.silenced&&a.state==='firing');
 if(intent==='why'&&card.focus){
  const f=card.focus;
  if(!f.found)return 'Не нашёл сервис «'+f.service+'» ни в одном источнике.';
  const head='«'+f.service+'»: '+({critical:'не работает',warn:'есть проблемы',ok:'по данным мониторинга работает',unknown:'состояние неизвестно'})[f.status]+(f.since&&f.status!=='ok'?' уже '+ago(card.now-Date.parse(f.since)):'')+'.';
  return head+(f.reasons.length?' '+f.reasons.slice(0,4).join(' '):'');
 }
 if(intent==='alerts')return firing.length?'Горят '+firing.length+' '+kit.plural(firing.length,['алерт','алерта','алертов'])+(firing.filter(a=>a.severity==='critical').length?', из них критичных — '+firing.filter(a=>a.severity==='critical').length:'')+'. Самый старый — «'+[...firing].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)))[0].name+'».'+(card.alerts.length>firing.length?' Заглушено или ждёт: '+(card.alerts.length-firing.length)+'.':''):'Алертов сейчас нет.'+(card.alerts.length?' Заглушённых или ожидающих: '+card.alerts.length+'.':'');
 if(intent==='uptime'){
  const rows=card.uptime.filter(u=>u.periodPercent!=null);
  if(!rows.length)return 'Данных проверок доступности '+card.period.label+' ещё нет.';
  const worst=[...rows].sort((a,b)=>a.periodPercent-b.periodPercent)[0];
  return 'Аптайм '+card.period.label+': '+rows.map(u=>u.name+' — '+pct(u.periodPercent)).slice(0,5).join(', ')+'.'+(worst.periodPercent<1?' Хуже всех — '+worst.name+'.':'');
 }
 if(intent==='incidents')return card.incidents.length?card.incidents.length+' '+kit.plural(card.incidents.length,['инцидент','инцидента','инцидентов'])+' '+card.period.label+'; последний — «'+card.incidents[0].title+'»'+(card.incidents[0].service?' ('+card.incidents[0].service+')':'')+'.':'Инцидентов '+card.period.label+' не было.';
 if(!card.services.length&&!card.alerts.length)return 'Источники ответили, но сервисов в них не видно.';
 const parts=[];
 parts.push(down.length?'Не работает: '+down.map(x=>x.name).slice(0,4).join(', ')+'.':warn.length?'Всё отвечает, но есть проблемы.':'Всё живо: '+card.services.length+' '+kit.plural(card.services.length,['сервис','сервиса','сервисов'])+' в норме.');
 if(warn.length)parts.push('С предупреждением: '+warn.map(x=>x.name).slice(0,4).join(', ')+'.');
 if(firing.length)parts.push('Алертов горит: '+firing.length+'.');
 if(card.tls.length)parts.push('Сертификат скоро истекает: '+card.tls.map(t=>t.name+' ('+t.days+' дн.)').join(', ')+'.');
 return parts.join(' ');
}

async function boardTurn(s,command,intent,now=Date.now()){
 const reg=registry(s);
 const per=Q.period(command,now,Q.DEFAULT_PERIOD[intent]||Q.DEFAULT_PERIOD.overview);
 const named=reg.named(command);
 s.requestProgress?.report('Смотрю мониторинг: '+reg.list().map(x=>x.name).join(', '));
 const aliases=reg.aliases();
 // «почему лежит api»: the service first (to ask the sources about it only).
 let focusName='';
 if(intent==='why'){
  const first=await reg.snapshot({now,from:now-HOUR6,to:now,light:true},{only:named.length?named:undefined});
  focusName=await serviceFor(s,command,[...new Set([...first.services.map(x=>x.name),...first.alerts.map(a=>a.service).filter(Boolean)])],aliases);
  if(!focusName){
   const said=(/(?:почему|что с|что случилось с)\s+(?:лежит|упал\p{L}*|тормозит|не работает|недоступ\p{L}*)?\s*([a-zа-я0-9._-]{2,40})/iu.exec(command)||[])[1]||'';
   if(said&&!/^(?:сервер\p{L}*|сервис\p{L}*|прод\p{L}*|всё|все)$/iu.test(said))focusName=said.toLowerCase();
  }
 }
 const snap=await reg.snapshot({now,from:per.from,to:per.to,service:intent==='why'&&focusName?focusName:''},{only:named.length?named:undefined});
 if(snap.sources.length&&snap.sources.every(x=>x.error))return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+snap.sources.map(x=>(snap.sources.length>1?x.name+': ':'')+x.error).join(' ')});
 store(s).logAlerts(snap.alerts);store(s).save();
 const weekFrom=intent==='incidents'?per.from:now-7*DAY;
 let incidents=incidentsOf(snap,s,weekFrom,now);
 if(intent!=='incidents'&&per.from>weekFrom){
  // The board's incidents cover the week even when the board shows six hours.
  try{const hist=await reg.snapshot({now,from:weekFrom,to:now,light:true},{only:reg.list().filter(x=>x.has.includes('history')).map(x=>x.id)});incidents=incidentsOf({history:hist.history},s,weekFrom,now);}catch{/* the shorter list stays */}
 }
 const uptime=uptimeRows(s,now).map(u=>{const x=U.stats(store(s),{id:u.id},{now,from:per.from});return {...u,periodPercent:intent==='uptime'?x.percent:u.percent};});
 const tls=uptime.filter(u=>u.tlsDays!=null&&u.tlsDays<21).map(u=>({name:u.name,url:u.url,days:u.tlsDays}));
 const card={mode:intent,now,period:{label:per.label,from:new Date(per.from).toISOString(),to:new Date(per.to).toISOString()},
  sources:snap.sources,services:snap.services.slice(0,30).map(x=>({...x,series:slimSeries(x.series)})),alerts:snap.alerts.slice(0,40),incidents,uptime,tls,
  logs:logsApp(s),tracker:canTrack(s),canSilence:reg.list().some(x=>x.canSilence)};
 if(intent==='why'){
  const svc=snap.services.find(x=>x.name===focusName);
  const alerts=snap.alerts.filter(a=>a.service===focusName);
  const checks=uptime.filter(u=>u.service===focusName);
  const reasons=[];
  if(svc?.note)reasons.push(svc.note+'.');
  for(const a of alerts.filter(a=>!a.silenced).slice(0,3))reasons.push('Алерт «'+a.name+'» ('+a.severity+')'+(a.annotations.summary?': '+a.annotations.summary:'')+'.');
  const th={...P.THRESHOLDS,...(store(s).services()[focusName]?.thresholds||{})};
  if(svc){
   if(svc.signals.errorRate!=null&&svc.signals.errorRate>=th.errorRate[0])reasons.push('Ошибок: '+pct(svc.signals.errorRate)+' запросов.');
   if(svc.signals.latencyP95!=null&&svc.signals.latencyP95>=th.latencyP95[0])reasons.push('p95 задержки: '+Number(svc.signals.latencyP95).toLocaleString('ru-RU',{maximumFractionDigits:2})+' с.');
   if(svc.signals.saturation!=null&&svc.signals.saturation>=th.saturation[0])reasons.push('Загрузка: '+pct(svc.signals.saturation)+'.');
   if(svc.signals.rps!=null&&svc.series.rps?.length>4){const first=svc.series.rps[0][1],last=svc.signals.rps;if(first>0&&last<first*0.3)reasons.push('Трафик упал с '+num(first)+' до '+num(last)+' запросов/с.');}
  }
  for(const c of checks.filter(c=>c.last&&!c.last.ok))reasons.push('Проверка «'+c.name+'»: '+(c.last.error||'не отвечает')+'.');
  const recent=incidents.filter(e=>e.service===focusName).slice(0,2);
  if(recent.length&&!reasons.length)reasons.push('За неделю было '+recent.length+' '+kit.plural(recent.length,['падение','падения','падений'])+'.');
  card.focus={service:focusName||'?',found:!!(svc||alerts.length||checks.length),status:svc?.status||(alerts.length?'warn':'unknown'),since:svc?.since||alerts[0]?.startsAt||null,reasons};
  if(!focusName)return kit.reply(s,command,{by:BY,question:true,text:'О каком сервисе речь? '+(snap.services.length?'Вижу: '+snap.services.slice(0,8).map(x=>x.name).join(', ')+'.':'')});
 }
 const text=summary(card,intent);
 return kit.reply(s,command,{by:BY,text,data:{monitorCard:card}});
}
const HOUR6=6*3600000;

// --- Silence -----------------------------------------------------------------------------------------------------------
// The exact matchers of an alert: its name, the label that names its service, and the instance if it has one.
function matchersOf(a){
 const m=[{name:'alertname',value:a.labels.alertname||a.name,isRegex:false,isEqual:true}];
 const key=M.SERVICE_LABELS.find(k=>/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)&&a.labels[k]);
 if(key)m.push({name:key,value:a.labels[key],isRegex:false,isEqual:true});
 if(a.labels.instance&&key!=='instance')m.push({name:'instance',value:a.labels.instance,isRegex:false,isEqual:true});
 return m;
}
function ask(spec,resume){return require('../../input-required.cjs').ask(spec,resume);}
async function silenceTurn(s,command,now=Date.now()){
 const reg=registry(s);
 const silencer=reg.list().find(x=>x.canSilence);
 if(!silencer)return kit.reply(s,command,{by:BY,question:true,text:'Глушить алерты умеет только Alertmanager — укажите его адрес в настройках «Мониторинга». Grafana и Prometheus Петя только читает.'});
 const alerts=(await reg.alerts(silencer.id,{now})).filter(a=>!a.silenced&&a.state==='firing');
 if(!alerts.length)return kit.reply(s,command,{by:BY,text:'В Alertmanager сейчас нечего глушить: горящих алертов нет.'});
 const aliases=reg.aliases();
 const lower=command.toLowerCase();
 let list=alerts.filter(a=>lower.includes(a.name.toLowerCase()));
 if(!list.length){const svc=M.findService(command,alerts.map(a=>a.service).filter(Boolean),aliases);if(svc)list=alerts.filter(a=>a.service===svc);}
 if(!list.length)list=alerts;
 const groups=[...new Map(list.map(a=>[a.name+'|'+a.service,a])).values()];
 if(groups.length>1){
  const options=groups.slice(0,6).map(a=>a.name+(a.service?' · '+a.service:''));
  return ask({text:'Какой алерт заглушить?',label:'Алерт',options},answer=>{const [name,svc]=String(answer).split(' · ');return silenceTurn(s,command+' — алерт '+name+(svc?' сервиса '+svc:''),Date.now());});
 }
 const dur=Q.duration(command,now);
 if(!dur)return ask({text:'На сколько заглушить «'+groups[0].name+'»?',label:'Длительность',options:['На 30 минут','На 1 час','На 4 часа','До утра']},answer=>silenceTurn(s,command+' '+String(answer).toLowerCase(),Date.now()));
 if(dur.ms<=0||dur.ms>7*DAY)return kit.reply(s,command,{by:BY,question:true,text:'Заглушить можно на срок от минуты до 7 дней. На сколько?'});
 const a=groups[0];
 const matchers=matchersOf(a);
 const affected=alerts.filter(x=>matchers.every(m=>(m.name==='alertname'?x.labels.alertname||x.name:x.labels[m.name])===m.value)).length;
 const draft={id:crypto.randomUUID(),source:silencer.id,sourceName:silencer.name,alert:{name:a.name,service:a.service,severity:a.severity,startsAt:a.startsAt},matchers,durationMs:dur.ms,label:dur.label,affected,created:null};
 return kit.reply(s,command,{by:BY,text:'Заглушу «'+a.name+'»'+(a.service?' ('+a.service+')':'')+' на '+dur.label+' — проверьте условия и нажмите «Заглушить».',data:{monitorSilence:draft}});
}

// --- Endpoint discovery -------------------------------------------------------------------------------------------------
function projectRoots(s){
 try{
  const state=s.dialogue.state,topic=s.dialogue.active();
  const project=state.projects?.find(p=>p.id===(topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId)).filter(r=>{try{return fs.statSync(r).isDirectory();}catch{return false;}});
 }catch{return [];}
}
// Optional: the local model names the environment of own hosts the code could not place (never adds addresses).
async function guessEnvs(s,addresses){
 const open=addresses.filter(a=>a.category==='own'&&!a.envs.length&&!a.partial).slice(0,20);
 if(!open.length||!s.settings.model)return;
 try{
  const r=await kit.modelJSON(s,{system:'Для каждого хоста скажи окружение по его имени: prod, staging, dev или unknown, если по имени не понять. Не угадывай.',user:{hosts:open.map(a=>a.host)},
   schema:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{host:{type:'string'},env:{type:'string',enum:['prod','staging','dev','unknown']}},required:['host','env']}}},required:['items']},predict:400,temperature:0});
  for(const it of r?.items||[]){if(it.env==='unknown')continue;for(const a of open.filter(a=>a.host===it.host)){a.envs=[it.env];a.envWhy=['модель по имени хоста'];a.envGuessed=true;}}
 }catch{/* names stay without an environment */}
}
const scans=new Map();
async function discoverTurn(s,command,{roots,publish=()=>{}}={}){
 roots=roots||projectRoots(s);
 if(!roots.length)return kit.reply(s,command,{by:BY,question:true,text:'У проекта нет папки на компьютере. Подключите папку проекта в его настройках — и я найду адреса серверов в коде и конфигах.'});
 const id=crypto.randomUUID(),nid='monitoring:discover';
 const note=(text,extra={})=>publish({id:nid,title:'Ищу адреса серверов',text,busy:true,version:'scan:'+id,kind:'info',...extra});
 note('Обхожу папки проекта…');
 s.requestProgress?.report('Ищу адреса серверов в проекте');
 let result;
 try{
  result=await D.scan(roots,{progress:p=>{if(p.stage==='read'&&p.total)note('Читаю файлы: '+p.done+' из '+p.total,{percent:Math.floor(100*p.done/Math.max(1,p.total))});else if(p.stage==='csharp')note('Разбираю C#-скрипты…');}});
 }catch(e){publish({id:nid,title:'Поиск адресов не удался',text:e.message,busy:false,version:'fail:'+id,kind:'error'});throw e;}
 await guessEnvs(s,result.addresses);
 const card={id,roots,addresses:result.addresses.map(a=>({...a,proposals:undefined})),counts:result.counts,healthPaths:result.healthPaths.slice(0,6),defines:result.defines,stats:result.stats};
 scans.set(id,card);if(scans.size>10)scans.delete(scans.keys().next().value);
 const n=result.addresses.length;
 publish({id:nid,title:'Адреса серверов найдены',text:n?n+' '+kit.plural(n,['адрес','адреса','адресов'])+' в '+result.stats.files+' '+kit.plural(result.stats.files,['файле','файлах','файлах']):'Адресов серверов не нашлось',busy:false,version:'done:'+id,kind:'info',percent:100});
 if(!n)return kit.reply(s,command,{by:BY,text:'В проекте ('+result.stats.files+' '+kit.plural(result.stats.files,['файл','файла','файлов'])+') адресов серверов не нашёл.',data:{monitorEndpoints:card}});
 const own=result.addresses.filter(a=>a.category==='own'),hosts=[...new Set(own.map(a=>a.host))];
 const text='Нашёл '+n+' '+kit.plural(n,['адрес','адреса','адресов'])+': свои серверы — '+hosts.length+' '+kit.plural(hosts.length,['хост','хоста','хостов'])+(hosts.length?' ('+hosts.slice(0,4).join(', ')+(hosts.length>4?' и др.':'')+')':'')+
  (result.counts.cdn?', CDN и хранилища — '+result.counts.cdn:'')+(result.counts.third?', сторонние SDK — '+result.counts.third:'')+'.'+(result.addresses.some(a=>a.partial)?' Часть адресов собирается в рантайме — они показаны с подстановками.':'');
 return kit.reply(s,command,{by:BY,text,data:{monitorEndpoints:card}});
}
function locateScan(s,id){
 if(scans.has(id))return scans.get(id);
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.monitorEndpoints?.id===id)return m.extensionData.monitorEndpoints;
 return null;
}
function locateSilence(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.monitorSilence?.id===id)return m.extensionData.monitorSilence;
 return null;
}

// --- Checks ----------------------------------------------------------------------------------------------------------
function saveCount(s){try{s.saveSettings?.({monitoringUptimeChecks:String(store(s).checks().length)},true);}catch{/* counted on the next save */}}
function addChecks(s,list){
 const st=store(s),have=new Set(st.checks().map(c=>c.url)),added=[];
 for(const raw of list){const c=U.validate(raw);if(have.has(c.url))continue;added.push(st.putCheck({...c,id:undefined}));have.add(c.url);}
 saveCount(s);
 return added;
}

// A service state change from the watch: its notification-center card (one per service, updated in place) and a
// system notification through the notification policy (docs/foundations/notifications-policy.md), tagged
// `monitoring` and urgent when the service went down, so focus sessions, quiet hours or a mute rule decide when it
// pops up — never whether the card is there.
function notice(s,{publish,electron=null}){
 return n=>{
  publish({id:n.id,title:n.title,text:n.text,busy:false,version:n.version,kind:n.kind,service:n.service});
  require('../../features/notification-policy.cjs').notify(s,{source:'monitoring',title:tr('Петя')+' · '+tr(n.title),body:tr(n.text),urgent:n.type==='down'},{electron});
 };
}

// --- Setup: ipc for the card and settings, the background watch ----------------------------------------------------------
function setup(s,{now=()=>Date.now(),electron=null}={}){
 const publish=item=>{try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);}catch{/* window closing */}};
 // Proxies: the app session's resolver (system proxy / PAC) when Electron is there.
 try{const {session}=electron||require('electron');if(session?.defaultSession?.resolveProxy)H.useSystemProxy(url=>session.defaultSession.resolveProxy(url));}catch{/* plain node: environment proxies */}
 const deliver=notice(s,{publish,electron});
 const watch=Watch.create(s,{store:store(s),registry:()=>registry(s),now,deliver});
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>watch.tick().catch(()=>{}),30000);timer.unref?.();timers.add(timer);}
 const installed=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Мониторинг» не добавлено.');};
 const pending=new Set();
 return {ipc:{
  status:()=>({added:kit.installed(s,ID),sources:registry(s).all(),checks:store(s).checks(),watch:s.settings.monitoringWatch==='true',services:store(s).services(),defaults:P.DEFAULTS,
   hasToken:{prometheus:!!s.settings.monitoringPrometheusToken,alertmanager:!!s.settings.monitoringAlertmanagerToken,grafana:!!s.settings.monitoringGrafanaToken}}),
  saveCheck:raw=>{installed();const c=U.validate(raw||{});const row=store(s).putCheck({...c,id:raw?.id||undefined});saveCount(s);return row;},
  removeCheck:id=>{installed();const r=store(s).removeCheck(String(id||''));saveCount(s);return r;},
  // «Проверить сейчас»: one probe of one saved check (a GET/HEAD, nothing else).
  testCheck:async id=>{installed();const c=store(s).check(String(id||''));if(!c)throw Error('Нет такой проверки.');const [r]=await U.run(store(s),{now,only:[c.id]});return r?.result||null;},
  saveService:(name,config)=>{installed();const n=String(name||'').trim().toLowerCase();if(!/^[\w.\-]{1,120}$/.test(n))throw Error('Имя сервиса: латиница, цифры, «.», «-», «_».');
   if(!config){store(s).putService(n,null);return null;}
   const t={};for(const k of P.SIGNALS)if(config.templates?.[k])t[k]=P.checkTemplate(config.templates[k]);
   const c={selector:P.checkSelector(config.selector||''),templates:t,window:/^\d{1,3}[smhd]$/.test(config.window||'')?config.window:undefined,thresholds:config.thresholds&&typeof config.thresholds==='object'?config.thresholds:undefined};
   store(s).putService(n,c);return c;},
  preview:(signal,name,config)=>P.render(signal,{name,...config}),
  notices:()=>store(s).notices().filter(n=>now()-Date.parse(n.at)<DAY),
  wipe:()=>{store(s).wipe();watch.tracker.restore({});return true;},
  tick:()=>watch.tick({force:true}),
  // The card's «Заглушить» — the only write; the draft holds the exact matchers and duration the user saw.
  silence:async draftId=>{
   installed();
   const d=locateSilence(s,String(draftId||''));if(!d)throw Error('Карточка устарела. Попросите заглушить ещё раз.');
   if(d.created)return {already:true,...d.created};
   if(d.unknown)throw Error('Не знаю, создалась ли тишина в прошлый раз. Проверьте Alertmanager, прежде чем глушить снова.');
   if(pending.has(d.id))throw Error('Уже глушу.');
   pending.add(d.id);
   const t=now();
   try{
    const r=await registry(s).silence(d.source,{matchers:d.matchers,startsAt:new Date(t).toISOString(),endsAt:new Date(t+d.durationMs).toISOString(),comment:'Petya: заглушено на '+d.label+' по просьбе в чате',createdBy:'Petya'});
    const src=require('./alertmanager-source.cjs');
    d.created={id:r.id,until:new Date(t+d.durationMs).toISOString(),url:d.source==='alertmanager'?src.silenceUrl(s.settings,r.id):''};
    s.dialogue.persist();
    return d.created;
   }catch(e){if(e.kind==='timeout'||e.kind==='reset'){d.unknown=true;s.dialogue.persist();}throw e;}
   finally{pending.delete(d.id);}
  },
  // Discovery card: open a source file (only inside the scanned project folders).
  openSource:(scanId,file)=>{
   const card=locateScan(s,String(scanId||''));if(!card)throw Error('Результат поиска устарел. Повторите поиск.');
   const rel=String(file||'');if(!rel||rel.includes('\0')||path.isAbsolute(rel))throw Error('Некорректный файл.');
   for(const root of card.roots){const full=path.resolve(root,rel);if(!full.startsWith(path.resolve(root)+path.sep))continue;if(fs.existsSync(full)){require('electron').shell.openPath(full);return true;}}
   throw Error('Файл не найден: '+rel);
  },
  // «Следить за выбранными»: proposals only — nothing is saved here.
  proposeChecks:(scanId,keys)=>{
   const card=locateScan(s,String(scanId||''));if(!card)throw Error('Результат поиска устарел. Повторите поиск.');
   const chosen=card.addresses.filter(a=>(keys||[]).includes(a.key));
   const have=new Set(store(s).checks().map(c=>c.url));
   return D.propose(chosen,card.healthPaths||[],card.addresses).map(p=>{let ok=true,error='';try{U.validate(p);}catch(e){ok=false;error=e.message;}return {...p,exists:have.has(new URL(p.url).href),ok,error};});
  },
  // The confirmation button under the proposals.
  addChecks:list=>{installed();if(!Array.isArray(list)||!list.length)throw Error('Нечего добавлять.');if(list.length>20)throw Error('Не больше 20 проверок за раз.');
   const added=addChecks(s,list.map(p=>({url:p.url,name:p.name,service:p.service,method:'GET',intervalMin:5})));return {added:added.length,checks:added};}
 }};
}

function validate(next){
 for(const k of ['monitoringPrometheusUrl','monitoringAlertmanagerUrl','monitoringGrafanaUrl'])if(next[k]!==undefined)next[k]=H.base(next[k]);
 if(next.monitoringWatch!==undefined&&!['true','false'].includes(String(next.monitoringWatch)))throw Error('Проверьте настройку уведомлений мониторинга.');
 if(next.monitoringWindow!==undefined&&next.monitoringWindow!==''&&!/^\d{1,3}[smhd]$/.test(String(next.monitoringWindow)))throw Error('Окно PromQL: число и s/m/h/d, например 5m.');
 if(next.monitoringPollMin!==undefined&&!(Number(next.monitoringPollMin)>=1&&Number(next.monitoringPollMin)<=30))throw Error('Опрос источников — от 1 до 30 минут.');
 if(String(next.monitoringAliases||'').length>1500)throw Error('Слишком много псевдонимов сервисов.');
}

async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!Q.about(text))return null;
 const intent=Q.intent(text);
 try{
  if(intent==='discover')return await discoverTurn(s,text,{publish:item=>{try{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);}catch{}}});
  if(!registry(s).list().length)return connectQuestion(s,text,intent);
  if(intent==='silence')return await silenceTurn(s,text);
  return await boardTurn(s,text,intent);
 }catch(e){
  if(e?.name==='InputRequired')throw e;
  return kit.failure(s,text,BY,e);
 }
}
// Dashboards: read-only requests only (never a silence or a discovery that proposes writes).
const dashboard={accepts:command=>Q.about(command)&&!['silence','discover'].includes(Q.intent(command)),widgets:['monitorCard']};

module.exports={name:'monitoring',
 defaults:{['extension_'+ID]:'false',monitoringPrometheusUrl:'',monitoringPrometheusToken:'',monitoringAlertmanagerUrl:'',monitoringAlertmanagerToken:'',monitoringGrafanaUrl:'',monitoringGrafanaToken:'',
  monitoringUptimeChecks:'0',monitoringWatch:'false',monitoringPollMin:'2',monitoringWindow:'5m',monitoringAliases:''},
 secrets:['monitoringPrometheusToken','monitoringAlertmanagerToken','monitoringGrafanaToken'],
 validate,setup,notice,turn,boardTurn,silenceTurn,discoverTurn,summary,matchersOf,addChecks,dashboard,
 // Stops the background watch started by setup (hosts that unload extensions call it).
 teardown(){for(const t of timers)clearInterval(t);timers.clear();}};
const timers=new Set();
