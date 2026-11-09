// «Планирование спринта»: velocity of the last closed sprints, the next sprint's capacity from «Команда» and absences
// (notes typed in the chat and vacation events of the calendar app), carry-over from the active sprint and a proposed
// scope — the ranked backlog fitted to capacity by code (plan.cjs). The local model only writes a 3-line rationale.
// Everything is read-only: «Перенести в Jira…» on the card sends a prepared chat request; this app then stages the
// change in the Jira history flow (snapshots, preview, undo) and writes only after the user confirms in the
// shared question panel.
// Boundary with «Загрузка команды» (src/workload.cjs, Petya's core): open tasks per person right now stay there
// («загрузка команды», «кто перегружен»); this app answers only about a sprint («кто перегружен в спринте»).
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const agile=require('./agile.cjs');
const plan=require('./plan.cjs');
const absences=require('./absences.cjs');
const ID='sprint-planning',BY='Планирование спринта';
const HISTORY=6,MIN_HISTORY=3;

// --- Routing ------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/u,'').replace(/ё/g,'е').trim();
const SPRINT=/(?:^|[^\p{L}])спринт(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?=$|[^\p{L}])/iu;
// Running sprints, sprinters, weekend plans: not this.
const SPORT=/спринт\p{L}*\s+(?:в|на)\s+(?:бег|забег|\d+\s*(?:м|метр))|(?:бег\p{L}*|забег\p{L}*|легк\p{L}*\s+атлет\p{L}*|олимпи\p{L}*)\s+.*спринт|спринтер/iu;
const VELOCITY=/(?:^|[^\p{L}])(?:velocity|велосити)(?=$|[^\p{L}])|скорост\p{L}*\s+(?:нашей\s+)?(?:команд\p{L}*|спринт\p{L}*|разработк\p{L}*)|^(?:а\s+)?(?:какая|какова|покажи|посчитай|скажи)\s+(?:у\s+нас\s+|наша\s+)?скорость$|^наша\s+скорость$/iu;
const LOAD=/(?:перегруж|недогруж|загрузк|загружен|емкост|capacity|кэпасити|капасити)\p{L}*/iu;
const PLAN=/(?:сплан|планир|план\p{L}*\s+(?:на\s+)?(?:следующ\p{L}*\s+)?спринт|влез|войдет|поместит|успеем|возьмем|берем|брать|собер\p{L}*\s+спринт|состав\p{L}*\s+спринт|наполн|scope|скоуп|перенос\p{L}*\s+из\s+спринт|carry)/iu;
const APPLY=/^Перенеси в спринт «([^»\n]{1,120})» \(доска (\d{1,10}), ([A-Z][A-Z0-9_]{0,30})\):\s*([\s\S]{3,4000})$/u;
function kind(text){
 const t=clean(text);
 if(!t)return null;
 if(APPLY.test(String(text||'').trim()))return 'apply';
 // An explicit writing skill («/sprint-plan …», «скилл sprint-plan …») stays with the skill.
 if(/^\/|(?:^|\s)скилл/iu.test(t))return null;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:считать|работает|посчитать))/iu.test(t)&&!/у нас|нашей|наш/iu.test(t))return null;
 if(SPORT.test(t))return null;
 if(VELOCITY.test(t))return 'velocity';
 if(!SPRINT.test(t))return null;
 if(LOAD.test(t))return 'overload';
 if(PLAN.test(t))return 'plan';
 return null;
}
// «Маша в отпуске 12–16»: only for a person of «Команда» and with dates.
function absence(text,members,now){
 const note=absences.parseNote(clean(text),now);if(!note)return null;
 const m=absences.member(note.who,members);
 return m?{...note,m}:null;
}
function members(s){
 try{return require('../../team.cjs').members(s.settings);}catch{return [];}
}

// --- Project and board -----------------------------------------------------------------------------------------------
// The chat's Jira project: bound to the chat or its project memory, the only allowed one, or the working project;
// otherwise a question with the allowed projects.
function project(s,resume){
 const {allowed}=require('../../jira-routing.cjs');
 const keys=allowed(s.settings),topic=s.dialogue.active();
 const binding=s.projectMemory?.get?.(topic?.projectMemoryId)?.jira;
 const bound=topic?.jiraProject||(binding?.site===s.settings.jiraUrl&&binding.key);
 if(bound&&keys.includes(bound))return bound;
 if(keys.length===1)return keys[0];
 if(s.settings.jiraProject&&keys.includes(s.settings.jiraProject))return s.settings.jiraProject;
 if(!keys.length)return {question:'Отметьте доступные Пете проекты в подключениях Jira — тогда спланирую спринт.'};
 return ask({text:'Для какого проекта Jira планировать спринт?',label:'Проект Jira',options:keys.slice(0,12),strictChoices:true},answer=>resume(keys.find(k=>k.toLowerCase()===String(answer).trim().toLowerCase())));
}
const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
async function board(s,key,resume){
 const list=await agile.boards(s,key);
 if(!list.length)return {question:'В проекте '+key+' нет scrum-доски Jira: спринты бывают только на scrum-досках.'};
 const remembered=store(s).peek('board:'+s.settings.jiraUrl+':'+key);
 const chosen=list.find(b=>b.id===String(s.settings.jiraProject===key&&s.settings.jiraBoardId||''))||list.find(b=>b.id===remembered)||(list.length===1?list[0]:null);
 if(chosen)return chosen;
 const label=b=>b.name+' · '+b.id;
 return ask({text:'В проекте '+key+' несколько scrum-досок. По какой планировать? Запомню выбор.',label:'Доска',options:list.slice(0,12).map(label),strictChoices:true},answer=>{
  const b=list.find(x=>label(x).toLowerCase()===String(answer).trim().toLowerCase());
  if(!b)return {handled:true,text:'Такой доски нет. Повторите запрос.',error:true};
  store(s).set('board:'+s.settings.jiraUrl+':'+key,b.id);return resume(b);
 });
}

// --- The plan --------------------------------------------------------------------------------------------------------
const UNITS={points:['SP','SP','SP'],hours:['ч','ч','ч'],count:['задача','задачи','задач']};
const amount=(n,mode)=>{const v=plan.round(n);return String(v).replace('.',',')+' '+(mode==='count'?kit.plural(v,UNITS.count):UNITS[mode][0]);};
const byDate=x=>Date.parse(x.complete||x.end||x.start||'')||0;
const DAY=86400000;
// Members of «Команда» with a Jira account; without them, the people who completed issues in the last sprints.
function lanePeople(s,vel){
 const team=members(s).filter(m=>m.jiraId).map(m=>({key:absences.memberKey(m),name:m.name,role:m.role||'',jiraId:m.jiraId,email:m.email||''}));
 if(team.length)return {people:team,fromTeam:true};
 const seen=new Map();for(const r of vel.sprints)for(const [id,name] of Object.entries(r.names))if(!seen.has(id))seen.set(id,{key:id,name:name||id,role:'',jiraId:id,email:''});
 return {people:[...seen.values()].slice(0,20),fromTeam:false};
}
async function rationale(s,data){
 if(!s.settings.model)return [];
 try{
  const r=await kit.modelJSON(s,{system:'Ниже расчёт плана спринта (числа уже посчитаны кодом). Напиши ровно три короткие строки по-русски: 1) почему такой объём, 2) главный риск, 3) что сделать до старта спринта. До 20 слов в строке. Только из этих данных, без новых чисел, задач и имён.',
   user:data,schema:{type:'object',properties:{lines:{type:'array',items:{type:'string'},minItems:3,maxItems:3}},required:['lines']},predict:220,temperature:0.2});
  return (r?.lines||[]).map(l=>String(l).replace(/\s+/g,' ').replace(/^\s*\d[.)]\s*/,'').trim()).filter(l=>l.length>=6).slice(0,3).map(l=>l.slice(0,200));
 }catch{return [];}
}

async function build(s,key,b,{now=new Date(),fetcher}={}){
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 const url=k=>site+'/browse/'+encodeURIComponent(k);
 s.requestProgress?.report?.('Читаю спринты доски «'+b.name+'»');
 const est=await agile.estimation(s,key,b.id);
 const [closed,open]=await Promise.all([agile.sprints(s,key,b.id,'closed'),agile.sprints(s,key,b.id,'active,future')]);
 const recent=closed.sort((x,y)=>byDate(x)-byDate(y)).slice(-HISTORY);
 s.requestProgress?.report?.('Считаю скорость за '+recent.length+' '+kit.plural(recent.length,['спринт','спринта','спринтов']));
 const history=[];for(let i=0;i<recent.length;i+=3)history.push(...await Promise.all(recent.slice(i,i+3).map(async sprint=>({sprint,issues:await agile.sprintIssues(s,key,b.id,sprint.id,est)}))));
 const vel=plan.velocity(history);
 const active=open.find(x=>x.state==='active')||null;
 const next=open.filter(x=>x.state==='future').sort((x,y)=>(Date.parse(x.start||'')||Infinity)-(Date.parse(y.start||'')||Infinity)||Number(x.id)-Number(y.id))[0]||null;
 // The next sprint's dates: Jira's, or the first working day after the active sprint with the usual length
 // in working days (10 without history).
 let start,end;
 if(next?.start&&next?.end){start=new Date(next.start);end=new Date(next.end);}
 else{
  start=plan.dayStart(active?.end||now);if(active?.end&&new Date(active.end).getHours()>=12)start.setDate(start.getDate()+1);
  while([0,6].includes(start.getDay()))start.setDate(start.getDate()+1);
  end=new Date(start);for(let n=0,want=vel.days||10;n<want;end.setDate(end.getDate()+1))if(![0,6].includes(end.getDay()))n++;
  end=new Date(end.getTime()-DAY);end.setHours(18,0,0,0);
 }
 const days=plan.workdays(start,end);
 s.requestProgress?.report?.('Читаю текущий спринт и бэклог');
 const [current,planned,ranked]=await Promise.all([active?agile.sprintIssues(s,key,b.id,active.id,est):[],next?agile.sprintIssues(s,key,b.id,next.id,est):[],agile.backlog(s,key,b.id,est)]);
 const carry=current.filter(i=>!i.subtask&&i.category!=='done');
 const already=planned.filter(i=>!i.subtask&&i.category!=='done');
 const inNext=new Set(already.map(i=>i.key));
 const backlog=ranked.filter(i=>!inNext.has(i.key));
 const {people,fromTeam}=lanePeople(s,vel);
 // Absences: notes for this project and vacation events of the calendar app.
 const warnings=[];
 const team=members(s);
 const noted=absences.notes(s,key).map(n=>({...n,source:'note'}));
 let cal={rows:[],note:''};
 // The people records foundation (s.people) knows absences typed for «Отсутствия», the calendar and HR sources;
 // without it (or if it fails) the calendar is read here as before.
 let viaPeople=false;
 if(s.people?.absences){
  try{
   s.requestProgress?.report?.('Смотрю отсутствия команды');
   const r=await s.people.absences({from:plan.ymd(plan.dayStart(start)),to:plan.ymd(end),...fetcher?{fetcher}:{}});
   cal={rows:r.rows.map(a=>({member:a.member,name:a.name,from:a.from,to:a.to,kind:a.kind,source:a.source==='calendar'?'calendar':'people',title:a.title||a.sourceName||''})),note:r.notes.join(' ')};
   viaPeople=true;
  }catch{viaPeople=false;}
 }
 if(!viaPeople){
  try{s.requestProgress?.report?.('Смотрю отпуска в календаре');cal=await absences.fromCalendar(s,{from:plan.dayStart(start),to:end,members:team,...fetcher?{fetcher}:{}});}
  catch(e){cal={rows:[],note:'Календарь: '+(e.message||'не прочитан')+' — отпуска из него не учтены.'};}
 }
 if(cal.note)warnings.push(cal.note);
 const first=days[0]||plan.ymd(start),last=days.at(-1)||plan.ymd(end);
 const same=new Set(noted.map(n=>n.member+'|'+n.from+'|'+n.to));
 const away=[...noted,...cal.rows.filter(r=>!same.has(r.member+'|'+r.from+'|'+r.to))].filter(a=>a.to>=first&&a.from<=last);
 const cap=plan.capacity({vel,members:people,absences:away,days});
 const fitted=plan.fit({backlog,lanes:cap.lanes,teamCapacity:cap.team,base:[...carry,...already],mode:est.mode});
 const lanes=plan.loads(cap.lanes,{carry,planned:already,chosen:fitted.chosen});
 const committed=plan.round(plan.sum(carry,i=>i.estimate)+plan.sum(already,i=>i.estimate));
 const proposed=plan.round(plan.sum(fitted.chosen,i=>i.estimate));
 if(recent.length<MIN_HISTORY)warnings.push(recent.length?'Закрытых спринтов всего '+recent.length+' — скорость неточная.':'Закрытых спринтов ещё нет — скорость неизвестна, план не составить.');
 if(!next)warnings.push('Следующий спринт в Jira ещё не создан — даты взяты по обычной длине спринта, перенести задачи пока некуда.');
 if(!fromTeam)warnings.push('В «Команде» нет людей с аккаунтом Jira — ёмкость по тем, кто закрывал задачи в прошлых спринтах. Заполните «Команду» для точного расчёта.');
 if(fitted.unestimated)warnings.push('Без оценки в бэклоге: '+fitted.unestimated+' — они не планируются, пока их не оценят.');
 if(committed>cap.team+0.05)warnings.push('Перенос и уже запланированное ('+amount(committed,est.mode)+') больше ёмкости ('+amount(cap.team,est.mode)+').');
 const over=lanes.filter(l=>l.over);
 const item=i=>({key:i.key,summary:i.summary,estimate:i.estimate,status:i.status,category:i.category,assigneeId:i.assigneeId,assignee:i.assignee,priority:i.priority,type:i.type,url:url(i.key),
  ...i.proposedId?{proposedId:i.proposedId,proposed:i.proposed}:{},...i.reason?{reason:i.reason}:{},...i.person?{person:i.person}:{}});
 const card={project:key,site,board:{id:b.id,name:b.name,url:site+'/secure/RapidBoard.jspa?rapidView='+encodeURIComponent(b.id)},estimation:est,
  velocity:{sprints:vel.sprints.map(({by,names,...r})=>r),average:vel.average},
  active:active?{id:active.id,name:active.name,end:active.end}:null,
  next:{id:next?.id||'',name:next?.name||'Следующий спринт',start:start.toISOString(),end:end.toISOString(),workdays:days.length,exists:!!next,goal:next?.goal||''},
  capacity:{team:cap.team,full:cap.full,committed,proposed,left:fitted.left},
  people:lanes,absences:away.map(a=>({id:a.id||'',member:a.member,name:a.name,from:a.from,to:a.to,kind:a.kind,source:a.source,title:a.title||''})),
  carryOver:carry.map(item),planned:already.map(item),proposal:[...fitted.chosen.map(i=>({...item(i),include:true})),...fitted.skipped.map(i=>({...item(i),include:false}))],
  rationale:[],warnings,fromTeam,at:now.toISOString()};
 card.rationale=await rationale(s,{velocity:vel.sprints.map(r=>r.completed),average:vel.average,unit:est.mode,capacity:cap.team,carryOver:committed,proposed,left:fitted.left,
  absences:away.map(a=>a.name+' '+a.from+'—'+a.to),overloaded:over.map(l=>l.name+' '+l.load+'/'+l.capacity),unestimated:fitted.unestimated,sprintWorkdays:days.length});
 return card;
}

function summary(card,focus){
 const mode=card.estimation.mode,u=n=>amount(n,mode),v=card.velocity;
 const speed=v.sprints.length?'Скорость за '+v.sprints.length+' '+kit.plural(v.sprints.length,['спринт','спринта','спринтов'])+' — в среднем '+u(v.average)+' ('+v.sprints.map(r=>plan.round(r.completed)).join(', ')+').':'Закрытых спринтов нет — скорость неизвестна.';
 if(focus==='velocity')return speed;
 const over=card.people.filter(p=>p.over);
 const overText=over.length?'Перегружены: '+over.map(p=>p.name+' ('+plan.round(p.load)+' из '+plan.round(p.capacity)+')').join(', ')+'.':'Никто не перегружен.';
 if(focus==='overload')return '«'+card.next.name+'»: '+overText+' Ёмкость команды — '+u(card.capacity.team)+'.';
 const away=card.absences.length?' с учётом отсутствий ('+[...new Set(card.absences.map(a=>a.name))].join(', ')+')':'';
 const chosen=card.proposal.filter(p=>p.include);
 const carry=card.capacity.committed?' Перенос и уже в спринте — '+u(card.capacity.committed)+'.':'';
 return speed+' Ёмкость «'+card.next.name+'» — '+u(card.capacity.team)+away+'.'+carry+' Предлагаю взять '+chosen.length+' '+kit.plural(chosen.length,['задачу','задачи','задач'])+' на '+u(card.capacity.proposed)+'. '+overText;
}

async function planTurn(s,command,focus,{now=new Date(),fetcher}={}){
 const run=async key=>{
  if(!key)return kit.reply(s,command,{by:BY,text:'Такого проекта нет. Повторите запрос.',error:true});
  if(key.question)return kit.reply(s,command,{by:BY,question:true,text:key.question});
  const b=await board(s,key,picked=>go(key,picked));
  return b.question?kit.reply(s,command,{by:BY,question:true,text:b.question}):go(key,b);
 };
 const go=async(key,b)=>{
  const card=await build(s,key,b,{now,fetcher});
  return kit.reply(s,command,{by:BY,text:summary(card,focus),data:{sprintPlan:{...card,focus}},sources:[{title:'Jira · '+key+' · '+b.name,url:card.board.url}]});
 };
 return run(project(s,run));
}

async function absenceTurn(s,command,note){
 const resume=key=>{
  if(!key||key.question)return kit.reply(s,command,{by:BY,question:!!key?.question,text:key?.question||'Такого проекта нет.'});
  const row=absences.addNote(s,key,{member:absences.memberKey(note.m),name:note.m.name,from:note.from,to:note.to,kind:note.kind,text:clean(command).slice(0,200)});
  const day=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  return kit.reply(s,command,{by:BY,text:'Запомнил для планирования спринтов '+key+': '+row.name+' — '+(row.from===row.to?day(row.from):day(row.from)+' – '+day(row.to))+'. Учту при расчёте ёмкости; убрать можно на карточке плана.'});
 };
 return resume(project(s,resume));
}

// The prepared request from the card: staged in Jira's history flow, written only after «Перенести».
function parseApply(text){
 const m=APPLY.exec(String(text||'').trim());if(!m)return null;
 const rows=[];
 for(const part of m[4].split(/[;\n]+/).map(x=>x.trim()).filter(Boolean)){
  const r=/^([A-Z][A-Z0-9_]*-\d+)(?:\s*(?:→|->)\s*(.{1,120}))?$/u.exec(part);if(!r)return {error:'Не понял строку «'+part.slice(0,60)+'». Нужны ключи задач через «;», исполнитель — после «→».'};
  if(!r[1].startsWith(m[3]+'-'))return {error:'Задача '+r[1]+' не из проекта '+m[3]+'.'};
  if(!rows.some(x=>x.key===r[1]))rows.push({key:r[1],who:(r[2]||'').trim()});
 }
 if(!rows.length)return {error:'Нет задач для переноса.'};
 if(rows.length>30)return {error:'За раз переношу до 30 задач. Уберите часть на карточке.'};
 return {sprint:m[1],board:m[2],project:m[3],rows};
}
async function applyTurn(s,command){
 const p=parseApply(command);
 if(p.error)return kit.reply(s,command,{by:BY,error:true,text:p.error});
 const {allowed}=require('../../jira-routing.cjs');
 if(!allowed(s.settings).includes(p.project))return kit.reply(s,command,{by:BY,error:true,text:'Проект '+p.project+' недоступен в подключении Jira.'});
 const settings=agile.scoped(s,p.project),w=s.workspace;
 const sprint=(await agile.sprints(s,p.project,p.board,'active,future')).find(x=>x.name===p.sprint);
 if(!sprint)return kit.reply(s,command,{by:BY,error:true,text:'Спринта «'+p.sprint+'» нет среди активных и будущих спринтов доски. Обновите план.'});
 const team=members(s).filter(m=>m.jiraId);
 const people=[];
 for(const r of p.rows)if(r.who){const m=team.find(x=>x.name.toLowerCase()===r.who.toLowerCase());if(!m)return kit.reply(s,command,{by:BY,error:true,text:'«'+r.who+'» нет в «Команде» с аккаунтом Jira.'});r.jiraId=m.jiraId;if(!people.some(x=>x.id===m.jiraId))people.push({id:m.jiraId,name:m.name});}
 s.requestProgress?.report?.('Проверяю задачи в Jira');
 const {snapshot,changes}=require('../../history.cjs');
 const rows=[];
 for(const r of p.rows){
  const before=await snapshot(w,r.key,settings);
  const patch={};if(before.sprintId!==String(sprint.id))patch.sprintId=String(sprint.id);if(r.jiraId&&before.assigneeId!==r.jiraId)patch.assigneeId=r.jiraId;
  if(Object.keys(patch).length)rows.push({key:r.key,before,patch,changes:changes(before,patch,{people,sprints:[{id:String(sprint.id),name:sprint.name}]})});
 }
 if(!rows.length)return kit.reply(s,command,{by:BY,text:'Все эти задачи уже в «'+sprint.name+'» с нужными исполнителями — менять нечего.'});
 const entry={id:randomUUID(),schema:2,kind:'edit-existing',at:Date.now(),project:p.project,url:settings.jiraUrl,boardId:p.board,rows:rows.map(r=>({key:r.key,title:r.before.summary,state:'observed',canDelete:false,snapshot:r.before}))};
 const preview=w.actions.stage(entry,'edit',rows,'План спринта «'+sprint.name+'»');
 const moved=rows.filter(r=>r.patch.sprintId).length,assigned=rows.filter(r=>r.patch.assigneeId).length;
 const lines=rows.map(r=>r.key+' '+r.before.summary.slice(0,60)+(r.patch.assigneeId?' → '+people.find(x=>x.id===r.patch.assigneeId)?.name:''));
 const text='Перенесу в «'+sprint.name+'» '+moved+' '+kit.plural(moved,['задачу','задачи','задач'])+(assigned?' и назначу исполнителей у '+assigned:'')+':\n'+lines.join('\n')+'\nИзменятся только спринт и исполнитель; изменение попадёт в историю Jira, его можно откатить. Перенести?';
 const resume=async answer=>{
  if(String(answer).trim().toLowerCase()!=='перенести'){w.actions.previews.delete(preview.id);return kit.reply(s,command,{by:BY,text:'Не переношу. Jira не менялась.'});}
  if(!w.history.some(e=>e.id===entry.id)){w.history.push(entry);w.actions.persist();}
  s.requestProgress?.report?.('Переношу задачи в «'+sprint.name+'»');
  let result;
  try{result=await w.actions.apply(preview.id);}
  catch(e){return kit.reply(s,command,{by:BY,error:true,text:'Jira не изменена: '+e.message});}
  const op=result.operations?.find(o=>o.id===preview.id),done=op?.rows.filter(r=>r.state==='done')||[],bad=op?.rows.filter(r=>r.state!=='done')||[];
  const tail=bad.length?' Не выполнено: '+bad.map(r=>r.key+(r.state==='uncertain'?' (результат неизвестен — проверьте в Jira)':r.error?' ('+r.error+')':'')).join(', ')+'.':'';
  return kit.reply(s,command,{by:BY,error:!done.length,text:(done.length?'Готово: '+done.length+' '+kit.plural(done.length,['задача','задачи','задач'])+' в «'+sprint.name+'». Откатить можно в истории Jira.':'Ничего не перенесено.')+tail,
   sources:[{title:'Jira · '+sprint.name,url:settings.jiraUrl.replace(/\/+$/,'')+'/secure/RapidBoard.jspa?rapidView='+encodeURIComponent(p.board)}]});
 };
 resume.cancel=()=>{w.actions.previews.delete(preview.id);return {handled:true,text:'Не переношу. Jira не менялась.'};};
 return ask({text,label:'План спринта',options:['Перенести','Отмена'],strictChoices:true},resume);
}

function setup(s){
 return {ipc:{
  // The card's trash button on a note typed in the chat; calendar events are not removed here.
  removeAbsence:(projectKey,id)=>{
   if(!kit.installed(s,ID))throw Error('Расширение «Планирование спринта» не добавлено.');
   if(typeof projectKey!=='string'||!/^[A-Z][A-Z0-9_]{0,30}$/.test(projectKey)||typeof id!=='string'||id.length>80)throw Error('Некорректная отметка.');
   if(!absences.removeNote(s,projectKey,id))throw Error('Эта отметка уже удалена.');
   return {ok:true,text:'Отметка удалена — учту при следующем расчёте'};
  }
 }};
}

async function turn(s,command,deps={}){
 const text=String(command||'');
 if(!kit.installed(s,ID))return null;
 let k=kind(text);
 const note=!k?absence(text,members(s),deps.now||new Date()):null;
 if(!k&&!note)return null;
 if(!agile.connected(s))return kit.reply(s,command,{by:BY,question:true,text:'Для планирования спринта нужна Jira. Подключите её в «Подключениях» → Jira и отметьте проекты, потом повторите вопрос.'});
 try{
  if(note)return await absenceTurn(s,text,note);
  if(k==='apply')return await applyTurn(s,text);
  return await planTurn(s,text,k,deps);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'sprintPlanning',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,build,summary,parseApply,planTurn,applyTurn};
