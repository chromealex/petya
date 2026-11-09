// Metrics sources: apps that can read a game's product metrics (AppMetrica now; GameAnalytics, Firebase Analytics
// via BigQuery or Adjust later). «Метрики игры» knows no service itself. An extension declares in its extension.json
//   "provides": { "metrics-source": "metrics-source.cjs" }
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?, ready(settings) -> bool, apps?(settings) -> [{id, name}],
//     names?(settings) -> [string],                                          // other names a request may call it by
//                                                                              (Grafana: its host, «wombyte»)
//     async fetch(services, query) -> {app?, series:[Series], unavailable:[{metric, reason}]},
//     async retention?(services, query) -> {cohorts:[{date, size, returned:{1, 7, 30}}]} | null,
//     async facets?(services, query) -> {versions:[string], platforms:[string]},
//     async events?(services, query) -> [{name, users}],                      // for «Воронки»: event names of the period
//     installs?: bool,                                                        // journeys can include installs ($install)
//     async journeys?(services, {from, to, app, platform, events:[name], install}) ->
//       {journeys:[{user, platform, country, version, times:{[event]:[ms ascending]}}], truncated?} }
// query = {from, to (YYYY-MM-DD, inclusive), metrics:['dau','new','revenue'], platform:'android'|'ios'|null,
//   version:string|null, app:string|null}.
// Series — the normalized shape every source returns:
//   {source, metric:'dau'|'new'|'revenue', unit:'users'|'currency:RUB'|…, series:[{date:'YYYY-MM-DD', value}],
//    dimensions:{platform?, version?, app?}}
// A source counts only while its extension is added (catalog switch) and ready (connected).
const KIND='metrics-source';
const METRICS=['dau','new','revenue'];

function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.ready!=='function'||typeof p.fetch!=='function')throw Error('Invalid metrics source '+x.extension+'/'+x.file);
  for(const hook of ['apps','names','retention','facets','events','journeys'])if(p[hook]!==undefined&&typeof p[hook]!=='function')throw Error('Invalid metrics source '+x.extension+'/'+x.file);
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

function create(s,{sources=load()}={}){
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const ready=x=>{try{return added(x)&&!!x.source.ready(s.settings||{});}catch{return false;}};
 return {
  all:()=>sources,
  // Added apps that provide metrics, whether connected or not (for «подключите …» questions).
  added:()=>sources.filter(added),
  ready:()=>sources.filter(ready),
  find:id=>sources.find(x=>x.id===id)||null,
  // Every name a request may call a source by: its name, its id and the names it gives itself.
  names:x=>{let own=[];try{own=typeof x.source.names==='function'?x.source.names(s.settings||{})||[]:[];}catch{own=[];}return [...new Set([x.name,x.id,...own].filter(n=>typeof n==='string'&&n.trim()))];},
  isReady:ready
 };
}

// A source's answer is checked before it reaches the card: known metrics, ISO dates, finite values.
function normalize(id,answer){
 const out=[];
 for(const x of answer?.series||[]){
  if(!METRICS.includes(x?.metric)||!Array.isArray(x.series))continue;
  const points=x.series.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p?.date)&&Number.isFinite(Number(p.value))).map(p=>({date:p.date,value:Number(p.value)}));
  out.push({source:id,metric:x.metric,unit:String(x.unit||'users'),series:points,dimensions:x.dimensions||{}});
 }
 return out;
}
module.exports={KIND,METRICS,load,create,normalize};
