// Chat routes: an added app's own handling of a chat request at a fixed point of Petya's request pipeline
// (src/converse.cjs). Unlike `feature.turn` (tried first, before Petya's handlers), a route keeps the place a request
// used to have when Petya's core answered it, so moving a handler into an app changes no order.
// An app declares
//   "provides": { "chat-route": "<file>.cjs" }   (or a list of files)
// and each file exports the short form
//   {id, stage?, order?, by?, ready?(settings), handlesOff?, async turn(services, command, context) → turn result | null,
//    failure?(services, {service, command, reason}) → turn result | null}
// or the routed form
//   {id, stage?, order?, by?, ready?(settings), handlesOff?, foreground?, capability?, resume?, route?(text),
//    async run(services, route, context) → turn result | null}
// `stage` is the point of the pipeline, in this order:
//   people     — first, before agents and plugins (lists of people from services)
//   commands   — after the chat extension replies, before the attachment and messenger flows
//   screen     — before context discovery (reading a service's open window when its API is unavailable)
//   send       — after project memory (a request to send something to a service, confirmed by the user)
//   digest     — after the team fill (what is new in a service)
//   media      — after the access offer (a picture or video kept from a service's messages)
//   sync       — after media (refresh a service on request)
//   builds     — the build flows, right before the service discussion review
//   reference  — a context reference («посмотри, что не так») with nothing attached nor a recent chat
//                (context.contextual), or a question about a service's open discussion
//   app        — the default (no `stage`): after the web search shortcut, before Petya's own shortcuts (undo, the daily
//                summary, learned commands) and the tool router. Example: «Почта» (src/extensions/mail/chat-route.cjs).
//                ('shortcuts' is the same stage under its older name.)
// Inside a stage: `order` (default 100), then id. The first non-null result answers.
// - `ready(settings)` — besides being added (its `setting` on), whether it is ready to answer.
// - `handlesOff: true` — asked even while its app is not added (the app answers that itself, e.g. offers to enable it).
// - `route(text)` — synchronous and pure: the request this app takes ({...} any object) or null. Without `route`,
//   `run`/`turn` is called for every request at its stage and returns null to pass.
// - `context` = {stage, text, choice, background, contextual, pipeline}: `pipeline(text)` re-enters the whole pipeline.
// - `by` labels the answer when the route does not (and the recorded message, through the pipeline's `via`).
// - `foreground: true` — what `route` takes runs inline, never as a background chat job (src/chat-jobs.cjs).
// - `capability: {id, says, examples, reads?(route), accepts?(text)}` — an entry of the meaning router
//   (src/capabilities.cjs): the restated request is accepted by `accepts(text)`, or else when `route` takes it (and
//   `reads(route)` is true, when given).
// - `resume: {kind, answer(services, restart) → (answer) → turn}` — continues a saved clarification whose
//   `restart.kind` is `kind` after a restart (src/features/clarification-runtime.cjs).
// - `failure` is asked when a request failed because its service is unreachable (src/connection-failure.cjs): a route
//   may answer another way (e.g. from the service's open window).
//
// "answer-context": {id, key, legacy?, ready?(settings), matches(command, topic) → bool, async rows(services, command,
//   topic) → {rows, stop?: text}, clarify?: text}
//   Saved service data the local model answers from when the question is about that service («что писали в
//   мессенджере?»): `rows` go into the model's reference data under `key`; `stop` answers instead of the model (nothing
//   saved yet, no model); `clarify` is the question when the model did not understand. The topic remembers the match
//   (`topic.answerContexts`; `legacy` names the topic flag older chats have).
//
// Core code never names an app's route; it asks this registry at the stage. Without the app, its requests go on to
// the app offer (src/features/extension-offers.cjs) like any other missing app.
const KIND='chat-route';
const STAGES=['people','commands','screen','send','digest','media','sync','builds','reference','app'];
const ALIAS={shortcuts:'app'};
const registry=()=>require('../extension-registry.cjs');
const stageName=stage=>ALIAS[stage]||stage||'app';
const stageOf=x=>stageName(x.route.stage);
const byOrder=(a,b)=>STAGES.indexOf(stageOf(a))-STAGES.indexOf(stageOf(b))||(a.route.order??100)-(b.route.order??100)||a.id.localeCompare(b.id);
function scan(kind,check,dir,describe){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===kind).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||(p.ready!==undefined&&typeof p.ready!=='function')||!check(p)){
   const error=Error('Invalid '+kind+' '+x.extension+'/'+x.file+(describe?': '+describe:''));
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,name:x.name,route:p,provider:p}];
 }).sort(byOrder);
 return dir?build():registry().cached(kind,build);
}
const validRoute=p=>(p.stage===undefined||STAGES.includes(stageName(p.stage)))
 &&(typeof p.run==='function'||typeof p.turn==='function')&&(p.route===undefined||typeof p.route==='function')
 &&(p.failure===undefined||typeof p.failure==='function')
 &&(p.capability===undefined||typeof p.capability?.id==='string'&&typeof p.capability.says==='string'&&Array.isArray(p.capability.examples)&&(typeof p.route==='function'||typeof p.capability.accepts==='function'))
 &&(p.resume===undefined||typeof p.resume?.kind==='string'&&typeof p.resume.answer==='function');
const load=dir=>scan(KIND,validRoute,dir,'{id, stage?: '+STAGES.join('|')+', order?, ready?(settings), turn(services, command, context) | route?(text) + run(services, route, context)}');
const routes=load;
const contexts=dir=>scan('answer-context',p=>typeof p.key==='string'&&/^[a-z][A-Za-z0-9]{0,40}$/.test(p.key)&&typeof p.matches==='function'&&typeof p.rows==='function',dir);
// Added (or handlesOff) and ready.
function ready(x,settings={}){
 if(!x.route.handlesOff&&x.setting&&settings?.[x.setting]!=='true')return false;
 try{return typeof x.route.ready!=='function'||!!x.route.ready(settings||{});}catch{return false;}
}
const take=(x,text)=>{if(typeof x.route.route!=='function')return {};try{return x.route.route(String(text||''))||null;}catch{return null;}};
const label=(x,result)=>{if(result&&typeof result==='object'&&!result.by&&x.route.by)result.by=x.route.by;return result;};
// The first answer of an added app's route at `stage`, or null. `context.via` (the pipeline's labeller) also marks the
// recorded answer with the route's `by`.
async function run(s,stage,command,{via,...context}={},{routes:fixed}={}){
 stage=stageName(stage);
 if(!STAGES.includes(stage))throw Error('Unknown chat route stage '+stage);
 for(const x of fixed?[...fixed].sort(byOrder):load()){
  if(stageOf(x)!==stage||!ready(x,s?.settings||{}))continue;
  const route=take(x,command);if(!route)continue;
  const ctx={...context,stage,text:command};
  const result=typeof x.route.run==='function'?await x.route.run(s,route,ctx):await x.route.turn(s,command,ctx);
  if(result)return x.route.by&&typeof via==='function'?via(x.route.by,result):label(x,result);
 }
 return null;
}
// The same, with the stage in the options (default 'app').
const turn=(s,command,{stage='app',routes:fixed,...context}={})=>run(s,stage,command,context,{routes:fixed});
const has=(s,stage,{routes:fixed}={})=>(fixed||load()).some(x=>stageOf(x)===stageName(stage)&&ready(x,s?.settings||{}));
async function failure(s,service,command,reason,{routes:fixed}={}){
 for(const x of (fixed||load()).filter(x=>typeof x.route.failure==='function'&&ready(x,s?.settings||{}))){
  const result=await x.route.failure(s,{service,command,reason});
  if(result)return label(x,result);
 }
 return null;
}
// The answer context for this question: {id, key, rows, stop?, clarify?} or null. A topic that once matched keeps it.
async function answerContext(s,command,topic,{contexts:fixed}={}){
 for(const x of (fixed||contexts()).filter(x=>ready(x,s?.settings||{}))){
  const p=x.provider,remembered=!!topic?.answerContexts?.includes(x.id)||!!(p.legacy&&topic?.[p.legacy]);
  let hit=false;try{hit=remembered||!!p.matches(command,topic);}catch{hit=false;}
  if(!hit)continue;
  if(topic&&!remembered)topic.answerContexts=[...new Set([...(topic.answerContexts||[]),x.id])];
  const found=await p.rows(s,command,topic)||{};
  return {id:x.id,key:p.key,rows:Array.isArray(found.rows)?found.rows:[],...found.stop?{stop:String(found.stop)}:{},...p.clarify?{clarify:String(p.clarify)}:{}};
 }
 return null;
}
// Whether a foreground route takes the request (it must not become a background chat job).
function claims(text,{routes:fixed}={}){
 try{return (fixed||load()).some(x=>x.route.foreground&&typeof x.route.route==='function'&&!!take(x,text));}catch{return false;}
}
// Meaning-router entries of the routes: {id, says, examples, accepts(text)}.
function capabilities({routes:fixed}={}){
 let list=[];try{list=fixed||load();}catch{return [];}
 return list.filter(x=>x.route.capability).map(x=>{const c=x.route.capability;return {id:c.id,says:c.says,examples:c.examples.slice(0,6),
  accepts:t=>{if(typeof c.accepts==='function')return !!c.accepts(String(t||''));const r=take(x,t);return !!r&&(typeof c.reads!=='function'||!!c.reads(r));}};});
}
// The continuation of a saved clarification of `restart.kind`, or null.
function resume(s,restart,{routes:fixed}={}){
 let list=[];try{list=fixed||load();}catch{return null;}
 const x=list.find(x=>x.route.resume?.kind===restart?.kind);
 return x?x.route.resume.answer(s,restart):null;
}
// The same, bound to live services (tests and callers that keep one object).
const create=(s,options={})=>({stages:STAGES,has:stage=>has(s,stage,options),run:(stage,command,context)=>run(s,stage,command,context,options),
 failure:(service,command,reason)=>failure(s,service,command,reason,options),answerContext:(command,topic)=>answerContext(s,command,topic,options)});
module.exports={KIND,STAGES,load,routes,contexts,ready,turn,run,has,failure,answerContext,create,claims,capabilities,resume};
