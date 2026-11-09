// Chat routes: an added app's own handling of a chat request at a fixed point of Petya's request pipeline
// (src/converse.cjs). Unlike `feature.turn` (tried first, before Petya's handlers), a route keeps the place a request
// used to have when Petya's core answered it, so moving a handler into an app changes no order.
// An app declares
//   "provides": { "chat-route": "<file>.cjs" }
// and the file exports the short form
//   {id, order?, ready?(settings), async turn(services, command, helpers) → turn result | null}
// or the routed form
//   {id, stage?, order?, ready?(settings), handlesOff?, foreground?, capability?, resume?, route?(text),
//    async run(services, route, {text, pipeline, background}) → turn result | null}
// - `stage` — where the pipeline asks it, in pipeline order: 'commands' (after the chat extension replies, before the
//   attachment and Slack flows), 'builds' (right before the Slack log review) or 'shortcuts' (the default: after the
//   web search shortcut, before Petya's own shortcuts — undo, the daily summary, learned commands — and the tool
//   router). Inside a stage: `order` (default 100), then id. The first non-null result answers.
// - `ready(settings)` — besides being added (its `setting` on), whether it is ready to answer.
// - `route(text)` — synchronous and pure: the request this app takes ({...} any object) or null. Without `route`,
//   `run`/`turn` is called for every request at its stage and returns null to pass.
// - `run(services, route, {text, pipeline, background})` — `pipeline(text)` re-enters the whole pipeline.
// - `foreground: true` — what `route` takes runs inline, never as a background chat job (src/chat-jobs.cjs).
// - `capability: {id, says, examples, reads?(route), accepts?(text)}` — an entry of the meaning router
//   (src/capabilities.cjs): the restated request is accepted by `accepts(text)`, or else when `route` takes it (and
//   `reads(route)` is true, when given).
// - `resume: {kind, answer(services, restart) → (answer) → turn}` — continues a saved clarification whose
//   `restart.kind` is `kind` after a restart (src/features/clarification-runtime.cjs).
// - `handlesOff: true` — asked even while its app is not added (the app answers that itself, e.g. offers to
//   enable it).
// Core code never names an app's route; it asks this registry at the stage.
const KIND='chat-route';
const STAGES=['commands','builds','shortcuts'];
const registry=()=>require('../extension-registry.cjs');
const stageOf=x=>x.route.stage||'shortcuts';
const byOrder=(a,b)=>STAGES.indexOf(stageOf(a))-STAGES.indexOf(stageOf(b))||(a.route.order??100)-(b.route.order??100)||a.id.localeCompare(b.id);
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const bad=!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||p.stage!==undefined&&!STAGES.includes(p.stage)
   ||typeof p.run!=='function'&&typeof p.turn!=='function'||p.route!==undefined&&typeof p.route!=='function'||p.ready!==undefined&&typeof p.ready!=='function'
   ||p.capability!==undefined&&(typeof p.capability?.id!=='string'||typeof p.capability.says!=='string'||!Array.isArray(p.capability.examples)||typeof p.route!=='function'&&typeof p.capability.accepts!=='function')
   ||p.resume!==undefined&&(typeof p.resume?.kind!=='string'||typeof p.resume.answer!=='function');
  if(bad){
   const error=Error('Invalid chat route '+x.extension+'/'+x.file+': {id, stage?: '+STAGES.join('|')+', order?, ready?(settings), turn(services, command) | route?(text) + run(services, route, helpers)}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,route:p}];
 }).sort(byOrder);
 return dir?build():registry().cached(KIND,build);
}
// Added (or handlesOff) and ready.
function ready(x,settings={}){
 if(!x.route.handlesOff&&x.setting&&settings?.[x.setting]!=='true')return false;
 try{return typeof x.route.ready!=='function'||!!x.route.ready(settings||{});}catch{return false;}
}
const take=(x,text)=>{if(typeof x.route.route!=='function')return {};try{return x.route.route(String(text||''))||null;}catch{return null;}};
// The first answer of a route at `stage` (default 'shortcuts') that takes the request, or null.
async function turn(s,command,{stage='shortcuts',pipeline,background=false,routes}={}){
 for(const x of routes?[...routes].sort(byOrder):load()){
  if(stageOf(x)!==stage||!ready(x,s?.settings||{}))continue;
  const route=take(x,command);if(!route)continue;
  const helpers={text:command,pipeline,background};
  const result=typeof x.route.run==='function'?await x.route.run(s,route,helpers):await x.route.turn(s,command,helpers);
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
module.exports={KIND,STAGES,load,ready,turn,claims,capabilities,resume};
