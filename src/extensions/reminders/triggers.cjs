// Reminder triggers: events «Напоминания» can wait for — «когда закроют BW-123», «когда Олег появится в сети».
// Any app declares one in its extension.json
//   "provides": { "reminder-trigger": "<file>.cjs" }      (a list of files is fine)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`). The file exports
//   { id, name, icon,                       // icon: 'task' | 'presence' | 'calendar' | 'build' | 'event'
//     match(text) -> params | null,         // pure: does the request name this event? (no services, no network)
//     ready(settings) -> bool,              // the service the trigger reads is connected
//     connect: string,                      // where to connect it, said when not ready
//     async prepare(services, params, {now}) -> {params, label, url?, note?, fireAt?},
//     async check(services, params, {now, state}) -> {fired, text?, url?, params?, state?, fireAt?, gone?},
//     every?(checks, params, now) -> ms }   // when to look again (backoff); the service caps and adds error backoff
// `prepare` runs once when the reminder is created: it resolves names, reads the current state and may refuse
// with a TriggerError: 'unsupported' (the connection cannot do this, e.g. no users:read scope), 'already'
// (the event has happened), 'not-found' (no such task, person or meeting). `check` only reads; a trigger never
// writes to a service. A trigger counts only while its extension is added (the catalog switch) and ready.
const KIND='reminder-trigger';
class TriggerError extends Error{constructor(code,message,extra={}){super(message);this.name='TriggerError';this.code=code;Object.assign(this,extra);}}

function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  for(const f of ['match','ready','prepare','check'])if(typeof p[f]!=='function')throw Error('Invalid reminder trigger '+x.extension+'/'+x.file);
  if(typeof p.id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id))throw Error('Invalid reminder trigger '+x.extension+'/'+x.file);
  return {id:p.id,extension:x.extension,setting:x.setting,name:p.name||x.name,trigger:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// The registry bound to live services: what is added and connected is read at call time.
function create(s,{triggers}={}){
 const list=triggers||load();
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const ready=x=>{try{return added(x)&&!!x.trigger.ready(s.settings||{});}catch{return false;}};
 // The trigger a request names (whether or not it is connected): {id, name, params, ready, connect} | null.
 function match(text){
  for(const x of list){
   let params=null;try{params=x.trigger.match(String(text||''));}catch{params=null;}
   if(params)return {id:x.id,name:x.name,icon:x.trigger.icon||'event',params,ready:ready(x),added:added(x),connect:x.trigger.connect||''};
  }
  return null;
 }
 const get=id=>list.find(x=>x.id===id)||null;
 return {match,get,ready:id=>{const x=get(id);return !!x&&ready(x);},list:()=>list.map(x=>({id:x.id,name:x.name,icon:x.trigger.icon||'event',ready:ready(x)}))};
}
module.exports={KIND,TriggerError,load,create};
