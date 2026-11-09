// The meeting recorder: system audio (what the meeting plays) and, if allowed, the microphone, captured by a
// separate renderer (src/meeting-capture.cjs) and saved through MeetingRecording. It knows no meeting app:
// meeting sources (src/features/meeting-sources.cjs) tell it when a meeting is going on and who is talking.
// `meetingAutoRecord`: 'auto' starts when a source sees a meeting, 'ask' offers «Записать встречу», 'off' only
// records when the user asks. A manual start («Слушать встречу») needs no source at all.
const {MeetingMonitor}=require('./meeting-monitor.cjs');
const {SOUND}=require('./meeting-talk.cjs');
const idle=sources=>sources?.list?.().length?'Ожидаю встречу.':'Запись встречи — по кнопке «Слушать встречу».';
class LocalMeeting {
 // place(state) → {record, note}: which company the meeting belongs to (src/meeting-company.cjs); record:false means
 // another company takes it over, so this one neither offers nor starts the recording.
 // blocked() → a reason not to start (another company records a meeting now, src/meeting-carry.cjs), or ''.
 constructor({settings,sources=null,recording,createCapture,emit,place=null,ended=null,blocked=null}){
  Object.assign(this,{settings,sources,recording,createCapture,emit,place,ended,blocked});this.phase='idle';this.present=false;this.found=null;
  this.monitor=new MeetingMonitor({
   inspect:async()=>{let state;try{state=this.sources?await this.sources.detect():{active:false};}catch(error){if(this.capture)return {active:true};throw error;}
    if(state.active){this.found=state;if(!this.present){this.present=true;this.emit(this.snapshot());}}return state;},
   start:async state=>{
    if(this.blocked?.())return;
    let placed={record:true,note:''};if(this.place){try{placed=await this.place(state)||placed;}catch{/* recorded here */}}
    if(!placed.record){this.present=false;this.found=null;return;}
    this.publish('detected','Обнаружена встреча'+(state?.app?' · '+state.app:'')+'.'+(placed.note?' '+placed.note:''));if(settings().meetingAutoRecord==='auto')await this.start();},
   stop:async()=>{await this.stop(false);this.present=false;this.found=null;this.ended?.();this.publish('idle',idle(this.sources));}
  });
 }
 snapshot(){return {id:this.id||'local-observer',phase:this.phase,present:this.present,active:!!this.capture,busy:!!this.capture||!!this.starting,mode:this.settings().meetingAutoRecord,app:this.found?.app||'',speakerNote:this.found?.speakerNote||'',speakerAccess:this.found?.speakerAccess||'',sources:this.sources?.list?.().map(x=>x.name)||[],message:this.message||idle(this.sources),canStart:this.phase==='detected'||this.phase==='stopped'&&this.present,canRetry:this.phase==='error'};}
 publish(phase,message){this.phase=phase;this.message=message;this.emit(this.snapshot());}
 async tick(){
  try{
   // A recording started without a meeting seen by a source runs until the user stops it.
   if(this.capture&&!this.followed)return;
   const enabled=this.settings().meetingAutoRecord!=='off'&&!!this.sources?.list?.().length;
   if(!enabled&&!this.capture){await this.monitor.tick(false);if(this.present||this.phase==='detected'){this.present=false;this.found=null;this.publish('idle',idle(this.sources));}return;}
   await this.monitor.tick(true);
   if(this.monitor.misses>=3){
    if(this.capture&&!this.monitor.active)await this.stop(false);
    if(this.present&&!this.capture){this.present=false;this.found=null;this.publish('idle',idle(this.sources));}
   }
  }catch(e){if(!this.capture)this.publish('error',e.message);}
 }
 async start(){
  if(this.starting)return this.starting;if(this.capture)return this.snapshot();
  const reason=this.blocked?.();if(reason)throw Error(reason);
  this.starting=this.begin();try{return await this.starting;}finally{this.starting=null;}
 }
 async begin(){
  const cfg=this.settings();
  // A source that sees the meeting now names it and its speakers; without one the recording is plain system audio.
  let seen=this.found;
  if(!seen&&this.sources?.list?.().length){try{const state=await this.sources.detect();if(state.active)seen=state;}catch{/* recorded without the source */}}
  this.source=seen?.source?.id||'';this.followed=!!seen;
  this.id=this.recording.begin({title:seen?.title||'',app:seen?.app||''});this.publish('starting','Подключаю системный звук и микрофон…');
  if(this.source)this.sources.begin(this.source);
  const label=item=>{const name=this.source?this.sources.speaker(this.source,item.at,item.endedAt):'';return name?{...item,speaker:name}:item;};
  const capture=this.createCapture({append:(source,item)=>this.recording.append(this.id,source,source===SOUND?label(item):item),onError:error=>{this.stop(true).then(()=>this.publish('error',error.message)).catch(()=>this.publish('error',error.message));}});this.capture=capture;
  try{await capture.start({microphone:cfg.meetingCaptureMic!=='false',deviceId:cfg.microphoneDeviceId||''});this.publish('recording','Записываю встречу отдельно от чатов. Обработка начнётся после завершения.');return this.snapshot();}
  catch(e){this.end();capture.destroy();this.capture=null;this.recording.finish(this.id);this.publish('error',e.message);throw e;}
 }
 end(){if(this.source)this.sources.end(this.source);this.source='';this.followed=false;}
 async stop(manual=true){
  if(manual)this.monitor.pause();
  if(this.stopping)return this.stopping;
  this.stopping=(async()=>{if(this.starting)await this.starting.catch(()=>{});const capture=this.capture;if(!capture)return this.snapshot();try{await capture.finish();}finally{this.end();this.capture=null;this.recording.finish(this.id);this.publish('stopped','Запись завершена. Расшифровка сохраняется в память компании.');}return this.snapshot();})();
  try{return await this.stopping;}finally{this.stopping=null;}
 }
}
module.exports={LocalMeeting};
