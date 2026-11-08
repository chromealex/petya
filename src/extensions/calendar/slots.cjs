// Free time by code: busy intervals of every person are merged, and candidate slots inside working hours are
// ranked. A slot is shown as «все свободны» only when nobody's calendar has anything there; people whose calendar
// could not be read are listed as unknown, never counted as free.
const when=require('./when.cjs');
const STEP=30;

const iv=(start,end)=>({start:+new Date(start),end:+new Date(end)});
function merge(list){
 const rows=list.map(x=>iv(x.start,x.end)).filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
 const out=[];for(const r of rows){const last=out.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else out.push({...r});}
 return out;
}
const overlaps=(busy,s,e)=>busy.some(b=>b.start<e&&b.end>s);

// Working days of the range (Mon–Fri unless a single day was asked for) with their working-hours window.
function windows(range,{workStart='10:00',workEnd='19:00',now=new Date()}={}){
 const a=when.minutes(workStart)??600,b=when.minutes(workEnd)??1140;
 const out=[];
 for(let d=when.startOfDay(range.from);d<range.to;d=when.addDays(d,1)){
  if(!range.single&&(d.getDay()===0||d.getDay()===6))continue;
  let from=when.at(d,a);const to=when.at(d,b);
  // Today: from the next half hour.
  if(from<now){const m=new Date(now);m.setSeconds(0,0);const pad=(STEP-m.getMinutes()%STEP)%STEP;from=new Date(+m+pad*60000);}
  if(to-from>0)out.push({day:when.ymd(d),from,to});
 }
 return out;
}
// Free gaps of one person inside the windows (for «когда я свободен»).
function gaps(busy,wins,min=30){
 const merged=merge(busy),out=[];
 for(const w of wins){let at=+w.from;for(const b of merged){if(b.end<=at||b.start>=+w.to)continue;if(b.start-at>=min*60000)out.push({start:new Date(at).toISOString(),end:new Date(b.start).toISOString()});at=Math.max(at,b.end);}
  if(+w.to-at>=min*60000)out.push({start:new Date(at).toISOString(),end:w.to.toISOString()});}
 return out;
}
// people: [{email,name,busy:[{start,end}],error?}]. Returns ranked slots, best first.
function find(people,range,{duration=60,workStart,workEnd,now=new Date(),limit=5}={}){
 const known=people.filter(p=>!p.error).map(p=>({...p,merged:merge(p.busy||[])}));
 const unknown=people.filter(p=>p.error).map(p=>p.email);
 const len=duration*60000,core=[when.minutes('11:00'),when.minutes('17:00')];
 const all=[];
 for(const w of windows(range,{workStart,workEnd,now})){
  for(let s=+w.from;s+len<=+w.to;s+=STEP*60000){
   const e=s+len,busy=known.filter(p=>overlaps(p.merged,s,e));
   const start=new Date(s),mins=start.getHours()*60+start.getMinutes();
   // Ranking: everyone free first; then a margin around the slot (nobody runs in from another meeting), core
   // hours over the edges of the day, earlier days first.
   const tight=known.filter(p=>overlaps(p.merged,s-15*60000,s)||overlaps(p.merged,e,e+15*60000)).length;
   const edge=mins<core[0]||mins+duration>core[1];
   const dayIndex=Math.round((when.startOfDay(start)-when.startOfDay(range.from))/when.DAY);
   const score=busy.length*1000+tight*20+(edge?15:0)+dayIndex*6+(mins%60?1:0);
   all.push({start:start.toISOString(),end:new Date(e).toISOString(),busy:busy.map(p=>p.email),tight:!!tight,score});
  }
 }
 all.sort((a,b)=>a.score-b.score||a.start.localeCompare(b.start));
 // Variety: no slot overlapping one already taken, and at most two per day, so the list spans the period.
 const out=[],perDay=new Map();
 for(const c of all){if(out.length>=limit)break;const d=when.ymd(new Date(c.start));if(out.some(o=>o.start<c.end&&c.start<o.end)||(perDay.get(d)||0)>=2&&!range.single)continue;perDay.set(d,(perDay.get(d)||0)+1);out.push(c);}
 return {slots:out.map(({score,...c})=>({...c,note:note(c,people,unknown)})),unknown,free:out.length&&!out[0].busy.length};
}
function note(c,people,unknown){
 const name=email=>people.find(p=>p.email===email)?.name||email;
 if(c.busy.length)return 'заняты: '+c.busy.map(name).join(', ');
 const parts=['свободны все'+(unknown.length?' доступные':'')];
 if(!c.tight)parts.push('без встреч впритык');
 return parts.join(', ');
}
// A requested time: who is busy then, and nearby free alternatives the same day.
function check(people,start,duration){
 const s=+new Date(start),e=s+duration*60000;
 const busy=people.filter(p=>!p.error&&overlaps(merge(p.busy||[]),s,e)).map(p=>p.email);
 return {start:new Date(s).toISOString(),end:new Date(e).toISOString(),busy};
}
module.exports={merge,windows,gaps,find,check,STEP};
