// Growth sources: knowledge an app keeps itself that counts on «Развитие» like learned phrases and corrections
// (the mail rules of «Почта»). An app declares in its extension.json
//   "provides": { "growth-source": "<file>.cjs" }
// and the file exports {id, items(services) → [{key, title, learned, points, at, source}]}:
//  - key: growth.key(kind, content) (src/growth.cjs) of what the knowledge does, so the same content never earns
//    twice and events the core recorded before the app owned that knowledge stay active under the same key;
//  - at: when it was saved (null when unknown), points: 10–40, learned: Petya's words about it.
// A source counts only while its app is added; one that throws is skipped (and an installed one is reported).
const KIND='growth-source';
const registry=()=>require('./extension-registry.cjs');
function load(dir){
 const build=()=>require('./features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(typeof p.items!=='function'||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id)){
   const error=Error('Invalid growth source '+x.extension+'/'+x.file);
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,source:p}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
const clean=(e,id)=>e&&typeof e.key==='string'&&e.key&&typeof e.title==='string'?{key:e.key.slice(0,200),title:e.title.slice(0,200),learned:String(e.learned||'').slice(0,2000),
 points:Math.max(10,Math.min(40,Math.round(Number(e.points)||25))),at:Number.isFinite(e.at)?e.at:null,source:String(e.source||'').slice(0,120)||id}:null;
// Every added source's knowledge, for growth.summary(state, extra).
function items(s,{sources}={}){
 const out=[];
 for(const x of sources||load()){
  if(x.setting&&s?.settings?.[x.setting]!=='true')continue;
  try{for(const e of x.source.items(s)||[]){const row=clean(e,x.id);if(row)out.push(row);}}
  catch(error){console.error('Growth source '+x.id+':',error.message);}
 }
 return out;
}
module.exports={KIND,load,items};
