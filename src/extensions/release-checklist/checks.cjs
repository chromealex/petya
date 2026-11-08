// Release checks: apps that can tell whether one part of a release is ready. «Релизный чек-лист» knows no app by name:
// an extension declares in its extension.json
//   "provides": { "release-check": "release-check.cjs" }
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?,
//     checks: [{id: 'ci.green', title: 'CI зелёный на релизной ветке', group?: 'Сборка'}],   // what it can check
//     ready(settings) -> bool,                       // connected (the registry adds «the extension is added»)
//     hint?(settings) -> string,                     // where to connect, said when it is added but not ready
//     async run(services, release) -> [Result] }     // all of its checks at once
// release = {version: '1.5', previous: '1.4' | null, branch: 'release/1.5', roots: [project folders], now: Date,
//            project: {id, name}}
// Result = {id: <check id>, status: 'ok' | 'problem' | 'unknown', summary: short Russian line,
//           evidence?: [{text, url?}], action?: {label, ask}}   // ask: a chat request that shows the details
// A check id is owned by one provider (the first by extension id wins); a template item names the check id, not the
// app. Providers only read: nothing here writes to a service. `unknown` is «не проверено» with the reason in the
// summary (no data yet, not configured); a provider error becomes `unknown` with the error text.
const KIND='release-check';
const STATUSES=['ok','problem','unknown'];
const RUN_TIMEOUT=90000;

function load(dir){
 const seen=new Set();
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid release check '+x.extension+'/'+x.file);
  if(typeof p.ready!=='function'||typeof p.run!=='function'||!Array.isArray(p.checks)||!p.checks.length)throw bad();
  if(p.hint!==undefined&&typeof p.hint!=='function')throw bad();
  for(const c of p.checks)if(!/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(c?.id||'')||typeof c.title!=='string'||!c.title.trim())throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,provider:p};
 }).sort((a,b)=>a.extension.localeCompare(b.extension)).map(x=>({...x,checks:x.provider.checks.filter(c=>!seen.has(c.id)&&seen.add(c.id)).map(c=>({id:c.id,title:c.title,group:String(c.group||'')}))}));
}

const text=(v,max=300)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const safeUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}};
// One provider result in the card's shape; anything malformed is dropped rather than shown.
function result(raw){
 if(!raw||typeof raw.id!=='string')return null;
 const status=STATUSES.includes(raw.status)?raw.status:'unknown';
 const evidence=(Array.isArray(raw.evidence)?raw.evidence:[]).map(e=>({text:text(e?.text,240),url:safeUrl(e?.url)})).filter(e=>e.text).slice(0,8);
 const action=raw.action&&typeof raw.action.ask==='string'&&raw.action.ask.trim()?{label:text(raw.action.label,60)||'Подробнее',ask:text(raw.action.ask,300)}:null;
 return {id:raw.id,status,summary:text(raw.summary,300),evidence,...action?{action}:{}};
}

let cached=null;
// The registry bound to live services: which apps are added and connected is read at call time.
function create(s,{providers}={}){
 const all=()=>providers||(cached??=load());
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const connected=x=>{try{return !!x.provider.ready(s.settings||{});}catch{return false;}};
 const hint=x=>{try{return typeof x.provider.hint==='function'?text(x.provider.hint(s.settings||{}),300):'';}catch{return '';}};
 const owner=check=>all().find(x=>x.checks.some(c=>c.id===check))||null;
 // Every check any app can provide, for the template editor: [{id, title, group, extension, name}].
 const catalog=()=>all().flatMap(x=>x.checks.map(c=>({...c,extension:x.extension,name:x.name})));
 // Runs the providers the asked checks need (each once, in parallel) and answers per check id:
 // {status:'ok'|'problem'|'unknown'|'missing', summary, evidence, action?, extension, name}.
 async function evaluate(checkIds,release,{progress=()=>{},timeout=RUN_TIMEOUT}={}){
  const out={},need=new Map();
  for(const id of new Set(checkIds)){
   const x=owner(id);
   if(!x){out[id]={status:'unknown',summary:'Эту проверку не предоставляет ни одно приложение.',evidence:[],extension:'',name:''};continue;}
   const base={extension:x.extension,name:x.name};
   if(!added(x)){out[id]={...base,status:'missing',summary:'Нет приложения «'+x.name+'».',evidence:[]};continue;}
   if(!connected(x)){out[id]={...base,status:'unknown',summary:hint(x)||'Приложение «'+x.name+'» не подключено.',evidence:[],connect:true};continue;}
   need.set(x,[...(need.get(x)||[]),id]);
  }
  await Promise.all([...need].map(async([x,ids])=>{
   const base={extension:x.extension,name:x.name};
   progress('Проверяю: '+x.name);
   let timer;
   try{
    const raw=await Promise.race([x.provider.run(s,release),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('«'+x.name+'» не ответил вовремя.')),timeout);})]);
    const rows=(Array.isArray(raw)?raw:[]).map(result).filter(Boolean);
    for(const id of ids){const r=rows.find(r=>r.id===id);out[id]=r?{...base,...r}:{...base,status:'unknown',summary:'«'+x.name+'» не дал ответа по этой проверке.',evidence:[]};}
   }catch(e){
    if(e?.name==='AbortError')throw e;
    for(const id of ids)out[id]={...base,status:'unknown',summary:'Не удалось проверить: '+text(e?.message||e,200),evidence:[],error:true};
   }finally{clearTimeout(timer);}
  }));
  return out;
 }
 return {all,catalog,owner,evaluate};
}
module.exports={KIND,STATUSES,load,create,result};
