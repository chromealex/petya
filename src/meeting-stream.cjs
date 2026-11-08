// The live meeting stream: while the user records a meeting, what is being said, as it is recognised, for features
// and extensions that react in real time. It is fed by the recorder (src/meeting-recording.cjs `observe`, lifecycle
// from src/features/meeting-memory.cjs) and knows no meeting app; the contract is docs/foundations/meeting-stream.md.
//
// Events (frozen objects, `seq` grows by one per event of the process):
//   {type:'transcript', meetingId, seq, utterance, start, end, speaker?, text, final, source:'sound'|'mic', lag}
//   {type:'started'|'context'|'paused'|'resumed'|'ended'|'lag', meetingId, seq, at, context, ...}
// A partial (final:false) is the text of an utterance that is still going on; its final (final:true) comes once and
// replaces every partial of the same `utterance`; nothing of that utterance follows its final.
// Nothing here is persisted: the last finals of the current meeting stay in memory until it ends, the transcript itself
// is stored only by meeting memory, as before.
const {SOUND,MIC}=require('./meeting-talk.cjs');
const SOURCES={[SOUND]:'sound',[MIC]:'mic',sound:'sound',mic:'mic'};
const normal=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const clean=t=>String(t||'').replace(/\s+/g,' ').trim().slice(0,4000);
const names=v=>[...new Set((Array.isArray(v)?v:[]).filter(x=>typeof x==='string').map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<=120))].slice(0,50);

class MeetingStream {
 constructor({now=Date.now,maxLag=15000,staleLag=90000,backlog=3,hold=12000,longSegment=7000,keep=200,queue=50,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  Object.assign(this,{now,maxLag,staleLag,backlog,hold,longSegment,keep,queueLimit:queue,setTimer,clearTimer});
  this.subs=new Set();this.seq=0;this.current=null;this.reset();
 }
 reset(){
  for(const u of this.open?.values()||[])if(u.timer)this.clearTimer(u.timer);
  this.open=new Map();this.closed=new Set();this.last=new Map();this.finals=[];this.paused=false;this.lag=0;this.behind=false;
  this.skipped={partials:0,finals:0,duplicates:0,dropped:0};
 }
 context(){const m=this.current;return m?{title:m.title,app:m.app,source:m.source,attendees:[...m.attendees],startedAt:m.startedAt}:null;}
 meeting(){return this.current?{meetingId:this.current.meetingId,...this.context(),paused:this.paused}:null;}
 status(){return {active:!!this.current,meetingId:this.current?.meetingId||'',paused:this.paused,lag:this.lag,behind:this.behind,skipped:{...this.skipped},subscribers:this.subs.size,seq:this.seq};}
 recent(limit=50){return this.finals.slice(-Math.max(0,Math.min(this.keep,Number(limit)||0)));}

 // --- Subscribers ---
 // handler(event) may be async: a subscriber gets its events one at a time and in order. While it is busy, a newer
 // partial replaces the waiting partial of the same utterance (it carries all of its text); at most `queue` events
 // wait, the oldest are dropped. `when()` gates delivery (an extension that is not added gets nothing); when
 // it opens during a meeting the subscriber first gets a `started` event with `replay:true`.
 subscribe(handler,{partials=false,lifecycle=true,when=null}={}){
  if(typeof handler!=='function')throw TypeError('handler must be a function');
  const sub={handler,partials:!!partials,lifecycle:lifecycle!==false,when:typeof when==='function'?when:null,queue:[],running:false,open:false,errors:0};
  sub.open=this.allowed(sub);this.subs.add(sub);
  let done=false;
  return ()=>{if(done)return;done=true;this.subs.delete(sub);sub.queue.length=0;};
 }
 allowed(sub){try{return !sub.when||!!sub.when();}catch{return false;}}
 deliver(sub,event){
  const open=this.allowed(sub);
  if(!open){sub.open=false;sub.queue.length=0;return;}
  if(!sub.open){sub.open=true;if(this.current&&event.type!=='started')this.enqueue(sub,this.event({type:'started',replay:true,at:this.now(),context:this.context()},false));}
  if(event.type==='transcript'){
   if(!event.final&&!sub.partials)return;
   // A newer partial replaces the one of the same utterance still waiting for this subscriber.
   const waiting=event.final?-1:sub.queue.findIndex(e=>e.type==='transcript'&&!e.final&&e.utterance===event.utterance);
   if(waiting>=0){sub.queue[waiting]=event;this.skipped.partials++;return;}
  }
  else if(!sub.lifecycle)return;
  this.enqueue(sub,event);
 }
 enqueue(sub,event){
  sub.queue.push(event);
  while(sub.queue.length>this.queueLimit){sub.queue.shift();this.skipped.dropped++;}
  if(sub.running)return;
  sub.running=true;
  sub.pump=(async()=>{
   await null;
   while(sub.queue.length&&this.subs.has(sub)){const next=sub.queue.shift();try{await sub.handler(next);}catch{sub.errors++;}}
   sub.running=false;
  })();
 }
 // Resolves when every subscriber has handled what it was given (tests, orderly shutdown).
 async idle(){for(let i=0;i<1000;i++){const busy=[...this.subs].filter(s=>s.running).map(s=>s.pump);if(!busy.length)return;await Promise.all(busy);}}
 event(fields,count=true){return Object.freeze({...fields,meetingId:this.current?.meetingId||fields.meetingId||'',seq:count?++this.seq:this.seq});}
 publish(fields){
  const event=this.event(fields);
  if(event.type==='transcript'&&event.final){this.finals.push(event);if(this.finals.length>this.keep)this.finals.splice(0,this.finals.length-this.keep);}
  for(const sub of [...this.subs])this.deliver(sub,event);
  return event;
 }
 lifecycle(type,extra={}){return this.publish({type,at:this.now(),context:this.context(),...extra});}

 // --- Lifecycle (the recorder) ---
 start({meetingId,title='',app='',source='',attendees=[]}={}){
  if(!meetingId)throw TypeError('meetingId is required');
  if(this.current?.meetingId===meetingId)return;
  if(this.current)this.end(this.current.meetingId,{reason:'replaced'});
  this.reset();
  this.current={meetingId:String(meetingId),title:clean(title).slice(0,120),app:clean(app).slice(0,40),source:clean(source).slice(0,60),attendees:names(attendees),startedAt:this.now()};
  return this.lifecycle('started');
 }
 // More about the meeting from a source or the calendar: a title, who takes part.
 annotate(meetingId,{title,attendees}={}){
  const m=this.current;if(!m||m.meetingId!==meetingId)return null;
  if(typeof title==='string'&&clean(title))m.title=clean(title).slice(0,120);
  if(Array.isArray(attendees))m.attendees=names([...m.attendees,...attendees]);
  return this.lifecycle('context');
 }
 // The user pauses the live stream without stopping the recording: nothing is delivered and the utterance in progress
 // is dropped, not finished.
 pause(){if(!this.current||this.paused)return null;this.drop();this.paused=true;return this.lifecycle('paused');}
 resume(){if(!this.current||!this.paused)return null;this.paused=false;return this.lifecycle('resumed');}
 end(meetingId,{reason='stopped',pending=0}={}){
  const m=this.current;if(!m||meetingId&&m.meetingId!==meetingId)return null;
  if(!this.paused)for(const source of [...this.open.keys()])this.finish(source);
  this.drop();
  const event=this.lifecycle('ended',{reason:String(reason).slice(0,40),pending:Math.max(0,Number(pending)||0)});
  this.current=null;this.reset();
  return event;
 }
 drop(){for(const u of this.open.values())if(u.timer)this.clearTimer(u.timer);this.open.clear();}

 // --- Transcript ---
 // A recognised fragment of the recording, in recording order per source: {meetingId, index, source, at, endedAt,
 // overlap, text, speaker?, pending, continues?}. `overlap` — the fragment continues the previous one of the same
 // source (speech was cut without a pause; its overlapping words are already removed from `text`). `continues` — the
 // next fragment of this source is known and continues this one; unknown → a fragment as long as the recorder's
 // forced cut is taken as unfinished. Unfinished utterances are published as partials, the rest as finals.
 segment(input={}){
  if(!this.current||input.meetingId!==this.current.meetingId||this.paused)return;
  const source=SOURCES[input.source];if(!source||![input.at,input.endedAt].every(Number.isFinite))return;
  this.measure(input.endedAt,input.pending);
  const text=clean(input.text);
  let u=this.open.get(source);
  if(u&&!input.overlap){this.finish(source);u=null;}
  if(!text){if(u&&input.continues===false)this.finish(source);return;}
  if(u){u.text=(u.text+' '+text).trim();u.end=input.endedAt;if(!u.speaker&&input.speaker)u.speaker=input.speaker;}
  else{u={id:this.current.meetingId+':'+source+':'+(Number.isInteger(input.index)?input.index:this.seq+1),source,start:input.at,end:input.endedAt,text,speaker:typeof input.speaker==='string'?input.speaker.slice(0,80):'',sent:''};this.open.set(source,u);}
  const continues=typeof input.continues==='boolean'?input.continues:input.endedAt-input.at>=this.longSegment;
  if(!continues){this.finish(source);return;}
  this.partial(u);
  if(u.timer)this.clearTimer(u.timer);
  // No continuation in time (the recorder stopped, recognition failed): the utterance is final as it is.
  u.timer=this.setTimer(()=>{u.timer=null;if(this.open.get(source)===u)this.finish(source);},this.hold);u.timer?.unref?.();
 }
 // The generic producer form, for a recogniser that streams words itself: {meetingId, utterance, source, start, end,
 // text, final, speaker?}. Repeated partials and anything after an utterance's final are dropped.
 transcript(input={}){
  if(!this.current||input.meetingId!==this.current.meetingId||this.paused)return null;
  const source=SOURCES[input.source],id=String(input.utterance||'');if(!source||!id||this.closed.has(id)||![input.start,input.end].every(Number.isFinite))return null;
  this.measure(input.end,0);
  let u=this.open.get(id);
  if(!u){u={id,source,start:input.start,end:input.end,text:'',speaker:'',sent:''};this.open.set(id,u);}
  u.text=clean(input.text);u.end=input.end;if(typeof input.speaker==='string'&&input.speaker)u.speaker=input.speaker.slice(0,80);
  if(input.final)return this.finish(id);
  return this.partial(u);
 }
 measure(endedAt,pending){
  this.lag=Math.max(0,this.now()-endedAt);
  const behind=this.lag>this.maxLag||Number(pending)>this.backlog;
  if(behind!==this.behind){this.behind=behind;this.lifecycle('lag',{behind,lag:this.lag,pending:Math.max(0,Number(pending)||0)});}
 }
 fields(u,final){return {type:'transcript',utterance:u.id,start:u.start,end:u.end,...u.speaker?{speaker:u.speaker}:{},text:u.text,final,source:u.source,lag:Math.max(0,this.now()-u.end)};}
 // A machine that is behind gets no partials: they would be stale before anyone read them.
 partial(u){
  if(!u.text||u.text===u.sent)return null;
  if(this.behind){this.skipped.partials++;return null;}
  u.sent=u.text;return this.publish(this.fields(u,false));
 }
 finish(key){
  const u=this.open.get(key);if(!u)return null;
  if(u.timer)this.clearTimer(u.timer);this.open.delete(key);this.closed.add(u.id);
  if(!u.text)return null;
  // The same words again right after (the recogniser repeating the overlap) are one utterance, not two.
  const last=this.last.get(u.source),n=normal(u.text);
  if(last&&last.text===n&&u.start-last.end<10000){this.skipped.duplicates++;return null;}
  this.last.set(u.source,{text:n,end:u.end});
  if(this.now()-u.end>this.staleLag){this.skipped.finals++;return null;}
  return this.publish(this.fields(u,true));
 }
}
module.exports={MeetingStream,SOURCES,normal};
