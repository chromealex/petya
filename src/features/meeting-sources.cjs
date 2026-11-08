// Meeting sources: apps that know when a meeting is going on on this computer and, optionally, who is talking.
// Petya itself knows no meeting app. An extension declares in its extension.json
//   "provides": { "meeting-source": "meeting-source.cjs" }
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?, detect(context) -> {active, title?, app?, windowTitle?} | null,
//     begin?(context), end?(context), speakers?(context) -> [{name, start, end}], participants?(context) -> [names],
//     joinLinks?: [RegExp], recognizeLink?(url) -> {kind, key, url, name?} | null,
//     summaryMail?(meeting, services) -> {from, subject, text} | null }
// `context` is {settings, dataRoot, from?, to?}. A source counts only while its extension is added (the catalog
// switch). With no source Petya still records a meeting when the user asks («Слушать встречу»): system audio and
// the microphone, without automatic start and without speaker names.
// A dedicated registry, not an app link: sources are polled by the recorder, never shown as card buttons.
const path=require('node:path');
const KIND='meeting-source';

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.detect!=='function')throw Error('Invalid meeting source '+x.extension+'/'+x.file);
  for(const hook of ['begin','end','speakers','participants','recognizeLink','summaryMail'])if(p[hook]!==undefined&&typeof p[hook]!=='function')throw Error('Invalid meeting source '+x.extension+'/'+x.file);
  if(p.joinLinks!==undefined&&(!Array.isArray(p.joinLinks)||p.joinLinks.some(r=>!(r instanceof RegExp))))throw Error('Invalid meeting source '+x.extension+'/'+x.file);
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// The registry bound to live services: which extensions are added is read at call time.
function create(s,{sources=load()}={}){
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const context=(extra={})=>({settings:s.settings||{},dataRoot:s.dataRoot||'',...extra});
 const list=()=>sources.filter(added);
 // The first added source that sees a meeting now: {active:true, source:{id,name}, title, app, windowTitle}, or
 // {active:false}. A source that fails is reported only when no other source sees a meeting.
 async function detect(){
  let failure=null;
  for(const x of list()){
   let state;
   try{state=await x.source.detect(context());}catch(error){failure=failure||error;continue;}
   if(state?.active)return {...state,active:true,source:{id:x.id,name:x.name},app:state.app||x.name};
  }
  if(failure)throw failure;
  return {active:false};
 }
 const find=id=>list().find(x=>x.id===id)||null;
 const call=(x,hook,extra)=>{try{return typeof x?.source[hook]==='function'?x.source[hook](context(extra)):undefined;}catch{return undefined;}};
 // Who talked between `from` and `to`, by the source that saw the meeting: the name with the most overlap.
 function speaker(id,from,to){
  const rows=call(find(id),'speakers',{from,to});if(!Array.isArray(rows))return '';
  const time=new Map();
  for(const r of rows){if(!r||typeof r.name!=='string'||!r.name.trim())continue;const a=Math.max(from-1500,Number(r.start)),b=Math.min(to+1500,Number(r.end));if(b>=a)time.set(r.name.trim(),(time.get(r.name.trim())||0)+(b-a)+1);}
  const best=[...time].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  return best.length<=80?best:'';
 }
 // Names the sources saw in meetings (participant lists), for matching people to the team.
 function participants(){return [...new Set(list().flatMap(x=>{const r=call(x,'participants');return Array.isArray(r)?r.filter(n=>typeof n==='string'&&n.trim()).map(n=>n.trim()):[];}))];}
 // Which added source a join link belongs to.
 function recognize(url){
  const text=String(url||'');
  for(const x of list()){
   let r=null;try{r=typeof x.source.recognizeLink==='function'?x.source.recognizeLink(text):null;}catch{r=null;}
   if(r)return {...r,source:x.id,name:r.name||x.name};
   if((x.source.joinLinks||[]).some(re=>{re.lastIndex=0;return re.test(text);}))return {source:x.id,name:x.name,url:text};
  }
  return null;
 }
 // The letter a meeting service mailed about this meeting (its own transcript or summary), if a source finds one.
 async function summaryMail(meeting,services){
  for(const x of list()){
   if(typeof x.source.summaryMail!=='function')continue;
   try{const r=await x.source.summaryMail(meeting,services);if(r?.text)return {from:String(r.from||x.name),subject:String(r.subject||''),text:String(r.text)};}catch{}
  }
  return null;
 }
 return {
  list:()=>list().map(({id,extension,name})=>({id,extension,name})),detect,speaker,participants,recognize,summaryMail,
  begin:id=>call(find(id),'begin'),end:id=>call(find(id),'end')
 };
}

module.exports={name:'meetingSources',defaults:{},validate(){},KIND,load,create,directory:path.join(__dirname,'../extensions'),
 setup(s){return {meetingSources:create(s)};}};
