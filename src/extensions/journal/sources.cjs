// Journal sources: what «Дневник дня» knows about a period. Any app declares one in its extension.json
//   "provides": { "journal-source": "<file>.cjs" }       (a list of files is fine)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`). The file exports
//   { id, name, icon,                     // icon: 'chat' | 'task' | 'commit' | 'meeting' | 'focus' | 'message' | 'reminder' | …
//     ready(settings) -> bool,            // the service it reads is connected (a source that is not ready is skipped)
//     async collect(services, {from, to, now}) -> {
//       items: [{at, icon, title, detail?, url?, kind?, minutes?}],   // what happened, shown on the day's timeline
//       carry?: [{id, title, detail?, url?, source}] } }              // open items that may go to tomorrow's plan
// `items` cover [from, to). The day's totals are counted from the items' `kind`: meeting, transition and task
// (tasks), commit, chat, message, reminder, and focus (its `minutes` add up to focus minutes) — a focus app only
// needs to return `{kind:'focus', minutes}` items. A source reads only (nothing is posted anywhere) and its failure
// is shown as «не удалось прочитать» without hiding the others.
const KIND='journal-source';
const TIMEOUT=20000;
function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.collect!=='function'||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id))throw Error('Invalid journal source '+x.extension+'/'+x.file);
  return {id:p.id,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
const within=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('не ответил за '+Math.round(ms/1000)+' с')),ms).unref?.())]);
function create(s,{sources}={}){
 const list=sources||load();
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const ready=x=>{try{return added(x)&&(typeof x.source.ready!=='function'||!!x.source.ready(s.settings||{}));}catch{return false;}};
 // Everything the ready sources know about [from, to): items sorted by time, carry candidates, failures.
 async function collect({from,to,now=Date.now()}){
  const used=list.filter(ready);
  const results=await Promise.all(used.map(async x=>{
   try{const r=await within(Promise.resolve(x.source.collect(s,{from,to,now})),TIMEOUT);return {x,r:r||{}};}
   catch(e){return {x,error:String(e?.message||e).slice(0,200)};}
  }));
  const items=[],carry=[],errors=[],names=[];
  for(const {x,r,error} of results){
   names.push({id:x.id,name:x.name,ok:!error});
   if(error){errors.push({source:x.name,text:error});continue;}
   for(const i of r.items||[])if(Number.isFinite(i.at)&&i.at>=from&&i.at<to&&i.title)items.push({...i,source:i.source||x.id,icon:i.icon||x.source.icon||'event',title:String(i.title).slice(0,240),detail:i.detail?String(i.detail).slice(0,240):''});
   for(const c of r.carry||[])if(c?.id&&c.title)carry.push({...c,source:c.source||x.id,title:String(c.title).slice(0,240)});
  }
  items.sort((a,b)=>a.at-b.at);
  return {items,carry,errors,sources:names};
 }
 return {collect,list:()=>list.map(x=>({id:x.id,name:x.name,ready:ready(x)}))};
}
module.exports={KIND,load,create};
