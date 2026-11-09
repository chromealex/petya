// Chat routes: an app's own chat handling at a fixed point of Petya's request pipeline (src/converse.cjs), for apps
// whose requests must be checked exactly where Petya's own handler used to run (not first, like `feature.turn`).
// An app declares
//   "provides": { "chat-route": "<file>.cjs" }
// and the file exports
//   {id, stage, order?, handlesOff?, foreground?, capability?, resume?, route?(text), async run(services, route, {text, pipeline, background})}
// - `stage` — where the pipeline asks it: 'commands' (after the chat extension replies, before the attachment and
//   Slack flows) or 'builds' (before Slack log review). Inside a stage: `order` (default 100), then id.
// - `route(text)` — synchronous and pure: the request this app takes ({...} any object) or null. Without `route`,
//   `run` is called for every request at its stage and returns null to pass.
// - `run(services, route, {text, pipeline, background})` — the turn result, or null to let the pipeline go on.
//   `pipeline(text)` re-enters the whole pipeline (for answers to its own questions).
// - `foreground: true` — what `route` takes runs inline, never as a background chat job (src/chat-jobs.cjs).
// - `capability: {id, says, examples, reads?(route), accepts?(text)}` — an entry of the meaning router (src/capabilities.cjs):
//   the restated request is accepted by `accepts(text)`, or else when `route` takes it (and `reads(route)` is true, when given).
// - `resume: {kind, answer(services, restart) → (answer) → turn}` — continues a saved clarification whose
//   `restart.kind` is `kind` after a restart (src/features/clarification-runtime.cjs).
// - `handlesOff: true` — asked even while its app is not added (the app answers that itself, e.g. offers to
//   enable it); otherwise a route counts only while its app is added.
// Core code never names an app's route; it asks this registry at the stage.
const KIND='chat-route';
const STAGES=['commands','builds'];
const registry=()=>require('../extension-registry.cjs');
const byOrder=(a,b)=>STAGES.indexOf(a.route.stage)-STAGES.indexOf(b.route.stage)||(a.route.order??100)-(b.route.order??100)||a.id.localeCompare(b.id);
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const bad=!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||!STAGES.includes(p.stage)||typeof p.run!=='function'||p.route!==undefined&&typeof p.route!=='function'
   ||p.capability!==undefined&&(typeof p.capability?.id!=='string'||typeof p.capability.says!=='string'||!Array.isArray(p.capability.examples)||typeof p.route!=='function'&&typeof p.capability.accepts!=='function')
   ||p.resume!==undefined&&(typeof p.resume?.kind!=='string'||typeof p.resume.answer!=='function');
  if(bad){
   const error=Error('Invalid chat route '+x.extension+'/'+x.file+': {id, stage: '+STAGES.join('|')+', route?(text), run(services, route, helpers)}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,route:p}];
 }).sort(byOrder);
 return dir?build():registry().cached(KIND,build);
}
const added=(x,settings)=>x.route.handlesOff||!x.setting||settings?.[x.setting]==='true';
const take=(x,text)=>{if(typeof x.route.route!=='function')return {};try{return x.route.route(String(text||''))||null;}catch{return null;}};
// The turn of the first route at `stage` that takes the request, or null.
async function turn(s,stage,text,{pipeline,background=false,routes}={}){
 for(const x of routes?[...routes].sort(byOrder):load()){
  if(x.route.stage!==stage||!added(x,s?.settings))continue;
  const route=take(x,text);if(!route)continue;
  const result=await x.route.run(s,route,{text,pipeline,background});
  if(result)return result;
 }
 return null;
}
// Whether a foreground route takes the request (it must not become a background chat job).
function claims(text,{routes}={}){
 try{return (routes||load()).some(x=>x.route.foreground&&typeof x.route.route==='function'&&!!take(x,text));}catch{return false;}
}
// Meaning-router entries of the routes: {id, says, examples, accepts(text)}.
function capabilities({routes}={}){
 let list=[];try{list=routes||load();}catch{return [];}
 return list.filter(x=>x.route.capability).map(x=>{const c=x.route.capability;return {id:c.id,says:c.says,examples:c.examples.slice(0,6),
  accepts:t=>{if(typeof c.accepts==='function')return !!c.accepts(String(t||''));const r=take(x,t);return !!r&&(typeof c.reads!=='function'||!!c.reads(r));}};});
}
// The continuation of a saved clarification of `restart.kind`, or null.
function resume(s,restart,{routes}={}){
 let list=[];try{list=routes||load();}catch{return null;}
 const x=list.find(x=>x.route.resume?.kind===restart?.kind);
 return x?x.route.resume.answer(s,restart):null;
}
module.exports={KIND,STAGES,load,turn,claims,capabilities,resume};
