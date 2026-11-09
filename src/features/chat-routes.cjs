// Chat routes: an added app's own handling of a chat request at a fixed point of Petya's request pipeline
// (src/converse.cjs) — after the web search shortcut and before Petya's own shortcuts (undo, the daily summary,
// learned commands) and the tool router. Unlike `feature.turn` (tried first, before Petya's handlers), a route keeps
// the place a request used to have when Petya's core answered it, so moving a handler into an app changes no order.
// An app declares
//   "provides": { "chat-route": "<file>.cjs" }
// and the file exports {id, order?, ready?(settings), async turn(services, command) → turn result | null}. Routes are
// tried in `order` (then id) while their app is added (and ready); the first non-null result answers. Example: «Почта»
// answers its rules through src/extensions/mail/chat-route.cjs.
const KIND='chat-route';
const registry=()=>require('../extension-registry.cjs');
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||typeof p.turn!=='function'||(p.ready!==undefined&&typeof p.ready!=='function')){
   const error=Error('Invalid chat route '+x.extension+'/'+x.file+': {id, order?, ready?(settings), turn(services, command)}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,route:p}];
 }).sort((a,b)=>(a.route.order??100)-(b.route.order??100)||a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
const ready=(x,settings={})=>{if(x.setting&&settings[x.setting]!=='true')return false;try{return typeof x.route.ready!=='function'||!!x.route.ready(settings);}catch{return false;}};
// The first answer of an added app's route, or null.
async function turn(s,command,{routes}={}){
 for(const x of (routes||load()).filter(x=>ready(x,s?.settings||{}))){
  const reply=await x.route.turn(s,command);
  if(reply)return reply;
 }
 return null;
}
module.exports={KIND,load,ready,turn};
