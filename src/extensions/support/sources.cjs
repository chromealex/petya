// Support sources of «Поддержка игроков»: the app knows no help desk. An extension declares in its extension.json
//   "provides": { "support-source": "<file>.cjs" }
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?, ready(settings) -> bool, hint(settings) -> string (where to connect),
//     tickets(services, {since: Date}) -> [ticket], ticket(services, id) -> ticket | null,
//     comments(services, id) -> [{id, author, agent, public, text, created}],
//     articles?(services, query) -> [{title, url, snippet}], macros?(services) -> [{title, text}],
//     reply(services, id, text) -> {url} }
// with tickets normalized to {id, subject, text, status: new|open|pending|hold|solved|closed,
//   priority: urgent|high|normal|low|null, created, updated, requester, tags, url, sla: {breachAt, metric} | null}.
// The first source is Zendesk (zendesk.cjs in this directory); Helpshift and Freshdesk would be further files here or
// in their own extensions (docs/apps/support.md). A source counts only while its extension is added and ready.
const KIND='support-source';
const STATUSES=['new','open','pending','hold','solved','closed'];
const PRIORITIES=['urgent','high','normal','low'];

function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  for(const fn of ['ready','tickets','ticket','comments','reply'])if(typeof p[fn]!=='function')throw Error('Invalid support source '+x.extension+'/'+x.file);
  for(const fn of ['articles','macros','hint'])if(p[fn]!==undefined&&typeof p[fn]!=='function')throw Error('Invalid support source '+x.extension+'/'+x.file);
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
let cached=null;
// The registry bound to live services: which sources are added and connected is read at call time.
function create(s,{sources}={}){
 const all=()=>sources||(cached??=load());
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const ready=x=>{try{return added(x)&&!!x.source.ready(s.settings||{});}catch{return false;}};
 return {
  all:()=>all().filter(added),
  list:()=>all().filter(ready),
  find:id=>all().find(x=>x.id===id&&ready(x))||null,
  hints:()=>all().filter(added).map(x=>{try{return typeof x.source.hint==='function'?String(x.source.hint(s.settings||{})||''):'';}catch{return '';}}).filter(Boolean)
 };
}
module.exports={KIND,STATUSES,PRIORITIES,load,create};
