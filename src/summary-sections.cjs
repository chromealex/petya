// Sections apps add to the daily summary «Что у нас сегодня?» (src/daily-brief.cjs). The same contract as the
// journal's sources (journal-source, src/extensions/journal/sources.cjs) — declared through `provides`, `ready(settings)`,
// `collect(services, {from, to, now})` for a period, a time limit, and a failure that hides no other section — but a
// summary section is a heading with a few lines of text, not timeline items. An app declares
//   "provides": { "summary-section": "<file>.cjs" }
// and the file exports {id, title, order?, ready?(settings), async collect(services, {from, to, now}) → {lines} | null}.
// A section counts only while its app is added (and ready); `null` or no lines leaves it out. Reading only.
const KIND='summary-section';
const TIMEOUT=10000;
const registry=()=>require('./extension-registry.cjs');
function load(dir){
 const build=()=>require('./features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.collect!=='function'||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||typeof p.title!=='string'||!p.title.trim()||(p.ready!==undefined&&typeof p.ready!=='function')){
   const error=Error('Invalid summary section '+x.extension+'/'+x.file+': {id, title, order?, ready?(settings), collect(services, {from, to, now})}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,section:p}];
 }).sort((a,b)=>(a.section.order??100)-(b.section.order??100)||a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
const ready=(x,settings={})=>{if(x.setting&&settings[x.setting]!=='true')return false;try{return typeof x.section.ready!=='function'||!!x.section.ready(settings);}catch{return false;}};
const within=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('не ответил за '+Math.round(ms/1000)+' сек')),ms).unref?.())]);
// [{id, title, lines, error?}] of the added sections for the period, in their order.
async function collect(s,{from,to,now=Date.now()},{sections,timeout=TIMEOUT}={}){
 const used=(sections||load()).filter(x=>ready(x,s?.settings||{}));
 const out=await Promise.all(used.map(async x=>{
  try{const r=await within(Promise.resolve(x.section.collect(s,{from,to,now})),timeout);const lines=(r?.lines||[]).filter(l=>typeof l==='string'&&l.trim()).slice(0,12).map(l=>l.slice(0,400));return lines.length?{id:x.id,title:x.section.title,lines}:null;}
  catch(e){return {id:x.id,title:x.section.title,lines:[],error:String(e?.message||e).slice(0,200)};}
 }));
 return out.filter(Boolean);
}
module.exports={KIND,load,collect,ready};
