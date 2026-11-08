// Focus sessions: one persistent timer (a JSON file in the company data folder) with pause, stop, extend,
// breaks and pomodoro series, plus finished sessions for the day and week report. The clock is injected
// (`now`), so a session survives a restart: on load an expired session is closed at its planned end.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const MIN=60000,DAY=86400000,KEEP=60*DAY;

const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime();};
const addDays=(t,n)=>{const d=new Date(t);d.setDate(d.getDate()+n);return d.getTime();};
// Monday of the week of `t`, local time.
const weekStart=t=>{const d=new Date(startOfDay(t));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime();};
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

class FocusStore{
 constructor({file='',now=()=>Date.now()}={}){
  Object.assign(this,{file,now});
  this.active=null;this.series=null;this.history=[];this.held=[];
  this.load();
 }
 load(){
  if(!this.file)return;
  try{
   const d=JSON.parse(fs.readFileSync(this.file,'utf8'));
   this.active=d.active&&Number.isFinite(d.active.startedAt)?d.active:null;
   this.series=d.series||null;
   this.history=Array.isArray(d.history)?d.history.filter(h=>Number.isFinite(h.start)&&Number.isFinite(h.end)):[];
   this.held=Array.isArray(d.held)?d.held.slice(-50):[];
  }catch{/* no file yet */}
 }
 save(){
  if(!this.file)return;
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  fs.writeFileSync(this.file+'.tmp',JSON.stringify({version:1,active:this.active,series:this.series,history:this.history,held:this.held}),{mode:0o600});
  fs.renameSync(this.file+'.tmp',this.file);
 }
 // Paused time so far, including a pause in progress.
 pausedMs(at=this.now()){const a=this.active;return a?a.paused+(a.pausedAt?at-a.pausedAt:0):0;}
 endsAt(at=this.now()){const a=this.active;return a?a.startedAt+a.planned+this.pausedMs(at):0;}
 remaining(at=this.now()){return this.active?Math.max(0,this.endsAt(at)-at):0;}
 elapsed(at=this.now()){const a=this.active;return a?Math.min(a.planned,Math.max(0,at-a.startedAt-this.pausedMs(at))):0;}

 start({kind='focus',minutes=25,label='',jira='',series=null}={},at=this.now()){
  const events=[];
  if(this.active)events.push(this.finish('switched',at));
  if(series!==undefined)this.series=series;
  this.active={id:randomUUID(),kind,label:String(label||'').slice(0,120),jira:String(jira||''),planned:Math.round(minutes*MIN),startedAt:at,paused:0,pausedAt:null,pauses:0,warned:[]};
  this.save();
  events.push({type:'started',session:this.view(at)});
  return events;
 }
 pause(at=this.now()){
  const a=this.active;if(!a)throw Error('Сейчас фокус не идёт.');
  if(!a.pausedAt){a.pausedAt=at;a.pauses++;this.save();}
  return this.view(at);
 }
 resume(at=this.now()){
  const a=this.active;if(!a)throw Error('Сейчас фокус не идёт.');
  if(a.pausedAt){a.paused+=at-a.pausedAt;a.pausedAt=null;this.save();}
  return this.view(at);
 }
 extend(minutes=10,at=this.now()){
  const a=this.active;if(!a)throw Error('Сейчас фокус не идёт.');
  a.planned+=Math.round(minutes*MIN);a.warned=[];this.save();
  return this.view(at);
 }
 // Stopping a focus session more than a minute early is an interruption; a stopped series ends.
 stop(at=this.now()){
  if(!this.active)throw Error('Сейчас фокус не идёт.');
  this.series=null;
  return this.finish(this.remaining(at)>MIN?'stopped':'done',at);
 }
 // A break right now: the focus in progress ends (early → interruption), the series, if any, goes on after it.
 takeBreak(minutes=5,at=this.now()){
  const events=[];
  if(this.active){const a=this.active;events.push(this.finish(a.kind==='focus'&&this.remaining(at)>MIN?'stopped':'done',at));}
  this.active={id:randomUUID(),kind:'break',label:'',jira:'',planned:Math.round(minutes*MIN),startedAt:at,paused:0,pausedAt:null,pauses:0,warned:[]};
  this.save();
  events.push({type:'started',session:this.view(at)});
  return events;
 }
 finish(outcome,at=this.now()){
  const a=this.active;if(!a)return null;
  const end=Math.min(at,this.endsAt(at));
  const record={id:a.id,kind:a.kind,label:a.label,jira:a.jira,start:a.startedAt,end,planned:a.planned,focused:this.elapsed(end),pauses:a.pauses,outcome};
  this.history.push(record);
  this.history=this.history.filter(h=>h.end>at-KEEP).slice(-2000);
  this.active=null;this.save();
  return {type:'finished',session:record};
 }
 // Closes a session whose time is up; in a series, starts the break or the next round.
 // `late` (ms past the planned end) stops a series instead of starting rounds the user slept through.
 tick(at=this.now()){
  const a=this.active;if(!a||a.pausedAt)return [];
  const end=this.endsAt(at);if(end>at)return [];
  const events=[this.finish('done',end)];
  const s=this.series;
  if(!s)return events;
  if(at-end>2*MIN){this.series=null;this.save();return events;}
  if(a.kind==='focus'){
   s.done++;
   if(s.done>=s.total){this.series=null;this.save();events.push({type:'series-done',series:s});return events;}
   const long=s.done%4===0;
   this.active={id:randomUUID(),kind:'break',label:'',jira:'',planned:(long?s.long:s.short)*MIN,startedAt:end,paused:0,pausedAt:null,pauses:0,warned:[]};
  }else{
   this.active={id:randomUUID(),kind:'focus',label:s.label||'',jira:s.jira||'',planned:s.focus*MIN,startedAt:end,paused:0,pausedAt:null,pauses:0,warned:[]};
  }
  this.save();
  events.push({type:'started',session:this.view(at)});
  return events;
 }
 view(at=this.now()){
  const a=this.active;if(!a)return null;
  return {id:a.id,kind:a.kind,label:a.label,jira:a.jira,planned:a.planned,startedAt:a.startedAt,endsAt:this.endsAt(at),remaining:this.remaining(at),elapsed:this.elapsed(at),
   state:a.pausedAt?'paused':'running',pausedAt:a.pausedAt,series:this.series?{total:this.series.total,round:this.series.done+(a.kind==='focus'?1:0)}:null};
 }
 // Finished sessions plus the one in progress (as it is now), for reports.
 sessions(from,to,at=this.now()){
  const rows=this.history.filter(h=>h.end>from&&h.start<to);
  const a=this.active;
  if(a&&a.startedAt<to)rows.push({id:a.id,kind:a.kind,label:a.label,jira:a.jira,start:a.startedAt,end:at,planned:a.planned,focused:this.elapsed(at),pauses:a.pauses,outcome:'active'});
  return rows.sort((x,y)=>x.start-y.start);
 }
 // Day report (focus sessions over a minute count) and the week of that day, Monday to Sunday.
 report(at=this.now()){
  const from=startOfDay(at),to=addDays(from,1);
  const day=this.sessions(from,to,at);
  const focus=day.filter(r=>r.kind==='focus'&&r.focused>=MIN);
  const tasks=new Map();
  for(const r of focus){const key=(r.jira||'')+'|'+(r.label||'');const t=tasks.get(key)||{label:r.label||'',jira:r.jira||'',minutes:0,count:0};t.minutes+=r.focused/MIN;t.count++;tasks.set(key,t);}
  const monday=weekStart(at),week=[];
  for(let i=0;i<7;i++){const a=addDays(monday,i),b=addDays(monday,i+1);const rows=this.sessions(a,b,at).filter(r=>r.kind==='focus');week.push({date:ymd(a),minutes:Math.round(rows.reduce((n,r)=>n+r.focused,0)/MIN),count:rows.filter(r=>r.focused>=MIN).length,interruptions:rows.filter(r=>r.outcome==='stopped').length});}
  return {date:ymd(at),count:focus.length,minutes:Math.round(focus.reduce((n,r)=>n+r.focused,0)/MIN),interruptions:focus.filter(r=>r.outcome==='stopped').length,
   tasks:[...tasks.values()].map(t=>({...t,minutes:Math.round(t.minutes)})).sort((a,b)=>b.minutes-a.minutes),
   timeline:day.map(r=>({kind:r.kind,label:r.label,jira:r.jira,start:new Date(r.start).toISOString(),end:new Date(r.end).toISOString(),outcome:r.outcome,minutes:Math.round(r.focused/MIN)})),
   week,weekMinutes:week.reduce((n,d)=>n+d.minutes,0)};
 }
}
module.exports={FocusStore,MIN,DAY,startOfDay,addDays,weekStart,ymd};
