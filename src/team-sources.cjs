// Where «Заполни команду» (src/team-fill.cjs) takes people from besides Jira and Petya's own notes: services that
// know the team (a workspace's channel members, profiles with job titles, the service's open window). An app declares
//   "provides": { "team-source": "<file>.cjs" }
// and the file exports {id, name, order?, ready(settings), scope?(settings, topic) → any,
//   async roster?(services, command) → [{member, evidence, source}] | null,
//   async profiles?(services, wanted:[{name, email}]) → {profiles, deleted?, complete, limited?, error?},
//   async screen?(services) → {title, text}}.
// `roster` answers null when the request is not for this source; `profiles` are the people's service profiles
// (src/team-enrich.cjs `enrich` copies titles, ids and contacts from them into empty fields); `screen` reads the
// service's open window when its API is limited. Only sources of added (and ready) apps are used.
const KIND='team-source';
const registry=()=>require('./extension-registry.cjs');
function load(dir){
 const build=()=>require('./features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const fn=k=>p[k]===undefined||typeof p[k]==='function';
  if(!p||typeof p.id!=='string'||typeof p.ready!=='function'||!['roster','profiles','screen','scope'].every(fn)){
   const error=Error('Invalid team source '+x.extension+'/'+x.file);
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,source:p}];
 }).sort((a,b)=>(a.source.order??100)-(b.source.order??100)||a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
const added=(x,settings={})=>!x.setting||settings[x.setting]==='true';
const ready=(x,settings={})=>{if(!added(x,settings))return false;try{return !!x.source.ready(settings);}catch{return false;}};
function create(s,{sources}={}){
 const all=()=>sources||load();
 return {
  // What the fill depends on: a change of any source's connection makes a pending fill stale.
  scope:topic=>all().filter(x=>added(x,s.settings)).map(x=>[x.id,x.source.scope?.(s.settings,topic)]),
  // The first source that takes the request; added but not connected sources answer too (they say what to connect).
  async roster(command){for(const x of all().filter(x=>added(x,s.settings)&&x.source.roster)){const rows=await x.source.roster(s,command);if(rows)return rows;}return null;},
  // Profiles of the first ready source that has them; an empty result when none does.
  async profiles(wanted){const x=all().find(x=>ready(x,s.settings)&&x.source.profiles);return x?x.source.profiles(s,wanted):{profiles:[],complete:false,limited:false,error:''};},
  hasScreen:()=>all().some(x=>added(x,s.settings)&&x.source.screen),
  async screen(){const x=all().find(x=>added(x,s.settings)&&x.source.screen);if(!x)throw Error('Нет приложения, окно которого можно прочитать.');return x.source.screen(s);}
 };
}
module.exports={KIND,load,create};
