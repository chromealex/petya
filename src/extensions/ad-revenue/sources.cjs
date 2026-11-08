// Ad sources: services that report ad revenue (mediation platforms, ad networks). «Реклама и монетизация» knows
// no service itself. An extension declares in its extension.json
//   "provides": { "ad-source": "<file>.cjs" }   (or a list of files)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id, name, ready(settings) -> bool, hint?, maxDays?, forget?(),
//     async fetch(services, {start, end, current:{start,end}, check}) -> {
//       rows:[{day, app, bundle?, platform, network, format, revenue, impressions, attempts?, responses?}],
//       days?:[{day, app, platform, dau?, requests?, fills?}], countries?:[{country, revenue, impressions}], notes?:[text] } }
// Days are UTC 'YYYY-MM-DD', revenue in USD; names go through shape.cjs so every source says «Google AdMob» alike.
// A source counts only while its extension is added (catalog switch) and it is ready (connected).
const KIND='ad-source';

function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.fetch!=='function'||typeof p.ready!=='function'||typeof p.name!=='string')throw Error('Invalid ad source '+x.extension+'/'+x.file);
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
let cached=null;
function create(s,{sources}={}){
 const all=()=>sources||(cached=cached||load());
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const ready=x=>{try{return added(x)&&!!x.source.ready(s.settings||{});}catch{return false;}};
 return {
  all:()=>all().filter(added).map(({id,name})=>({id,name})),
  ready:()=>all().filter(ready),
  find:id=>all().find(x=>x.id===id&&ready(x))||null
 };
}
module.exports={KIND,load,create};
