// «Планирование спринта», the arithmetic (no I/O, no model): velocity of closed sprints, working days of the next
// sprint, each person's capacity from their share of the velocity and their absences, and the proposed scope —
// the ranked backlog fitted greedily to what is left after carry-over and issues already in the next sprint.
const DAY=86400000;
const round=n=>Math.round(n*10)/10;
const sum=(rows,f=x=>x)=>rows.reduce((n,r)=>n+(Number(f(r))||0),0);
const median=list=>{const a=[...list].sort((x,y)=>x-y);if(!a.length)return 0;const m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;};

// Local calendar day at midnight.
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
const ymd=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const weekday=d=>{const w=new Date(d).getDay();return w>0&&w<6;};
// Working days (Mon–Fri) of a sprint [start, end): the end day counts when the sprint ends after noon.
function workdays(start,end){
 const a=dayStart(start),last=new Date(end);if(!(a<last))return [];
 const stop=dayStart(last);if(last.getHours()>=12)stop.setDate(stop.getDate()+1);
 const out=[];for(const d=new Date(a);d<stop&&out.length<200;d.setDate(d.getDate()+1))if(weekday(d))out.push(ymd(d));
 return out;
}

// Closed sprints → velocity. An issue counts as completed in a sprint when it is done and was resolved before the
// sprint was completed (an issue carried on and finished later is not this sprint's). Subtasks are not counted.
function velocity(history,{grace=6*3600000}={}){
 const rows=history.map(({sprint,issues})=>{
  const end=Date.parse(sprint.complete||sprint.end||'');
  const parents=issues.filter(i=>!i.subtask);
  const done=parents.filter(i=>i.category==='done'&&(!i.resolved||!Number.isFinite(end)||Date.parse(i.resolved)<=end+grace));
  const by={};for(const i of done)if(i.assigneeId)by[i.assigneeId]=(by[i.assigneeId]||0)+(i.estimate||0);
  const names={};for(const i of parents)if(i.assigneeId)names[i.assigneeId]=i.assignee;
  return {id:sprint.id,name:sprint.name,start:sprint.start,end:sprint.complete||sprint.end,committed:round(sum(parents,i=>i.estimate)),completed:round(sum(done,i=>i.estimate)),
   unestimated:parents.filter(i=>i.estimate==null).length,days:sprint.start&&(sprint.complete||sprint.end)?workdays(sprint.start,sprint.complete||sprint.end).length:0,by,names};
 });
 const average=rows.length?round(sum(rows,r=>r.completed)/rows.length):0;
 return {sprints:rows,average,days:median(rows.map(r=>r.days).filter(Boolean))};
}

// Each person's share of the velocity: their average completed per sprint; a person without history gets the median
// of the others (a newcomer is not planned at zero), everyone equal when there is no history at all.
function people(members,vel){
 const n=Math.max(1,vel.sprints.length);
 const base=members.map(m=>({...m,base:sum(vel.sprints,r=>r.by[m.jiraId])/n}));
 const known=base.filter(p=>p.base>0).map(p=>p.base),fill=known.length?median(known):1;
 return base.map(p=>({...p,base:p.base>0?p.base:fill,history:p.base>0}));
}

// Absence days of each person inside the sprint's working days.
function absentDays(days,absences,key){
 const set=new Set();
 for(const a of absences)if(a.member===key)for(const d of days)if(d>=a.from&&d<=a.to)set.add(d);
 return set.size;
}

// Capacity: team velocity scaled to the next sprint's length and split by the people's shares, minus absences.
function capacity({vel,members,absences,days}){
 const scale=vel.days&&days.length?days.length/vel.days:1;
 const team=vel.average*scale;
 const rows=people(members,vel),total=sum(rows,p=>p.base)||1;
 const lanes=rows.map(p=>{
  const off=absentDays(days,absences,p.key),share=team*p.base/total,avail=days.length?(days.length-off)/days.length:1;
  return {key:p.key,name:p.name,role:p.role||'',jiraId:p.jiraId,days:days.length,absent:off,full:round(share),capacity:round(share*avail),history:p.history};
 });
 return {team:round(lanes.length?sum(lanes,l=>l.capacity):team),full:round(team),scale:round(scale),lanes};
}

// The proposed scope: ranked backlog items in order, each taken when the team and its person still have room.
// Assigned items stay with their assignee; unassigned ones go to the person with the most room left.
// Items without an estimate (in story points) are never guessed and are listed as such.
function fit({backlog,lanes,teamCapacity,base,mode,limit=80,skippedShown=6}){
 const load=new Map(lanes.map(l=>[l.jiraId,0]));
 for(const i of base)if(load.has(i.assigneeId))load.set(i.assigneeId,load.get(i.assigneeId)+(i.estimate||0));
 let left=teamCapacity-sum(base,i=>i.estimate);
 const room=l=>l.capacity-load.get(l.jiraId);
 const chosen=[],skipped=[];
 for(const i of backlog.filter(x=>!x.subtask&&x.category!=='done').slice(0,limit)){
  const est=mode==='count'?1:i.estimate;
  if(est==null){skipped.push({...i,reason:'unestimated'});continue;}
  if(est>left+1e-9){skipped.push({...i,reason:'no-room'});continue;}
  const own=lanes.find(l=>l.jiraId===i.assigneeId);
  if(own){
   if(est>room(own)+1e-9){skipped.push({...i,reason:'person-full',person:own.name});continue;}
   load.set(own.jiraId,load.get(own.jiraId)+est);left-=est;chosen.push({...i,estimate:est});continue;
  }
  if(i.assigneeId){left-=est;chosen.push({...i,estimate:est,outside:true});continue;}
  const free=[...lanes].filter(l=>room(l)>=est-1e-9).sort((a,b)=>room(b)-room(a)||a.name.localeCompare(b.name))[0];
  if(lanes.length&&!free){skipped.push({...i,reason:'person-full'});continue;}
  if(free)load.set(free.jiraId,load.get(free.jiraId)+est);
  left-=est;chosen.push({...i,estimate:est,...free?{proposedId:free.jiraId,proposed:free.name}:{}});
 }
 return {chosen,skipped:skipped.slice(0,skippedShown),unestimated:skipped.filter(x=>x.reason==='unestimated').length,left:round(left)};
}

// Per-person load of carry-over, already planned and proposed work against capacity.
function loads(lanes,{carry,planned,chosen}){
 return lanes.map(l=>{
  const own=i=>i.assigneeId===l.jiraId||(!i.assigneeId&&i.proposedId===l.jiraId);
  const c=round(sum(carry.filter(own),i=>i.estimate)),p=round(sum(planned.filter(own),i=>i.estimate)),n=round(sum(chosen.filter(own),i=>i.estimate));
  const total=round(c+p+n);
  return {...l,carry:c,planned:p,proposed:n,load:total,over:total>l.capacity+0.05,ratio:l.capacity?round(total/l.capacity):total?9:0};
 });
}

module.exports={workdays,velocity,people,capacity,fit,loads,absentDays,ymd,dayStart,round,sum,median,DAY};
