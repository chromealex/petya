// The live meeting stream as a service (src/meeting-stream.cjs; contract: docs/foundations/meeting-stream.md).
// Features use `services.meetingStream.subscribe(handler, {partials})`, which returns the unsubscribe function.
// Extensions declare a meeting listener in their extension.json
//   "provides": { "meeting-listener": "listener.cjs" }
// (the `provides` map read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, partials?: boolean, onEvent(event, context) }
// `context` is {meeting(), recent(limit), status()} — read-only views of the current meeting, no services: a listener
// that wants to act outside Petya does it through its own app, with the usual confirmations. A listener gets events
// only while its extension is added (the catalog switch), checked at every event.
// Only the recorder feeds the stream (`meetingStreamProducer`, used by src/features/meeting-memory.cjs): there are
// events only while the user records a meeting, and nothing is persisted here.
const path=require('node:path');
const {MeetingStream}=require('../meeting-stream.cjs');
const KIND='meeting-listener';

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.onEvent!=='function'||p.partials!==undefined&&typeof p.partials!=='boolean')throw Error('Invalid meeting listener '+x.extension+'/'+x.file);
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:x.name,listener:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

function create(s,{listeners=load(),stream=new MeetingStream()}={}){
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const view=Object.freeze({meeting:()=>stream.meeting(),recent:limit=>stream.recent(limit),status:()=>stream.status()});
 for(const x of listeners)stream.subscribe(event=>x.listener.onEvent(event,view),{partials:x.listener.partials===true,when:()=>added(x)});
 const api=Object.freeze({
  subscribe:(handler,options={})=>stream.subscribe(handler,{partials:!!options?.partials,lifecycle:options?.lifecycle!==false}),
  status:()=>stream.status(),meeting:()=>stream.meeting(),recent:limit=>stream.recent(limit),
  pause:()=>stream.pause(),resume:()=>stream.resume(),
  annotate:(meetingId,context)=>stream.annotate(meetingId,context),
  listeners:()=>listeners.filter(added).map(({id,extension,name})=>({id,extension,name}))
 });
 return {api,stream};
}

module.exports={name:'meetingStream',defaults:{},validate(){},KIND,load,create,directory:path.join(__dirname,'../extensions'),
 setup(s){
  const {api,stream}=create(s);
  return {meetingStream:api,meetingStreamProducer:stream,ipc:{status:()=>api.status(),pause:()=>{api.pause();return api.status();},resume:()=>{api.resume();return api.status();}}};
 }};
