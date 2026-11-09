// Dialogue kinds: a chat subject an app reads data for, answered in the open chat like Petya's own «bugs» and
// «tasks» (src/dialogue.cjs): the chat takes the kind for its follow-ups («обнови», «а за вчера?»), a failed read keeps
// a retry button, and the topic router may pick the kind. An app declares
//   "provides": { "dialogue-kind": "<file>.cjs" }
// and the file exports
//   {id, title, by, label, service?, router?, routerNote?, detect?(text) → bool, read(services, command, topic, context)}
// — `title`: the new chat's title; `by`: the answer's signature; `label`: what the retry button retries («запрос к …»);
// `service`: Petya's service module behind it (connection offers for a chat of this kind); `router`: its line for the
// topic router («<id> — <router>»), `routerNote`: the router's note on what is talk, not this kind; `detect(text)`:
// the request is clearly of this kind (checked where Petya's own patterns are); `read` returns a turn result
// ({text, question?, options?, field?, data?, extensionData?, error?}). Kinds count only while their app is added.
// Example: «Google Play» answers ANR (src/extensions/google-play/anr-kind.cjs).
const KIND='dialogue-kind';
const ID=/^[a-z][a-z0-9-]{1,30}$/;
const RESERVED=['chat','bugs','tasks','files'];
const registry=()=>require('../extension-registry.cjs');
let bound=null;
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const text=k=>typeof p[k]==='string'&&p[k].trim();
  if(!p||typeof p.id!=='string'||!ID.test(p.id)||RESERVED.includes(p.id)||!text('title')||!text('by')||!text('label')||typeof p.read!=='function'||(p.detect!==undefined&&typeof p.detect!=='function')){
   const error=Error('Invalid dialogue kind '+x.extension+'/'+x.file+': {id, title, by, label, service?, router?, routerNote?, detect?(text), read(services, command, topic, context)}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,kind:p}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
// The live services (Petya's settings decide which apps are added). Without them (unit tests of the dialogue) every
// registered kind counts.
const bind=s=>{bound=s;};
function list({kinds}={}){
 const settings=bound?.settings;
 return (kinds||load()).filter(x=>!settings||!x.setting||settings[x.setting]==='true').map(x=>x.kind);
}
const get=(id,options)=>typeof id==='string'?list(options).find(k=>k.id===id)||null:null;
// The kind a request clearly asks for, or null.
function detect(text,options){for(const k of list(options)){try{if(typeof k.detect==='function'&&k.detect(String(text||'')))return k.id;}catch{}}return null;}
// The service module behind a kind whether or not its app is added (a chat of that kind offers to connect it).
function serviceOf(id,{kinds}={}){const x=(kinds||load()).find(x=>x.kind.id===id);return typeof x?.kind.service==='string'?x.kind.service:'';}
// A reader with Petya's own signature (command, topic, context), or null.
function reader(id,options){const k=get(id,options);return k?(command,topic,context)=>k.read(bound,command,topic,context):null;}
module.exports={KIND,RESERVED,load,bind,list,get,detect,reader,serviceOf,name:'dialogueKinds',defaults:{},validate(){},setup(s){bind(s);return {};}};
