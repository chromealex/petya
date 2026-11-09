// «Ретро», the sprint's facts by code. Every fact carries its source (a Jira query, a CI run, a monitoring source, a
// meeting summary, a messenger message) so the drafts can only point at what really happened:
// - Jira through «Планирование спринта»'s read-only client (agile.cjs, plan.cjs): velocity against the previous
//   sprints, carry-over, bugs of the sprint;
// - CI failures from «Сборки» (GitHub Actions, Unity Build Automation) when that app is added and connected;
// - incidents from the monitor sources (docs/foundations/monitoring.md) when one is connected;
// - decisions, open questions and complaints from Petya's meeting summaries (company memory) of the sprint's days;
// - decisions and complaints from messengers through `messenger-source` (docs/foundations/messengers.md).
// Nothing here writes anywhere.
const agile=require('../sprint-planning/agile.cjs');
const plan=require('../sprint-planning/plan.cjs');
const DAY=86400000;
const clip=(t,n=200)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const byDate=x=>Date.parse(x.complete||x.end||x.start||'')||0;
const BUG=/^(?:bug|баг|ошибка|дефект|defect)$/iu;
// Words of a complaint and of a decision in people's own messages and in meeting summaries.
const COMPLAINT=/(?:^|[^\p{L}])(?:беси\p{L}*|меша\p{L}*|опять|снова\s+(?:упал|сломал|не\s+работ)|сломал\p{L}*|тормоз\p{L}*|долго\s+жд\p{L}*|не\s+успе\p{L}*|блокер\p{L}*|заблокир\p{L}*|не\s+работает|упал[аио]?|жалоб\p{L}*|жалу\p{L}*|неудобн\p{L}*|завал\p{L}*|горит|сорвал\p{L}*|просрочил\p{L}*|бардак|хаос|никто\s+не\s+(?:знал|ответил|ревьюит))(?=$|[^\p{L}])/iu;
const DECISION=/(?:^|[^\p{L}])(?:решили|договорились|приняли\s+решение|принято\s+решение|решение\s*:|итог\s*:|утвердили)(?=$|[^\p{L}])/iu;

// --- Jira ----------------------------------------------------------------------------------------------------------
// The sprint to look back at: the one named in the request («ретро спринта 14»), else the active sprint when it ends
// within three days (or is already past its end), else the last closed one.
function target({closed,active,named='',now=new Date()}){
 const all=[...closed,...active?[active]:[]];
 if(named){
  const n=String(named).toLowerCase();
  const exact=all.find(x=>x.name.toLowerCase()===n)||all.find(x=>new RegExp('(?:^|\\D)'+n.replace(/\D/g,'')+'$').test(x.name)&&/^\d+$/.test(n))||all.find(x=>x.name.toLowerCase().includes(n));
  if(exact)return exact;
 }
 const end=Date.parse(active?.end||'');
 if(active&&Number.isFinite(end)&&end-+now<=3*DAY)return active;
 const last=[...closed].sort((a,b)=>byDate(a)-byDate(b)).at(-1);
 return last||active||null;
}

async function jira(s,key,board,{now=new Date(),named=''}={}){
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 const jql=q=>site+'/issues/?jql='+encodeURIComponent(q);
 const browse=k=>site+'/browse/'+encodeURIComponent(k);
 const est=await agile.estimation(s,key,board.id);
 const [closed,open]=await Promise.all([agile.sprints(s,key,board.id,'closed'),agile.sprints(s,key,board.id,'active')]);
 const active=open.find(x=>x.state==='active')||null;
 const sprint=target({closed,active,named,now});
 if(!sprint)return {sprint:null,facts:[],velocity:{sprints:[],average:0},estimation:est,issues:[]};
 // The sprint and up to five closed sprints before it, for the velocity bars.
 const before=closed.filter(x=>x.id!==sprint.id&&byDate(x)<=byDate(sprint)+DAY).sort((a,b)=>byDate(a)-byDate(b)).slice(-5);
 const list=[...before,sprint];
 const history=[];for(let i=0;i<list.length;i+=3)history.push(...await Promise.all(list.slice(i,i+3).map(async x=>({sprint:x,issues:await agile.sprintIssues(s,key,board.id,x.id,est)}))));
 const vel=plan.velocity(history);
 const own=history.at(-1).issues.filter(i=>!i.subtask);
 const mine=vel.sprints.at(-1),past=vel.sprints.slice(0,-1);
 const average=past.length?plan.round(plan.sum(past,r=>r.completed)/past.length):0;
 const unit=est.mode==='count'?'':est.mode==='hours'?' ч':' SP';
 const amount=n=>String(plan.round(n)).replace('.',',')+unit;
 const facts=[];
 const src={kind:'jira',name:'Jira',label:'Jira · '+sprint.name};
 const live=sprint.state==='active';
 // Velocity: what was finished against what was taken and against the previous sprints.
 const ratio=average?mine.completed/average:null;
 facts.push({kind:'velocity',tone:ratio==null?'neutral':ratio>=0.95?'good':ratio<0.8?'bad':'neutral',
  text:(live?'Закрыто пока ':'Сделано ')+amount(mine.completed)+(est.mode==='count'?' задач':'')+' из '+amount(mine.committed)+' взятых'+(average?' (в среднем за прошлые '+past.length+' — '+amount(average)+')':''),
  value:{completed:mine.completed,committed:mine.committed,average},source:{...src,url:jql('sprint = '+sprint.id)}});
 // Carry-over: what is not done at the end of the sprint.
 const carry=own.filter(i=>i.category!=='done');
 if(carry.length){
  const points=plan.sum(carry,i=>i.estimate||0);
  facts.push({kind:'carry',tone:carry.length/Math.max(1,own.length)>=0.15?'bad':'neutral',
   text:'Не закрыто '+carry.length+' из '+own.length+(est.mode==='count'?'':' на '+amount(points))+': '+carry.slice(0,4).map(i=>i.key).join(', ')+(carry.length>4?' и ещё '+(carry.length-4):''),
   value:{count:carry.length,total:own.length},issues:carry.slice(0,8).map(i=>({key:i.key,summary:clip(i.summary,120),url:browse(i.key)})),
   source:{...src,url:jql('sprint = '+sprint.id+' AND statusCategory != Done')}});
 }else if(own.length)facts.push({kind:'carry',tone:'good',text:'Всё взятое закрыто: '+own.length+' из '+own.length,value:{count:0,total:own.length},source:{...src,url:jql('sprint = '+sprint.id)}});
 // Bugs of the sprint: fixed and still open.
 const bugs=own.filter(i=>BUG.test(i.type));
 if(bugs.length){
  const open=bugs.filter(i=>i.category!=='done');
  facts.push({kind:'bugs',tone:open.length?'bad':'good',text:'Баги в спринте: '+bugs.length+', закрыто '+(bugs.length-open.length)+(open.length?', открыто: '+open.slice(0,4).map(i=>i.key).join(', '):''),
   value:{total:bugs.length,open:open.length},issues:bugs.slice(0,8).map(i=>({key:i.key,summary:clip(i.summary,120),url:browse(i.key),done:i.category==='done'})),
   source:{...src,url:jql('key in ('+bugs.slice(0,40).map(i=>i.key).join(',')+')')}});
 }
 const unestimated=own.filter(i=>i.estimate==null&&est.mode!=='count');
 if(unestimated.length>=2)facts.push({kind:'estimate',tone:'bad',text:'Без оценки взято '+unestimated.length+': '+unestimated.slice(0,4).map(i=>i.key).join(', '),source:{...src,url:jql('key in ('+unestimated.slice(0,40).map(i=>i.key).join(',')+')')}});
 return {sprint:{id:sprint.id,name:sprint.name,state:sprint.state,start:sprint.start,end:sprint.complete||sprint.end,goal:sprint.goal||''},
  estimation:est,velocity:{sprints:vel.sprints.map(r=>({id:r.id,name:r.name,completed:r.completed,committed:r.committed})),average},facts};
}

// --- CI ------------------------------------------------------------------------------------------------------------
const ciReady=s=>s.settings['extension_ci-builds']==='true'&&(()=>{try{return require('../github/client.cjs').connected(s.settings)||require('../ci-builds/sources.cjs').unityConfigured(s.settings);}catch{return false;}})();
async function ci(s,{since,until}){
 if(!ciReady(s))return {facts:[],used:false,notes:[]};
 const github=require('../github/client.cjs'),src=require('../ci-builds/sources.cjs');
 const runs=[],notes=[];
 if(github.connected(s.settings)){
  let repos=[];try{repos=await github.repos(s);}catch(e){notes.push('GitHub: '+e.message);}
  for(const repo of repos.slice(0,3)){try{runs.push(...await src.githubRuns(s,repo));}catch(e){notes.push('GitHub '+repo+': '+e.message);}}
 }
 if(src.unityConfigured(s.settings)){try{runs.push(...await src.unityRuns(s,{}));}catch(e){notes.push('Unity Build Automation: '+e.message);}}
 const inside=runs.filter(r=>{const t=Date.parse(r.at);return t>=+since&&t<=+until&&r.status!=='skipped';});
 const facts=[];
 const groups=new Map();for(const r of inside){if(!groups.has(r.group))groups.set(r.group,[]);groups.get(r.group).push(r);}
 const failing=[...groups.values()].map(list=>({list,failed:list.filter(r=>r.status==='failure')})).filter(g=>g.failed.length).sort((a,b)=>b.failed.length-a.failed.length);
 for(const g of failing.slice(0,4)){
  const last=g.failed.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
  facts.push({kind:'ci',tone:'bad',at:last.at,text:'CI: «'+clip(last.workflow,60)+'» '+(last.repo?'('+last.repo+') ':'')+'падал '+g.failed.length+' из '+g.list.length+' запусков',
   value:{failed:g.failed.length,total:g.list.length},source:{kind:'ci',name:last.source==='unity'?'Unity Build Automation':'GitHub Actions',label:clip(last.workflow,60)+' #'+last.number,url:last.url||''}});
 }
 if(!failing.length&&inside.length)facts.push({kind:'ci',tone:'good',text:'CI: '+inside.length+' запусков за спринт, ни одного падения',value:{failed:0,total:inside.length},source:{kind:'ci',name:'Сборки',label:'Сборки за спринт',url:''}});
 return {facts,used:true,notes};
}

// --- Incidents -------------------------------------------------------------------------------------------------------
async function incidents(s,{since,until,now=new Date()}){
 let reg;try{reg=s.monitorSources||require('../../features/monitor-sources.cjs').create(s);}catch{return {facts:[],used:false,notes:[]};}
 if(!reg.list().length)return {facts:[],used:false,notes:[]};
 const snap=await reg.snapshot({now:+now,from:+since,to:+until});
 const notes=snap.sources.filter(x=>x.error).map(x=>x.name+': '+x.error);
 const names=new Map(snap.sources.map(x=>[x.id,x.name]));
 const rows=snap.history.filter(e=>e.status==='critical'||e.kind==='uptime').sort((a,b)=>a.from.localeCompare(b.from));
 const facts=rows.slice(0,5).map(e=>{
  const mins=e.to?Math.max(1,Math.round((Date.parse(e.to)-Date.parse(e.from))/60000)):null;
  const source=(e.source||'').split(',')[0];
  return {kind:'incident',tone:'bad',at:e.from,text:'Инцидент: '+e.service+' — '+clip(e.title||'недоступен',80)+(mins?' ('+(mins>=120?Math.round(mins/60)+' ч':mins+' мин')+')':', ещё не закрыт'),
   source:{kind:'monitoring',name:names.get(source)||'Мониторинг',label:(names.get(source)||'Мониторинг')+' · '+e.service,url:''}};
 });
 if(rows.length>5)facts.push({kind:'incident',tone:'bad',text:'И ещё инцидентов: '+(rows.length-5),source:{kind:'monitoring',name:'Мониторинг',label:'Мониторинг',url:''}});
 return {facts,used:true,notes};
}

// --- Meeting summaries (company memory) -----------------------------------------------------------------------------
function meetings(memory,{since,until}){
 const facts=[];
 const rows=(memory||[]).filter(r=>r?.kind==='summary'&&r.summary&&typeof r.summary==='object'&&Number(r.at)>=+since&&Number(r.at)<=+until).sort((a,b)=>a.at-b.at);
 for(const r of rows){
  const source={kind:'meeting',name:'Встреча',label:clip(String(r.title||'Сводка встречи').replace(/^Сводка встречи\s*·\s*/,'Встреча · '),80),url:'',summaryId:String(r.id||'')};
  const at=new Date(Number(r.at)).toISOString();
  for(const d of (r.summary.decisions||[]).map(String).slice(0,4))facts.push({kind:'decision',tone:'good',at,text:'Решили: '+clip(d,180),quote:clip(d,300),source});
  for(const d of (r.summary.discussed||[]).map(String).filter(t=>COMPLAINT.test(t)).slice(0,3))facts.push({kind:'complaint',tone:'bad',at,text:'На встрече: '+clip(d,180),quote:clip(d,300),source});
  for(const d of (r.summary.notDiscussed||[]).map(String).slice(0,2))facts.push({kind:'open',tone:'bad',at,text:'Осталось без решения: '+clip(d,160),quote:clip(d,300),source});
 }
 return {facts:facts.slice(0,14),used:rows.length>0,count:rows.length};
}

// --- Messengers ---------------------------------------------------------------------------------------------------
async function messengers(s,{since,until}){
 let reg;try{reg=s.messengerSources||require('../../features/messenger-sources.cjs').create(s);}catch{return {facts:[],used:[],notes:[]};}
 const ready=reg.list();
 if(!ready.length)return {facts:[],used:[],notes:[]};
 const facts=[],used=[],notes=[];
 for(const x of ready.slice(0,4)){
  try{
   const channels=(await reg.channels(x.id)).filter(c=>c.kind!=='direct').slice(0,6);
   let n=0;
   for(const c of channels){
    const r=await reg.messages(x.id,{channel:c.id,since:new Date(since).toISOString(),until:new Date(until).toISOString(),limit:200});
    for(const m of r.messages){
     if(m.bot||m.text.length<12)continue;
     const kind=DECISION.test(m.text)?'decision':COMPLAINT.test(m.text)?'complaint':'';
     if(!kind)continue;
     facts.push({kind,tone:kind==='decision'?'good':'bad',at:m.at,text:(kind==='decision'?'В чате решили: ':'Жалоба в чате: ')+clip(m.text,160),quote:clip(m.text,400),author:m.author.name,
      source:{kind:'messenger',name:x.name,label:x.name+' · #'+clip(m.channel.name||c.name,40),url:m.url||''}});
     n++;
    }
   }
   used.push(x.name);
   if(!n)continue;
  }catch(e){notes.push(x.name+': '+e.message);}
 }
 // At most six of each kind, the latest first.
 const pick=kind=>facts.filter(f=>f.kind===kind).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,6);
 return {facts:[...pick('decision'),...pick('complaint')],used,notes};
}

module.exports={target,jira,ci,ciReady,incidents,meetings,messengers,COMPLAINT,DECISION,BUG,clip};
