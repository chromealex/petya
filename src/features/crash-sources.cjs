// Crash sources: services that know an app's crashes, shown together by «Крэши» (src/extensions/crashes).
// Petya itself knows no crash service. An extension declares in its extension.json
//   "provides": { "crash-source": "crash-source.cjs" }
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?, color?, names?: [RegExp],          // names: how a request names this source («в Sentry»)
//     standalone?: [RegExp],                          // names that alone make a crash request («что в Sentry»)
//     service?: '<module>',                           // connected in Petya's service settings (Google Play)
//     ready(settings) -> bool,                        // connected (the registry adds «the extension is added»)
//     async issues(services, query) -> {issues, more?, url?, scope?, note?},
//     async release?(services, name) -> {name, date, versions} | null,
//     async crashFree?(services, query) -> {sessions, users, total?} | null,
//     async resolve?(services, id), async reopen?(services, id), issueUrl?(issue) -> url }
// `query` is {text, period:{label, kind, start, end, days, statsPeriod?}, since, release, platform, environment, onlyNew,
// now}. Issues come back in one shape (see `issue` below); nothing is merged across sources — the card groups them.
// Only crash issues: ANR and other hang reports are not crashes here (Google Play ANR has its own card).
// A dedicated registry, not an app link: sources are read by «Крэши», never shown as card buttons of other apps.
const path=require('node:path');
const KIND='crash-source';
const HOOKS=['release','crashFree','resolve','reopen','issueUrl'];

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid crash source '+x.extension+'/'+x.file);
  if(typeof p.ready!=='function'||typeof p.issues!=='function')throw bad();
  for(const hook of HOOKS)if(p[hook]!==undefined&&typeof p[hook]!=='function')throw bad();
  for(const list of [p.names,p.standalone])if(list!==undefined&&(!Array.isArray(list)||list.some(r=>!(r instanceof RegExp))))throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,color:typeof p.color==='string'?p.color:'',service:typeof p.service==='string'?p.service:'',source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

const text=(v,max=300)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const count=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n):0;};
const time=v=>{const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null;};
const LEVELS=['fatal','error','warning','info','debug'];
// One issue of a source in the shape «Крэши» shows: {id, source, title, culprit, level, events, users, firstSeen,
// lastSeen, versions, platform, project, shortId, daily:[{day:'YYYY-MM-DD', count}], isNew, url, unhandled}.
function issue(raw,source){
 const daily=(Array.isArray(raw?.daily)?raw.daily:[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d?.day)).map(d=>({day:d.day,count:count(d.count)}));
 const url=String(raw?.url||'');
 return {id:text(raw?.id,200),source,title:text(raw?.title)||'Без названия',culprit:text(raw?.culprit),level:LEVELS.includes(raw?.level)?raw.level:'error',
  events:count(raw?.events),users:count(raw?.users),firstSeen:time(raw?.firstSeen),lastSeen:time(raw?.lastSeen),
  versions:(Array.isArray(raw?.versions)?raw.versions:[]).map(v=>text(v,80)).filter(Boolean).slice(0,5),platform:text(raw?.platform,40),
  project:text(raw?.project,120),shortId:text(raw?.shortId,60),daily,isNew:!!raw?.isNew,url:/^https:\/\//.test(url)?url:'',unhandled:!!raw?.unhandled};
}

// The registry bound to live services: which extensions are added and connected is read at call time.
function create(s,{sources=load()}={}){
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const connected=x=>{try{return !!x.source.ready(s.settings||{});}catch{return false;}};
 const ready=x=>added(x)&&connected(x);
 const find=id=>sources.find(x=>x.id===id)||null;
 const live=id=>{const x=find(id);if(!x)throw Error('Нет такого источника крэшей.');if(!ready(x))throw Error('Источник «'+x.name+'» не добавлен или не подключён.');return x;};
 const describe=x=>({id:x.id,name:x.name,extension:x.extension,color:x.color,service:x.service,added:added(x),connected:connected(x),ready:ready(x),canResolve:typeof x.source.resolve==='function'});
 const matches=(list,command)=>(list||[]).some(r=>{r.lastIndex=0;return r.test(String(command||''));});
 // Sources the request names («только Sentry», «крэши в Google Play»), ready or not.
 const named=command=>sources.filter(x=>matches(x.source.names,command)||matches(x.source.standalone,command)).map(x=>x.id);
 // Whether the request names a source in a way that is a crash request by itself («что в Sentry за сутки»).
 const standalone=command=>sources.some(x=>matches(x.source.standalone,command));
 async function issues(id,query){
  const x=live(id),r=await x.source.issues(s,query||{});
  const list=Array.isArray(r)?r:Array.isArray(r?.issues)?r.issues:null;
  if(!list)throw Error(x.name+' вернул некорректный список крэшей.');
  const url=String(r?.url||'');
  return {issues:list.map(i=>issue(i,x.id)).filter(i=>i.id),more:!!r?.more,url:/^https?:\/\//.test(url)?url:'',scope:text(r?.scope,200),note:text(r?.note,300)};
 }
 const optional=async(id,hook,...args)=>{const x=live(id);return typeof x.source[hook]==='function'?x.source[hook](s,...args):null;};
 return {
  all:()=>sources.map(describe),list:()=>sources.filter(ready).map(describe),find:id=>{const x=find(id);return x?describe(x):null;},named,standalone,issues,
  release:(id,name)=>optional(id,'release',name),crashFree:(id,query)=>optional(id,'crashFree',query),
  async resolve(id,issueId){const x=live(id);if(typeof x.source.resolve!=='function')throw Error('«'+x.name+'» не умеет отмечать крэши решёнными.');return x.source.resolve(s,issueId);},
  async reopen(id,issueId){const x=live(id);if(typeof x.source.reopen!=='function')throw Error('«'+x.name+'» не умеет снова открывать крэши.');return x.source.reopen(s,issueId);}
 };
}

module.exports={name:'crashSources',defaults:{},validate(){},KIND,load,create,issue,directory:path.join(__dirname,'../extensions'),
 setup(s){return {crashSources:create(s)};}};
