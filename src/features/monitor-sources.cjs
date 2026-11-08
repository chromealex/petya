// Monitor sources: services that know whether servers and services are alive (Prometheus, Alertmanager, Grafana
// alerting, Petya's own uptime checks, …), read together by «Мониторинг» (src/extensions/monitoring) and by any
// other app that needs service health. Petya itself knows no monitoring service. An extension declares in its
// extension.json
//   "provides": { "monitor-source": "<file>.cjs" }            (or a list of files)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id?, name?, color?, names?: [RegExp],                     // names: how a request names this source («в Grafana»)
//     ready(settings) -> bool,                                  // connected (the registry adds «the extension is added»)
//     async services?(services, query) -> [service],            // health per service, with golden signals
//     async alerts?(services, query) -> [alert],                // alerts firing (or pending) now
//     async history?(services, query) -> [event],               // past outages / alerts in [query.from, query.to]
//     async silences?(services) -> [silence],                   // read-only list of silences
//     async silence?(services, {matchers, startsAt, endsAt, comment, createdBy}) -> {id},   // a WRITE, see below
//     alertUrl?(alert) -> url }
// `query` is {from, to, now (ms), service?, signal?, aliases}. Every answer is normalized here (shapes below) so
// apps never see a provider's raw format. Docs: docs/foundations/monitoring.md.
// `silence` is the only write: the registry never calls it on its own — an app calls it only after the user
// confirmed the exact matchers and duration (a card button), and the registry refuses a silence without both.
const path=require('node:path');
const KIND='monitor-source';
const HOOKS=['services','alerts','history','silences','silence','alertUrl'];
const STATUSES=['ok','warn','critical','unknown'];
const SEVERITIES=['critical','warning','info'];
const SIGNALS=['errorRate','latencyP95','rps','saturation'];

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid monitor source '+x.extension+'/'+x.file);
  if(typeof p.ready!=='function')throw bad();
  for(const hook of HOOKS)if(p[hook]!==undefined&&typeof p[hook]!=='function')throw bad();
  if(!['services','alerts','history'].some(h=>typeof p[h]==='function'))throw bad();
  if(p.names!==undefined&&(!Array.isArray(p.names)||p.names.some(r=>!(r instanceof RegExp))))throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,color:typeof p.color==='string'?p.color:'',source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// --- Service identity: the one name every app uses for a service ------------------------------------------------
// Shared with the log-source foundation (docs/foundations/log-sources.md): a `service` label. Metrics and alerts
// rarely carry it verbatim, so it is derived from the usual labels in this order; `aliases` (user settings) maps
// other names to the canonical one («api-prod» → «api»).
const SERVICE_LABELS=['service','service_name','app_kubernetes_io_name','app.kubernetes.io/name','k8s_app','app','container','job'];
// Scrape-job names that say how a target is scraped, not what it is: never used as a service name.
const GENERIC_JOBS=/^(?:kubernetes-(?:pods|nodes|service-endpoints|apiservers|cadvisor)|node(?:-exporter)?|blackbox|prometheus|pushgateway|federate|kubelet|cadvisor)$/i;
const clean=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,'-').slice(0,120);
function parseAliases(value){
 if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[clean(k),clean(v)]).filter(([k,v])=>k&&v));
 const out={};
 for(const part of String(value||'').split(/[\n,;]+/)){const m=/^\s*([^=→>]+?)\s*(?:=|→|->)\s*(.+?)\s*$/.exec(part);if(m&&clean(m[1])&&clean(m[2]))out[clean(m[1])]=clean(m[2]);}
 return out;
}
function serviceOf(labels,aliases={}){
 const l=labels&&typeof labels==='object'?labels:{};
 let name='';
 for(const key of SERVICE_LABELS){
  const v=clean(l[key]);if(!v)continue;
  if(key==='job'&&GENERIC_JOBS.test(v))continue;
  name=v;break;
 }
 // Last resort: the instance's host («api-1.prod:8080» → «api-1.prod»).
 if(!name&&l.instance)name=clean(String(l.instance).replace(/^[a-z]+:\/\//i,'').replace(/[:/].*$/,''));
 if(!name)return '';
 return aliases[name]||name;
}
// Finds the service a free-text request names among known ones: exact, alias, then a whole-word match.
function findService(text,names,aliases={}){
 const t=' '+String(text||'').toLowerCase().replace(/[«»"'`.,!?()]/g,' ')+' ';
 const list=[...new Set(names.map(clean).filter(Boolean))].sort((a,b)=>b.length-a.length);
 for(const n of list)if(t.includes(' '+n+' '))return n;
 for(const [alias,n] of Object.entries(aliases))if(t.includes(' '+alias+' ')&&list.includes(n))return n;
 // «api-сервис», «сервис api»: a known name followed by a Russian ending.
 for(const n of list)if(new RegExp('[\\s]'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:[-\\p{L}]{0,4})?\\s','u').test(t))return n;
 return '';
}

// --- Normalized shapes ----------------------------------------------------------------------------------------
const text=(v,max=300)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const time=v=>{if(v==null||v==='')return null;const t=typeof v==='number'?v:Date.parse(v);return Number.isFinite(t)&&t>0?new Date(t).toISOString():null;};
const num=v=>{const n=typeof v==='string'?Number(v):v;return typeof n==='number'&&Number.isFinite(n)?n:null;};
const https=v=>{const u=String(v||'');return /^https?:\/\//i.test(u)?u.slice(0,2000):'';};
function labelsOf(v){
 const out={};
 if(v&&typeof v==='object'&&!Array.isArray(v))for(const [k,x] of Object.entries(v).slice(0,60))if(/^[\w.\/-]{1,100}$/.test(k))out[k]=text(x,500);
 return out;
}
// A series point list [[ms, value]], sorted, at most 500 points.
function series(v){
 return (Array.isArray(v)?v:[]).map(p=>[Number(Array.isArray(p)?p[0]:p?.t),num(Array.isArray(p)?p[1]:p?.v)]).filter(p=>Number.isFinite(p[0])&&p[1]!==null).sort((a,b)=>a[0]-b[0]).slice(-500);
}
// {name, status, since, signals:{errorRate, latencyP95, rps, saturation}, series:{<signal>:[[ms,v]]}, sources, url, note}
// errorRate and saturation are fractions 0..1, latencyP95 seconds, rps requests per second; null = not known.
function service(raw,source,aliases={}){
 const name=aliases[clean(raw?.name)]||clean(raw?.name);
 const signals={},spark={};
 for(const k of SIGNALS){signals[k]=num(raw?.signals?.[k]);const s=series(raw?.series?.[k]);if(s.length)spark[k]=s;}
 return {name,status:STATUSES.includes(raw?.status)?raw.status:'unknown',since:time(raw?.since),signals,series:spark,sources:[source],url:https(raw?.url),note:text(raw?.note,200)};
}
function severity(v){
 const s=clean(v);
 if(['critical','crit','page','p1','high','error','fatal','disaster'].includes(s))return 'critical';
 if(['warning','warn','p2','p3','medium','average'].includes(s))return 'warning';
 return 'info';
}
// {id, name, severity, service, startsAt, labels, annotations, source, silenced, state, url}
function alert(raw,source,aliases={}){
 const labels=labelsOf(raw?.labels),annotations=labelsOf(raw?.annotations);
 const name=text(raw?.name||labels.alertname,200)||'Алерт';
 const svc=raw?.service?aliases[clean(raw.service)]||clean(raw.service):serviceOf(labels,aliases);
 const id=text(raw?.id||raw?.fingerprint,200)||source+':'+name+':'+svc+':'+(labels.instance||'');
 return {id,name,severity:severity(raw?.severity||labels.severity),service:svc,startsAt:time(raw?.startsAt),labels,annotations,source,
  silenced:!!raw?.silenced,state:raw?.state==='pending'?'pending':'firing',url:https(raw?.url)};
}
// {service, status:'critical'|'warn', from, to|null, title, source, kind:'alert'|'uptime'|'other'}
function event(raw,source,aliases={}){
 const from=time(raw?.from);if(!from)return null;
 return {service:aliases[clean(raw?.service)]||clean(raw?.service),status:raw?.status==='warn'?'warn':'critical',from,to:time(raw?.to),title:text(raw?.title,200),source,
  kind:['alert','uptime'].includes(raw?.kind)?raw.kind:'other'};
}
// A silence: {id, matchers:[{name, value, isRegex, isEqual}], startsAt, endsAt, createdBy, comment, state}
function matcher(m){
 const name=text(m?.name,100);if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))return null;
 return {name,value:String(m?.value??'').slice(0,500),isRegex:!!m?.isRegex,isEqual:m?.isEqual!==false};
}
function silenceOf(raw){
 return {id:text(raw?.id,100),matchers:(Array.isArray(raw?.matchers)?raw.matchers:[]).map(matcher).filter(Boolean),startsAt:time(raw?.startsAt),endsAt:time(raw?.endsAt),
  createdBy:text(raw?.createdBy,100),comment:text(raw?.comment,500),state:['active','pending','expired'].includes(raw?.state)?raw.state:'active'};
}

// --- Merging: one board from many sources ------------------------------------------------------------------------
const RANK={unknown:0,ok:1,warn:2,critical:3};
const worst=(a,b)=>RANK[b]>RANK[a]?b:a;
function merge(lists,alerts){
 const by=new Map();
 for(const s of lists.flat()){
  if(!s.name)continue;
  const cur=by.get(s.name);
  if(!cur){by.set(s.name,{...s,signals:{...s.signals},series:{...s.series},sources:[...s.sources]});continue;}
  if(RANK[s.status]>RANK[cur.status]){cur.status=s.status;cur.since=s.since;cur.note=s.note||cur.note;}
  else if(s.status===cur.status&&s.since&&(!cur.since||s.since<cur.since))cur.since=s.since;
  for(const k of SIGNALS){if(cur.signals[k]===null&&s.signals[k]!==null)cur.signals[k]=s.signals[k];if(!cur.series[k]&&s.series[k])cur.series[k]=s.series[k];}
  cur.sources=[...new Set([...cur.sources,...s.sources])];cur.url=cur.url||s.url;
 }
 // A firing, not silenced alert makes its service at least as bad as its severity.
 for(const a of alerts){
  if(!a.service||a.silenced||a.state!=='firing')continue;
  const status=a.severity==='critical'?'critical':a.severity==='warning'?'warn':null;if(!status)continue;
  let cur=by.get(a.service);
  if(!cur){cur={name:a.service,status:'unknown',since:null,signals:Object.fromEntries(SIGNALS.map(k=>[k,null])),series:{},sources:[],url:'',note:''};by.set(a.service,cur);}
  if(RANK[status]>RANK[cur.status]){cur.status=status;cur.since=a.startsAt;}
  else if(status===cur.status&&a.startsAt&&(!cur.since||a.startsAt<cur.since))cur.since=a.startsAt;
  if(!cur.sources.includes(a.source))cur.sources.push(a.source);
 }
 return [...by.values()].sort((a,b)=>RANK[b.status]-RANK[a.status]||a.name.localeCompare(b.name));
}
// The same alert from Prometheus and from Alertmanager (or Grafana) is one row: same name, service and instance
// (sources add their own labels — severity spelled differently, receiver, alertstate — so those do not count).
function dedupeAlerts(list){
 const key=a=>a.name+'\n'+a.service+'\n'+(a.labels.instance||'');
 const by=new Map();
 for(const a of list){
  const k=key(a),cur=by.get(k);
  if(!cur){by.set(k,{...a,sources:[a.source]});continue;}
  // Alertmanager knows silences; the earliest start wins.
  cur.silenced=cur.silenced||a.silenced;if(a.startsAt&&(!cur.startsAt||a.startsAt<cur.startsAt))cur.startsAt=a.startsAt;
  cur.sources=[...new Set([...cur.sources,a.source])];cur.url=cur.url||a.url;
 }
 const SEV={critical:0,warning:1,info:2};
 return [...by.values()].sort((a,b)=>(a.silenced-b.silenced)||SEV[a.severity]-SEV[b.severity]||String(a.startsAt).localeCompare(String(b.startsAt)));
}

// --- State changes with dedupe and flapping protection -------------------------------------------------------------
// Feed it observations per key (a service, a check): it answers with at most one event per real change.
//  - a new status counts only after `confirm` observations in a row (a single failed probe is not «down»);
//  - the first observation is a baseline: «ok» says nothing, a confirmed «critical» says «down»;
//  - `flapLimit` changes within `flapWindow` → one «flapping» event, then silence until the key stays in one
//    status for `flapWindow`; it then reports the settled status («down» or «recovered», `settled: true`);
//  - the same event is never told twice in a row for a key; «unknown» observations are ignored.
// The clock is injected (`now`); `state()` / `restore()` make it survive restarts.
function transitions({now=()=>Date.now(),confirm=2,flapLimit=4,flapWindow=30*60000}={}){
 let keys={};
 const down=s=>s==='critical';
 function observe(key,status){
  if(!STATUSES.includes(status)||status==='unknown')return null;
  const t=now(),k=keys[key]||(keys[key]={stable:null,told:null,candidate:null,count:0,changes:[],flapping:false,since:t});
  const state=down(status)?'down':'up';
  k.changes=k.changes.filter(x=>t-x<flapWindow);
  if(k.flapping){
   if(state!==k.stable){k.stable=state;k.since=t;return null;}
   if(t-k.since<flapWindow)return null;
   // After «flapping» the settled state is always told, so the user knows the alarm is over.
   k.flapping=false;k.changes=[];
   k.told=state;return {key,type:state==='down'?'down':'recovered',settled:true,at:t};
  }
  if(k.stable===null&&state==='up'){k.stable='up';k.told='up';k.since=t;return null;}
  if(state===k.stable){k.candidate=null;k.count=0;return null;}
  if(k.candidate!==state){k.candidate=state;k.count=0;}
  if(++k.count<confirm)return null;
  const first=k.stable===null;
  k.stable=state;k.since=t;k.candidate=null;k.count=0;
  if(!first)k.changes.push(t);
  if(k.changes.length>=flapLimit){k.flapping=true;return {key,type:'flapping',at:t,changes:k.changes.length};}
  if(k.told===state)return null;
  if(state==='up'&&k.told!=='down'){k.told='up';return null;}
  k.told=state;return {key,type:state==='down'?'down':'recovered',at:t};
 }
 return {observe,state:()=>JSON.parse(JSON.stringify(keys)),restore(v){keys=v&&typeof v==='object'&&!Array.isArray(v)?JSON.parse(JSON.stringify(v)):{};},forget(key){delete keys[key];},
  status:key=>keys[key]?(keys[key].flapping?'flapping':keys[key].stable):null};
}

// --- The registry bound to live services -----------------------------------------------------------------------------
function create(s,{sources=load(),timeoutMs=20000}={}){
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const connected=x=>{try{return !!x.source.ready(s.settings||{});}catch{return false;}};
 const ready=x=>added(x)&&connected(x);
 const find=id=>sources.find(x=>x.id===id)||null;
 const live=id=>{const x=find(id);if(!x)throw Error('Нет такого источника мониторинга.');if(!ready(x))throw Error('Источник «'+x.name+'» не добавлен или не подключён.');return x;};
 const describe=x=>({id:x.id,name:x.name,extension:x.extension,color:x.color,added:added(x),connected:connected(x),ready:ready(x),
  canSilence:typeof x.source.silence==='function',has:HOOKS.filter(h=>typeof x.source[h]==='function')});
 const aliases=()=>parseAliases(s.settings?.monitoringAliases);
 const named=command=>sources.filter(x=>(x.source.names||[]).some(r=>{r.lastIndex=0;return r.test(String(command||''));})).map(x=>x.id);
 const bounded=(promise,name)=>Promise.race([promise,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error(name+' не ответил вовремя.')),timeoutMs);t.unref?.();})]);
 const query=q=>{const now=Number(q?.now)||Date.now();return {now,from:Number(q?.from)||now-3600000,to:Number(q?.to)||now,service:clean(q?.service),signal:SIGNALS.includes(q?.signal)?q.signal:'',light:!!q?.light,aliases:aliases()};};
 async function call(id,hook,q){
  const x=live(id);if(typeof x.source[hook]!=='function')return [];
  const r=await bounded(Promise.resolve(x.source[hook](s,q)),x.name);
  if(!Array.isArray(r))throw Error(x.name+' вернул некорректный ответ.');
  return r;
 }
 async function services(id,q){q=query(q);return (await call(id,'services',q)).map(r=>service(r,id,q.aliases)).filter(r=>r.name);}
 async function alerts(id,q){q=query(q);const x=find(id);return (await call(id,'alerts',q)).map(r=>alert(r,id,q.aliases)).map(a=>({...a,url:a.url||https(safe(()=>x.source.alertUrl?.(a)))}));}
 async function history(id,q){q=query(q);return (await call(id,'history',q)).map(r=>event(r,id,q.aliases)).filter(Boolean);}
 async function silences(id){const x=live(id);if(typeof x.source.silences!=='function')return [];return (await bounded(Promise.resolve(x.source.silences(s)),x.name)||[]).map(silenceOf);}
 // The one write. Exact matchers (at least one equality matcher, no empty values) and a bounded duration are required.
 async function silence(id,{matchers,startsAt,endsAt,comment,createdBy}={}){
  const x=live(id);
  if(typeof x.source.silence!=='function')throw Error('«'+x.name+'» не умеет глушить алерты.');
  const list=(Array.isArray(matchers)?matchers:[]).map(matcher).filter(Boolean);
  if(!list.length||!list.some(m=>m.isEqual&&!m.isRegex&&m.value))throw Error('Заглушить можно только по точным условиям (метка = значение).');
  if(list.some(m=>!m.value))throw Error('Пустое значение метки заглушило бы слишком много.');
  const from=Date.parse(startsAt),to=Date.parse(endsAt);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)throw Error('Укажите, на сколько заглушить.');
  if(to-from>7*86400000)throw Error('Заглушить можно не больше чем на 7 дней.');
  const r=await x.source.silence(s,{matchers:list,startsAt:new Date(from).toISOString(),endsAt:new Date(to).toISOString(),comment:text(comment,500)||'Petya',createdBy:text(createdBy,100)||'Petya'});
  return {id:text(r?.id,100),source:id};
 }
 // Everything at once from every ready source (or the ones asked): failures are per source, never fatal.
 async function snapshot(q,{only}={}){
  q=query(q);
  const targets=sources.filter(ready).filter(x=>!only?.length||only.includes(x.id));
  const rows=await Promise.all(targets.map(async x=>{
   const out={id:x.id,name:x.name,color:x.color,services:[],alerts:[],history:[],error:''};
   const parts=await Promise.allSettled([services(x.id,q),alerts(x.id,q),history(x.id,q)]);
   const errors=parts.filter(p=>p.status==='rejected').map(p=>p.reason?.message||'недоступен');
   [out.services,out.alerts,out.history]=parts.map(p=>p.status==='fulfilled'?p.value:[]);
   if(errors.length)out.error=[...new Set(errors)].join(' ');
   return out;
  }));
  const alertList=dedupeAlerts(rows.flatMap(r=>r.alerts));
  return {at:new Date(q.now).toISOString(),from:new Date(q.from).toISOString(),to:new Date(q.to).toISOString(),
   services:merge(rows.map(r=>r.services),alertList),alerts:alertList,history:rows.flatMap(r=>r.history).sort((a,b)=>b.from.localeCompare(a.from)),
   sources:rows.map(r=>({id:r.id,name:r.name,color:r.color,error:r.error,services:r.services.length,alerts:r.alerts.length}))};
 }
 return {all:()=>sources.map(describe),list:()=>sources.filter(ready).map(describe),find:id=>{const x=find(id);return x?describe(x):null;},named,
  services,alerts,history,silences,silence,snapshot,aliases};
}
const safe=f=>{try{return f();}catch{return '';}};

module.exports={name:'monitorSources',defaults:{},validate(){},KIND,STATUSES,SEVERITIES,SIGNALS,SERVICE_LABELS,load,create,
 serviceOf,findService,parseAliases,service,alert,event,silenceOf,merge,dedupeAlerts,transitions,severity,
 directory:path.join(__dirname,'../extensions')};
