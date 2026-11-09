// Chat routes: an added app's own handling of a chat request at a fixed point of Petya's request pipeline
// (src/converse.cjs), so moving a handler from the core into an app changes no order. An app declares
//   "provides": { "chat-route": "<file>.cjs" }   (or a list of files)
// and each file exports {id, stage?, order?, by?, ready?(settings), async turn(services, command, context) → turn
// result | null, failure?(services, {service, command, reason}) → turn result | null}. Routes of a stage are tried in
// `order` (then id) while their app is added (and ready); the first non-null result answers.
// `stage` is the point of the pipeline, in this order:
//   people     — first, before agents and plugins (lists of people from services)
//   screen     — before context discovery (reading a service's open window when its API is unavailable)
//   send       — after project memory (a request to send something to a service, confirmed by the user)
//   digest     — after the team fill (what is new in a service)
//   media      — after the access offer (a picture or video kept from a service's messages)
//   sync       — after media (refresh a service on request)
//   reference  — after the build and review flows: a context reference («посмотри, что не так») with nothing
//                attached nor a recent chat (context.contextual), or a question about a service's open discussion
//   app        — the default (no `stage`): after the web search shortcut, before Petya's own shortcuts (undo, the daily
//                summary, learned commands) and the tool router. Example: «Почта» (src/extensions/mail/chat-route.cjs).
// `context` = {stage, choice, background, contextual}. `by` labels the answer when the route does not (and the
// recorded message, through the pipeline's `via`). `failure` is asked when a request failed because its service is
// unreachable (src/connection-failure.cjs): a route may answer another way (e.g. from the service's open window).
//
// "answer-context": {id, key, legacy?, ready?(settings), matches(command, topic) → bool, async rows(services, command,
//   topic) → {rows, stop?: text}, clarify?: text}
//   Saved service data the local model answers from when the question is about that service («что писали в
//   мессенджере?»): `rows` go into the model's reference data under `key`; `stop` answers instead of the model (nothing
//   saved yet, no model); `clarify` is the question when the model did not understand. The topic remembers the match
//   (`topic.answerContexts`; `legacy` names the topic flag older chats have).
//
// Only routes of added apps run: without the app, its requests go on to the app offer
// (src/features/extension-offers.cjs) like any other missing app.
const KIND='chat-route';
const STAGES=['people','screen','send','digest','media','sync','reference','app'];
const registry=()=>require('../extension-registry.cjs');
function scan(kind,check,dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===kind).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||(p.ready!==undefined&&typeof p.ready!=='function')||!check(p)){
   const error=Error('Invalid '+kind+' '+x.extension+'/'+x.file+(kind===KIND?': {id, stage?, order?, ready?(settings), turn(services, command)}':''));
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,name:x.name,route:p,provider:p}];
 }).sort((a,b)=>(a.route.order??100)-(b.route.order??100)||a.id.localeCompare(b.id));
 return dir?build():registry().cached(kind,build);
}
const load=dir=>scan(KIND,p=>typeof p.turn==='function'&&(p.stage===undefined||STAGES.includes(p.stage))&&(p.failure===undefined||typeof p.failure==='function'),dir);
const routes=load;
const contexts=dir=>scan('answer-context',p=>typeof p.key==='string'&&/^[a-z][A-Za-z0-9]{0,40}$/.test(p.key)&&typeof p.matches==='function'&&typeof p.rows==='function',dir);
const ready=(x,settings={})=>{if(x.setting&&settings[x.setting]!=='true')return false;try{return typeof x.route.ready!=='function'||!!x.route.ready(settings);}catch{return false;}};
const stageOf=x=>x.route.stage||'app';
const label=(x,result)=>{if(result&&typeof result==='object'&&!result.by&&x.route.by)result.by=x.route.by;return result;};
// The first answer of an added app's route at `stage`, or null. `context.via` (the pipeline's labeller) also marks the
// recorded answer with the route's `by`.
async function run(s,stage,command,{via,...context}={},{routes:fixed}={}){
 if(!STAGES.includes(stage))throw Error('Unknown chat route stage '+stage);
 for(const x of (fixed||load()).filter(x=>stageOf(x)===stage&&ready(x,s?.settings||{}))){
  const result=await x.route.turn(s,command,{...context,stage});
  if(result)return x.route.by&&typeof via==='function'?via(x.route.by,result):label(x,result);
 }
 return null;
}
// The default point (stage `app`).
const turn=(s,command,{routes:fixed}={})=>run(s,'app',command,{},{routes:fixed});
const has=(s,stage,{routes:fixed}={})=>(fixed||load()).some(x=>stageOf(x)===stage&&ready(x,s?.settings||{}));
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
// The same, bound to live services (tests and callers that keep one object).
const create=(s,options={})=>({stages:STAGES,has:stage=>has(s,stage,options),run:(stage,command,context)=>run(s,stage,command,context,options),
 failure:(service,command,reason)=>failure(s,service,command,reason,options),answerContext:(command,topic)=>answerContext(s,command,topic,options)});
module.exports={KIND,STAGES,load,routes,contexts,ready,turn,run,has,failure,answerContext,create};
