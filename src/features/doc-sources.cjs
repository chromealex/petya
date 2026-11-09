// Documentation sources of the task decomposition (src/workspace.cjs `searchDocs` / `fullDocument`): where Petya looks
// for the specs and requirements of a feature before planning its tasks. Confluence is Petya's own; an app adds
// another source by declaring
//   "provides": { "doc-source": "<file>.cjs" }
// and the file exports
//   {id, name, ready(settings), watch?: [settingKey], note?: string,
//    async search({settings, request}, terms) → {docs: [{id, source: name, title, text, url, score, more?, …}], warnings?},
//    async full?({settings, request}, doc) → {text, truncated}}
// `ready` — added and connected; `watch` — settings whose change during a search voids it («Подключения изменились»);
// `note` — a warning shown first while the source is used (what its search can and cannot see); `full` reads the
// whole document the person chose when its search gave only the start (`more`). `request` is Petya's proxy-aware
// client (it signs service requests with the saved connection). Example: «Notion» (src/extensions/notion/doc-source.cjs).
const KIND='doc-source';
const registry=()=>require('../extension-registry.cjs');
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const fn=k=>p[k]===undefined||typeof p[k]==='function';
  if(!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||typeof p.ready!=='function'||typeof p.search!=='function'||!fn('full')||p.watch!==undefined&&!(Array.isArray(p.watch)&&p.watch.every(k=>typeof k==='string'))||p.note!==undefined&&typeof p.note!=='string'){
   const error=Error('Invalid doc source '+x.extension+'/'+x.file+': {id, name, ready(settings), watch?, note?, search({settings, request}, terms), full?({settings, request}, doc)}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,source:p}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
// Service modules (`module_*`) are on unless switched off, like Petya's own modules (src/modules.cjs); any other app
// counts once added.
const added=(x,settings)=>!x.setting||(x.setting.startsWith('module_')?settings[x.setting]!=='false':settings[x.setting]==='true');
// The sources to search with these settings, in a stable order.
function list(settings={},{sources}={}){
 return (sources||load()).filter(x=>{if(!added(x,settings))return false;try{return !!x.source.ready(settings);}catch{return false;}}).map(x=>x.source);
}
// Every registered source (ready or not): the settings to watch.
const all=({sources}={})=>(sources||load()).map(x=>x.source);
module.exports={KIND,load,list,all,added};
