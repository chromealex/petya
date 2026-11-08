// «Подсказки на встрече»: the live part. It follows the meeting stream (src/features/meeting-stream.cjs) through the
// extension's meeting listener, keeps the last minute of finished phrases in memory, and when hints are on for this
// meeting shows at most one hint per 30 seconds in the hint panel. Nothing is stored except the user's choices
// (the mode and the kinds of hints turned off); the hints of a meeting are forgotten when it ends.
const {candidates,RateLimit}=require('./match.cjs');
const MODES=['off','meeting','always'];
const KINDS=['decision','promise','term'];
const WINDOW=60000;

class HintEngine{
 // settings() → the live settings; save(values) stores them; knowledge(meeting) → {decisions,promises,terms};
 // search(text, meeting) → semantic matches or null; show(hint) / hide() drive the panel; calendar(meeting) → context.
 constructor({settings,save,knowledge,search=null,show=()=>{},hide=()=>{},calendar=null,annotate=null,now=Date.now,interval=30000}){
  Object.assign(this,{settings,save,knowledge,search,show,hide,calendar,annotate,now});
  this.limit=new RateLimit(interval);this.meeting=null;this.recent=[];this.hints=[];this.seen=new Set();this.known=null;this.hidden=false;this.current=null;this.busy=false;
 }
 mode(){const m=this.settings()?.meetingHintsMode;return MODES.includes(m)?m:'off';}
 muted(){return new Set(String(this.settings()?.meetingHintsMuted||'').split(',').filter(k=>KINDS.includes(k)));}
 // Hints are on for the meeting going on now: «always», or «meeting» (this one or, when none is recorded, the next).
 on(){return this.mode()!=='off';}
 state(){
  const m=this.meeting;
  return {mode:this.mode(),muted:[...this.muted()],hidden:this.hidden,
   meeting:m?{id:m.id,title:m.title,attendees:m.attendees.length,startedAt:m.startedAt,paused:m.paused,behind:m.behind,lag:m.lag}:null,
   hints:this.hints.map(h=>({...h}))};
 }
 setMode(mode){
  if(!MODES.includes(mode))throw Error('Неизвестный режим подсказок.');
  this.save({meetingHintsMode:mode});
  if(mode==='off'){this.current=null;this.hide();}
  else if(this.meeting){this.hidden=false;this.prepare();}
  return this.state();
 }
 async onEvent(event){
  if(!event||typeof event!=='object')return;
  if(event.type==='started'){
   if(this.meeting?.id===event.meetingId)return;
   const c=event.context||{};
   this.meeting={id:event.meetingId,title:c.title||'',attendees:[...(c.attendees||[])],startedAt:Number(c.startedAt)||this.now(),paused:false,behind:false,lag:0};
   this.recent=[];this.hints=[];this.seen=new Set();this.known=null;this.hidden=false;this.current=null;this.limit.reset();
   if(this.on())this.prepare();
   return;
  }
  const m=this.meeting;if(!m||event.meetingId!==m.id)return;
  if(event.type==='context'){const c=event.context||{};if(c.title)m.title=c.title;if(Array.isArray(c.attendees))m.attendees=[...c.attendees];return;}
  if(event.type==='paused'){m.paused=true;this.recent=[];return;}
  if(event.type==='resumed'){m.paused=false;return;}
  if(event.type==='lag'){m.behind=!!event.behind;m.lag=Number(event.lag)||0;return;}
  if(event.type==='ended'){
   this.meeting=null;this.recent=[];this.hints=[];this.seen=new Set();this.known=null;this.current=null;this.hide();
   // «Включи подсказки» was for this meeting only.
   if(this.mode()==='meeting')this.save({meetingHintsMode:'off'});
   return;
  }
  if(event.type!=='transcript'||!event.final||m.paused)return;
  const at=this.now();
  this.recent.push({text:String(event.text||''),end:Number(event.end)||at});
  this.recent=this.recent.filter(r=>at-r.end<=WINDOW).slice(-8);
  // Cheap checks first: nothing to do while hints are off or the last hint is younger than 30 s.
  if(!this.on()||!this.limit.ready(at)||this.busy)return;
  this.busy=true;
  try{await this.consider(at);}finally{this.busy=false;}
 }
 // Loads what the hints compare against once per meeting, and the calendar context if a calendar is connected.
 prepare(){
  const m=this.meeting;if(!m)return;
  if(!this.known)this.known=Promise.resolve().then(()=>this.knowledge(m)).catch(()=>({decisions:[],promises:[],terms:[]}));
  if(this.calendar&&!m.calendar){m.calendar=true;Promise.resolve().then(()=>this.calendar(m)).then(c=>{if(c&&this.meeting===m&&this.annotate)this.annotate(m.id,c);}).catch(()=>{});}
 }
 async consider(at){
  const m=this.meeting;this.prepare();
  const known=await this.known,talk=this.recent.map(r=>r.text).join(' ');
  let semantic=[];
  if(this.search){try{semantic=(await this.search(talk.slice(-1200),m))||[];}catch{semantic=[];}}
  if(this.meeting!==m||!this.on())return null;
  const [best]=candidates(talk,known,{seen:this.seen,muted:this.muted(),meetingId:m.id,attendees:m.attendees,semantic});
  if(!best||!this.limit.take(this.now()))return null;
  this.seen.add(best.key);
  const hint={id:m.id+':'+this.hints.length,kind:best.kind,text:best.text,...best.term?{term:best.term}:{},...best.who?{who:best.who}:{},...best.due?{due:best.due}:{},
   source:{at:best.at,label:best.cite,kind:best.kind==='term'?'glossary':'summary'},shownAt:this.now(),offset:Math.max(0,this.now()-m.startedAt),by:best.by||'keywords'};
  this.hints.push(hint);if(this.hints.length>30)this.hints.shift();
  this.current=hint;
  if(!this.hidden)this.show(hint);
  return hint;
 }
 // Panel buttons: «Понятно», «Не показывать такое», «Скрыть до конца встречи».
 dismiss(){this.current=null;this.hide();return this.state();}
 mute(kind){
  if(!KINDS.includes(kind))throw Error('Неизвестный вид подсказок.');
  const muted=this.muted();muted.add(kind);this.save({meetingHintsMuted:[...muted].join(',')});
  if(this.current?.kind===kind){this.current=null;this.hide();}
  return this.state();
 }
 unmute(){this.save({meetingHintsMuted:''});return this.state();}
 hideForMeeting(){this.hidden=true;this.current=null;this.hide();return this.state();}
 showAgain(){if(!this.meeting)return this.state();this.hidden=false;if(this.current)this.show(this.current);return this.state();}
}
module.exports={HintEngine,MODES,KINDS};
