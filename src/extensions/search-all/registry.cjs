// Search sources of «Поиск по всему»: where one question is searched. Any app declares one in its extension.json
//   "provides": { "search-source": "<file>.cjs" }       (a list of files is fine)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id, label,                         // the card row: 'jira', 'Jira'
//     order?,                            // position on the card (lower first, default 1000)
//     icon?, color?, in?,                // card look: 'chat'|'doc'|'task'|'mail'|'meet'|'file'|'book'|'note'|'drive',
//                                        // a chip color, «в Google Диске» for «Ответь по найденному …»
//     names?: RegExp,                    // how a follow-up names it («ответь по найденному в гугл диске»)
//     parts?: [{id, label}],             // one request answers several card rows (Confluence and Notion)
//     ready(settings, services) -> bool | [part ids],   // connected now (the app being added is checked here)
//     off?: text | {partId: text},       // why it is not connected, shown on the card
//     timeout?: 'remote' | 'files',      // which time limit applies (default remote)
//     async search(services, {topic, terms, own, words}) -> {items:[{source, id, title, text, url, at, meta}],
//                                                           note?, state?:'off'|'limited', link?} }
// `own` are the user's words, `words` adds the model's extra words, `terms` are stemmed terms (query.cjs). A source
// only reads, and runs under its own time limit: a slow or failing one marks only itself on the card.
// Core sources (project files, mail accounts, the messenger-source bridge) are passed by the app itself in the same
// shape; a core source may export `each(services) -> [source]` instead, expanded at search time (one per messenger).
// Docs: docs/apps/search-all.md.
const KIND='search-source';
const PARTS=['id','label'];
function valid(p){
 const fn=k=>p[k]===undefined||typeof p[k]==='function';
 if(typeof p.each==='function')return typeof p.id==='string';
 return typeof p.id==='string'&&/^[a-z][a-z0-9-]{1,40}$/.test(p.id)&&typeof p.label==='string'&&typeof p.ready==='function'&&typeof p.search==='function'&&
  (p.names===undefined||p.names instanceof RegExp)&&(p.parts===undefined||Array.isArray(p.parts)&&p.parts.every(x=>PARTS.every(k=>typeof x?.[k]==='string')))&&fn('hint');
}
function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(!valid(p)){
   const error=Error('Invalid search source '+x.extension+'/'+x.file);
   // An installed extension with a broken source is reported and skipped; a bundled one is a bug.
   if(x.origin&&x.origin!=='bundled'){const reg=require('../../extension-registry.cjs');reg.report(reg.entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,source:p}];
 });
}
const rank=p=>Number.isFinite(p.order)?p.order:1000;
// The registry bound to live services. `sources` replaces the declared ones (tests); `core` are the app's own.
function create(s,{sources,core=[]}={}){
 const declared=()=>sources||require('../../extension-registry.cjs').cached('search-sources',()=>load());
 // Core service modules (Slack, Jira, Confluence) are switched with module_<id>, which is on unless 'false'.
 const added=x=>{if(!x.setting)return true;const v=s.settings?.[x.setting];if(/^module_/.test(x.setting)){try{return require('../../modules.cjs').enabled(s.settings||{},x.setting.slice(7));}catch{return v!=='false';}}return v==='true';};
 // Sources of added apps and the core ones, bridges expanded, in card order.
 function list(){
  const out=[];
  for(const p of [...core,...declared().filter(added).map(x=>x.source)]){
   if(typeof p.each==='function'){let more=[];try{more=p.each(s)||[];}catch{more=[];}out.push(...more.filter(valid));}
   else out.push(p);
  }
  return out.sort((a,b)=>rank(a)-rank(b));
 }
 // Which card rows a source answers now: [part ids], empty when it is not connected.
 function ready(p){
  const parts=(p.parts||[{id:p.id}]).map(x=>x.id);
  let on;try{on=p.ready(s.settings||{},s);}catch{on=false;}
  return on===true?parts:Array.isArray(on)?parts.filter(id=>on.includes(id)):[];
 }
 const offNote=(p,id)=>typeof p.off==='string'?p.off:p.off&&typeof p.off==='object'?String(p.off[id]||''):'';
 // Sources a follow-up names.
 const named=text=>list().filter(p=>p.names instanceof RegExp&&p.names.test(String(text||''))).map(p=>p.id);
 return {list,ready,offNote,named,any:()=>list().some(p=>ready(p).length>0)};
}
module.exports={KIND,load,create,valid};
