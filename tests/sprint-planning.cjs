// «Планирование спринта»: routing incl. near-misses (running sprints, weekend plans, a task's work plan, team
// workload in general), not added / not connected, velocity from closed sprints (late resolutions and subtasks
// excluded), capacity from «Команда» and absences (chat note and calendar), carry-over, the fitted proposal,
// overload, the board and project questions, the confirmed move into Jira through the history flow, service
// errors and model-free behaviour. No network: Jira, the calendar and the local model are stubbed.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Workspace}=require('../src/workspace.cjs');
const app=require('../src/extensions/sprint-planning/feature.cjs');
const plan=require('../src/extensions/sprint-planning/plan.cjs');
const absences=require('../src/extensions/sprint-planning/absences.cjs');
const offer=require('../src/extensions/sprint-planning/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-12T09:00:00Z');
const SITE='https://studio.atlassian.net';
const TEAM=[{name:'Маша Петрова',aliases:'Маша',role:'Клиент',jiraId:'u-masha',email:'masha@studio.com'},{name:'Олег Смирнов',aliases:'Олег',role:'Сервер',jiraId:'u-oleg',email:'oleg@studio.com'},{name:'Иван Козлов',aliases:'Ваня',role:'Геймплей',jiraId:'u-ivan',email:'ivan@studio.com'}];
const F='customfield_10016';
const raw=(key,summary,points,assignee,cat='new',extra={})=>({key,fields:{summary,[F]:points,status:{name:cat==='done'?'Done':cat==='indeterminate'?'In Progress':'To Do',statusCategory:{key:cat}},
 assignee:assignee?{accountId:assignee,displayName:TEAM.find(m=>m.jiraId===assignee)?.name||assignee}:null,priority:{name:'Medium'},issuetype:{name:extra.subtask?'Sub-task':'Story',subtask:!!extra.subtask},resolutiondate:extra.resolved||null}});
// Five closed two-week sprints: Маша 10/14/12/8/16, Олег 10, Иван 8 → 28/32/30/26/34, average 30.
const CLOSED=[10,11,12,13,14].map((n,i)=>{const start=new Date(Date.UTC(2026,7,31+14*i,9));const end=new Date(start.getTime()+11*86400000+9*3600000);return {id:n,name:'GAME Sprint '+n,state:'closed',startDate:start.toISOString(),endDate:end.toISOString(),completeDate:end.toISOString()};});
const MASHA=[10,14,12,8,16];
const sprintIssues={};
CLOSED.forEach((sp,i)=>{const r=new Date(Date.parse(sp.completeDate)-86400000).toISOString();
 sprintIssues[sp.id]=[raw('GAME-'+(i*10+1),'Клиент '+i,MASHA[i],'u-masha','done',{resolved:r}),raw('GAME-'+(i*10+2),'Сервер '+i,10,'u-oleg','done',{resolved:r}),raw('GAME-'+(i*10+3),'Геймплей '+i,8,'u-ivan','done',{resolved:r}),
  raw('GAME-'+(i*10+4),'Не успели '+i,5,'u-oleg','new'),raw('GAME-'+(i*10+5),'Подзадача '+i,3,'u-ivan','done',{resolved:r,subtask:true})];});
// Done after the sprint closed: not this sprint's velocity.
sprintIssues[14].push(raw('GAME-49','Доделали позже',5,'u-oleg','done',{resolved:'2026-11-10T10:00:00Z'}));
const ACTIVE={id:15,name:'GAME Sprint 15',state:'active',startDate:'2026-11-09T09:00:00Z',endDate:'2026-11-20T18:00:00Z'};
const FUTURE={id:16,name:'GAME Sprint 16',state:'future',startDate:'2026-11-23T09:00:00Z',endDate:'2026-12-04T18:00:00Z'};
sprintIssues[15]=[raw('GAME-50','Матчмейкинг',5,'u-oleg','indeterminate'),raw('GAME-51','Экран магазина',3,'u-masha','done'),raw('GAME-52','Логи сервера',2,null,'new')];
sprintIssues[16]=[raw('GAME-60','Новый босс',3,'u-ivan','new')];
const BACKLOG=[raw('GAME-70','Кланы: список',8,'u-masha'),raw('GAME-71','Ежедневные награды',5,null),raw('GAME-72','Без оценки',null,null),raw('GAME-73','Турниры',13,'u-oleg'),
 raw('GAME-74','Push-уведомления',3,null),raw('GAME-75','Античит',5,'u-ivan'),raw('GAME-76','Реплеи',8,null),raw('GAME-77','Фикс локализации',2,null)];

function fixture(over={}){
 const calls=[],writes=[];
 const issues=new Map([...Object.values(sprintIssues).flat(),...BACKLOG].map(r=>[r.key,{fields:{...JSON.parse(JSON.stringify(r.fields)),updated:'1',project:{key:'GAME'},labels:[],subtasks:[],description:null,fixVersions:[],status:{id:'1',...r.fields.status}},sprint:null}]));
 for(const k of ['GAME-70','GAME-71','GAME-74','GAME-77'])issues.get(k).sprint=null;
 let tick=1;
 const routes={
  '/rest/agile/1.0/board':()=>({values:over.boards||[{id:7,name:'GAME board'}],isLast:true}),
  '/rest/agile/1.0/board/7/configuration':()=>over.configuration||({estimation:{type:'field',field:{fieldId:F,displayName:'Story point estimate'}}}),
  '/rest/agile/1.0/board/7/sprint':u=>({values:u.searchParams.get('state')==='closed'?CLOSED:over.open||[ACTIVE,FUTURE],isLast:true}),
  '/rest/agile/1.0/board/7/backlog':u=>{assert.equal(u.searchParams.get('jql'),'statusCategory != Done');if(!over.configuration)assert.ok(u.searchParams.get('fields').includes(F));return {issues:BACKLOG,total:BACKLOG.length};},
  '/api/chat':()=>({message:{content:JSON.stringify({lines:['Берём меньше обычного из-за отпуска Маши.','Риск — перенос матчмейкинга съест время Олега.','Оцените задачу без оценки до старта.']})}})
 };
 const request=async(address,options={})=>{
  const u=new URL(address),p=u.pathname,method=options.method||'GET';calls.push({url:u,method,options});
  if(over.fail&&p.startsWith('/rest/'))throw Object.assign(Error('Сервис вернул HTTP 401'),{status:401});
  if(p.startsWith('/rest/'))assert.equal(options.headers.Authorization,'Basic '+Buffer.from('lead@studio.com:jira-token').toString('base64'));
  const sprint=/^\/rest\/agile\/1\.0\/board\/7\/sprint\/(\d+)\/issue$/.exec(p);
  if(sprint){const all=sprintIssues[sprint[1]]||[];const start=Number(u.searchParams.get('startAt')||0);return {issues:all.slice(start,start+100),total:all.length,startAt:start};}
  if(p==='/api/chat')return routes[p]();
  if(method!=='GET'){
   writes.push({path:p,method,body:JSON.parse(options.body||'null')});
   if(p==='/rest/agile/1.0/sprint/16/issue'){for(const key of JSON.parse(options.body).issues){const i=issues.get(key);i.sprint={id:16,name:FUTURE.name,state:'future'};i.fields.updated=String(++tick);}return null;}
   const key=p.split('/').pop(),i=issues.get(key),body=JSON.parse(options.body);if(body.fields.assignee){i.fields.assignee={accountId:body.fields.assignee.accountId,displayName:TEAM.find(m=>m.jiraId===body.fields.assignee.accountId).name};}i.fields.updated=String(++tick);return null;
  }
  if(p.startsWith('/rest/api/3/issue/')){const i=issues.get(decodeURIComponent(p.split('/').pop()));assert.ok(i,'missing '+p);return {key:p.split('/').pop(),fields:JSON.parse(JSON.stringify(i.fields))};}
  if(p.startsWith('/rest/agile/1.0/issue/')){const i=issues.get(decodeURIComponent(p.split('/').pop()));return {fields:{sprint:i.sprint}};}
  if(p==='/rest/agile/1.0/sprint/16')return {id:16,state:'future'};
  if(p==='/rest/api/3/user/assignable/search')return TEAM.map(m=>({accountId:m.jiraId,displayName:m.name,active:true}));
  const route=routes[p];assert.ok(route,'unexpected request '+method+' '+address);return route(u,options);
 };
 const settings={extension_sprint_planning:'x','extension_sprint-planning':'true',module_jira:'true',jiraUrl:SITE,jiraEmail:'lead@studio.com',jiraToken:'jira-token',jiraProjects:'GAME',jiraProject:'GAME',jiraBoardId:'',
  teamMembers:JSON.stringify(TEAM),model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_calendar:'false',...over.settings};
 const workspace=new Workspace({settings:()=>settings,request,save:()=>{}});
 const topic={id:'t1',title:'Чат',projectId:'general',messages:[]};
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-sprint-'));
 const s={settings,workspace,request,dataRoot,modules:require('../src/modules.cjs'),requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'general',name:'Общий'}],activeProjectId:'general'}}};
 return {s,calls,writes,topic,issues,settings};
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'спланируй спринт':'plan','что влезет в следующий спринт':'plan','Петя, что влезет в следующий спринт?':'plan','какая у нас скорость':'velocity','какая у нас скорость?':'velocity','velocity команды':'velocity','скорость команды за последние спринты':'velocity',
  'кто перегружен в спринте':'overload','загрузка в следующем спринте':'overload','план на следующий спринт':'plan','что успеем в этом спринте':'plan'};
 for(const [p,k] of Object.entries(own))assert.equal(app.kind(p),k,p);
 for(const p of ['спринт в беге','как бежать спринт на 100 метров','планы на выходные','план работ по задаче GAME-12','загрузка команды','кто перегружен','кто сколько задач','какая скорость интернета','что такое velocity','какие задачи в спринте','итоги спринта','ретро спринта','сколько задач у Маши',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 assert.ok(app.parseApply('Перенеси в спринт «GAME Sprint 16» (доска 7, GAME): GAME-71 → Маша Петрова; GAME-74').rows.length===2);
 assert.match(app.parseApply('Перенеси в спринт «S» (доска 7, GAME): OTHER-1').error,/не из проекта/);

 // --- Pure parts ------------------------------------------------------------------------------------------------
 assert.equal(plan.workdays('2026-11-23T09:00:00Z','2026-12-04T18:00:00Z').length,10);
 assert.equal(plan.workdays('2026-11-23T09:00:00Z','2026-12-07T09:00:00Z').length,10,'a sprint ending on Monday morning does not count that Monday');
 const note=absences.parseNote('Маша в отпуске 23–27',NOW);
 assert.deepEqual([note.who,note.from,note.to,note.kind],['Маша','2026-11-23','2026-11-27','vacation']);
 assert.deepEqual(absences.parseNote('Олег на больничном с 30 ноября по 2 декабря',NOW).to,'2026-12-02');
 assert.equal(absences.parseNote('Ваня не будет 3.12',NOW).from,'2026-12-03');
 assert.equal(absences.parseNote('Маша в отпуске',NOW),null,'no dates → not a note');
 assert.equal(absences.parseNote('я в отпуске мечтаю о море',NOW),null);
 for(const p of ['Маша не будет 5 минут','Олег не будет с 10 до 12 часов','Маша не будет до 18:00','Ваня не будет до 5 вечера','Маша в отпуске 2 недели','Олег не будет 3'])assert.equal(absences.parseNote(p,NOW),null,'not days: '+p);
 assert.equal(absences.parseNote('Олег на больничном до 20-го',NOW).to,'2026-11-20');assert.equal(absences.parseNote('Маша не будет 20 ноября',NOW).from,'2026-11-20');
 assert.equal(absences.member('Маши',TEAM).jiraId,'u-masha');assert.equal(absences.member('Олегу',TEAM).jiraId,'u-oleg');

 // --- Not added / not connected ------------------------------------------------------------------------------------
 let f=fixture({settings:{'extension_sprint-planning':'false'}});
 assert.equal(await app.turn(f.s,'спланируй спринт'),null);
 f=fixture({settings:{jiraToken:'',jiraEmail:''}});
 const q=await app.turn(f.s,'спланируй спринт');
 assert.equal(q.question,true);assert.match(q.text,/Подключениях/);assert.equal(f.calls.length,0);
 for(const p of ['загрузка команды','кто перегружен','спринт в беге','план работ по задаче'])assert.equal(await app.turn(f.s,p),null,p);

 // --- Absence note typed in the chat ------------------------------------------------------------------------------
 f=fixture();
 const noted=await app.turn(f.s,'Маша в отпуске 23–27',{now:NOW});
 assert.match(noted.text,/Маша Петрова — 23 ноября – 27 ноября/);assert.equal(absences.notes(f.s,'GAME').length,1);
 assert.equal(await app.turn(f.s,'Пётр в отпуске 23–27',{now:NOW}),null,'somebody outside «Команда» is not captured');

 // --- Happy path: the plan ------------------------------------------------------------------------------------------
 const r=await app.turn(f.s,'спланируй спринт',{now:NOW});
 const c=r.extensionData.sprintPlan;
 assert.equal(r.by,'Планирование спринта');
 assert.deepEqual(c.velocity.sprints.map(x=>x.completed),[28,32,30,26,34],'late resolution and subtasks are not velocity');
 assert.equal(c.velocity.average,30);
 assert.deepEqual(c.estimation,{mode:'points',field:F,label:'Story point estimate'});
 assert.equal(c.next.id,'16');assert.equal(c.next.workdays,10);assert.equal(c.next.exists,true);
 const lane=id=>c.people.find(p=>p.jiraId===id);
 assert.equal(lane('u-masha').absent,5);assert.equal(lane('u-masha').capacity,6,'Маша: share 12 of 30, half the sprint away');
 assert.equal(lane('u-oleg').capacity,10);assert.equal(lane('u-ivan').capacity,8);assert.equal(c.capacity.team,24);
 assert.deepEqual(c.carryOver.map(i=>i.key),['GAME-50','GAME-52'],'done issues of the active sprint are not carried over');
 assert.deepEqual(c.planned.map(i=>i.key),['GAME-60']);
 assert.equal(c.capacity.committed,10);
 const chosen=c.proposal.filter(p=>p.include);
 assert.deepEqual(chosen.map(p=>[p.key,p.proposed||p.assignee]),[['GAME-71','Маша Петрова'],['GAME-74','Иван Козлов'],['GAME-77','Олег Смирнов']]);
 assert.equal(c.capacity.proposed,10);
 const skipped=Object.fromEntries(c.proposal.filter(p=>!p.include).map(p=>[p.key,p.reason]));
 assert.deepEqual(skipped,{'GAME-70':'person-full','GAME-72':'unestimated','GAME-73':'no-room','GAME-75':'person-full','GAME-76':'no-room'});
 assert.equal(c.people.filter(p=>p.over).length,0);
 assert.ok(c.warnings.some(w=>/Без оценки в бэклоге: 1/.test(w)));
 assert.deepEqual(c.absences.map(a=>[a.name,a.from,a.to,a.source]),[['Маша Петрова','2026-11-23','2026-11-27','note']]);
 assert.deepEqual(c.rationale,[],'no model → no rationale, the card is complete without it');
 assert.match(r.text,/в среднем 30 SP \(28, 32, 30, 26, 34\)/);assert.match(r.text,/Ёмкость «GAME Sprint 16» — 24 SP с учётом отсутствий \(Маша Петрова\)/);assert.match(r.text,/3 задачи на 10 SP/);
 assert.equal(f.writes.length,0,'planning only reads');
 assert.equal(f.topic.messages.at(-1).sources[0].url,SITE+'/secure/RapidBoard.jspa?rapidView=7');
 // Overload in the sprint: Олег's carry-over grows beyond his capacity.
 sprintIssues[15].push(raw('GAME-53','Срочный хотфикс',8,'u-oleg','indeterminate'));
 const o=await app.turn(f.s,'кто перегружен в спринте',{now:NOW});
 assert.match(o.text,/Перегружены: Олег Смирнов \(13 из 10\)/);assert.equal(o.extensionData.sprintPlan.focus,'overload');
 sprintIssues[15].pop();
 const v=await app.turn(f.s,'какая у нас скорость',{now:NOW});
 assert.match(v.text,/^Скорость за 5 спринтов — в среднем 30 SP/);

 // --- With the model: three rationale lines ------------------------------------------------------------------------
 f.settings.model='qwen3:8b';
 const m=await app.turn(f.s,'спланируй спринт',{now:NOW});
 assert.equal(m.extensionData.sprintPlan.rationale.length,3);
 const modelCall=f.calls.find(x=>x.url.pathname==='/api/chat');assert.ok(!/GAME-7/.test(JSON.parse(modelCall.options.body).messages[1].content),'the model gets numbers, not the backlog');
 f.settings.model='';

 // --- Calendar absences (calendar app added, Google account with calendar access) -----------------------------------
 const cal=fixture({settings:{extension_calendar:'true',gmailCredential:JSON.stringify({accounts:[{id:'a1',email:'lead@studio.com',tokens:{scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'}}]})}});
 cal.s.mailAccounts={google:{client:()=>({access:async()=>'g-token'})}};
 const fetcher=async url=>{assert.match(url,/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/);return {ok:true,json:async()=>({items:[
  {id:'e1',summary:'Отпуск Олег',start:{date:'2026-11-30'},end:{date:'2026-12-02'},status:'confirmed'},
  {id:'e2',summary:'Планирование спринта',start:{dateTime:'2026-11-23T10:00:00Z'},end:{dateTime:'2026-11-23T11:00:00Z'}},
  {id:'e3',summary:'OOO',start:{date:'2026-12-03'},end:{date:'2026-12-04'},organizer:{email:'ivan@studio.com'}}]})};};
 const withCal=(await app.planTurn(cal.s,'спланируй спринт','plan',{now:NOW,fetcher})).extensionData.sprintPlan;
 assert.deepEqual(withCal.absences.map(a=>[a.name,a.from,a.to,a.source]),[['Олег Смирнов','2026-11-30','2026-12-01','calendar'],['Иван Козлов','2026-12-03','2026-12-03','calendar']]);
 assert.equal(withCal.people.find(p=>p.jiraId==='u-oleg').absent,2);assert.equal(withCal.people.find(p=>p.jiraId==='u-ivan').absent,1);

 // --- Count estimation when the board estimates nothing -------------------------------------------------------------
 const count=fixture({configuration:{}});
 const ccr=await app.turn(count.s,'спланируй спринт',{now:NOW});assert.ok(ccr.extensionData,ccr.text);const cc=ccr.extensionData.sprintPlan;
 assert.equal(cc.estimation.mode,'count');assert.deepEqual(cc.velocity.sprints.map(x=>x.completed),[3,3,3,3,3]);

 // --- Several projects and boards: questions, never a guess ---------------------------------------------------------
 const two=fixture({settings:{jiraProjects:'GAME,WEB',jiraProject:''}});
 await assert.rejects(app.turn(two.s,'спланируй спринт',{now:NOW}),e=>e instanceof InputRequired&&e.spec.options.join()==='GAME,WEB');
 let resumed;try{await app.turn(two.s,'спланируй спринт',{now:NOW});}catch(e){resumed=await e.resume('GAME');}
 assert.equal(resumed.extensionData.sprintPlan.project,'GAME');
 const boards=fixture({boards:[{id:7,name:'GAME board'},{id:8,name:'GAME art'}]});
 let boardQ;try{await app.turn(boards.s,'спланируй спринт',{now:NOW});}catch(e){boardQ=e;}
 assert.ok(boardQ instanceof InputRequired);assert.deepEqual(boardQ.spec.options,['GAME board · 7','GAME art · 8']);
 const viaBoard=await boardQ.resume('GAME board · 7');assert.equal(viaBoard.extensionData.sprintPlan.board.id,'7');
 assert.equal((await app.turn(boards.s,'спланируй спринт',{now:NOW})).extensionData.sprintPlan.board.id,'7','the chosen board is remembered');
 // No future sprint yet: the plan is computed, moving is not possible.
 const nofuture=fixture({open:[ACTIVE]});
 const nf=(await app.turn(nofuture.s,'спланируй спринт',{now:NOW})).extensionData.sprintPlan;
 assert.equal(nf.next.exists,false);assert.equal(nf.next.workdays,10);assert.ok(nf.warnings.some(w=>/ещё не создан/.test(w)));

 // --- Moving into Jira: preview first, write only after «Перенести» ----------------------------------------------
 const ap=fixture();
 const request='Перенеси в спринт «GAME Sprint 16» (доска 7, GAME): GAME-71 → Маша Петрова; GAME-74 → Иван Козлов; GAME-77';
 let confirm;try{await app.turn(ap.s,request);}catch(e){confirm=e;}
 assert.ok(confirm instanceof InputRequired,'a confirmation question, not a write');
 assert.deepEqual(confirm.spec.options,['Перенести','Отмена']);assert.match(confirm.spec.text,/Перенесу в «GAME Sprint 16» 3 задачи и назначу исполнителей у 2/);
 assert.equal(ap.writes.length,0);
 const cancelled=await confirm.resume('Отмена');assert.match(cancelled.text,/Jira не менялась/);assert.equal(ap.writes.length,0);
 try{await app.turn(ap.s,request);}catch(e){confirm=e;}
 const done=await confirm.resume('Перенести');
 assert.match(done.text,/Готово: 3 задачи в «GAME Sprint 16»/);
 assert.deepEqual(ap.writes.map(w=>w.method+' '+w.path),['PUT /rest/api/3/issue/GAME-71','POST /rest/agile/1.0/sprint/16/issue','PUT /rest/api/3/issue/GAME-74','POST /rest/agile/1.0/sprint/16/issue','POST /rest/agile/1.0/sprint/16/issue']);
 assert.equal(ap.issues.get('GAME-71').fields.assignee.accountId,'u-masha');assert.equal(ap.s.workspace.history.length,1,'recorded in the Jira history (undo)');
 // A name outside «Команда» is refused before anything is read or written.
 const bad=await app.turn(ap.s,'Перенеси в спринт «GAME Sprint 16» (доска 7, GAME): GAME-76 → Пётр');assert.equal(bad.error,true);assert.match(bad.text,/нет в «Команде»/);
 const unknown=await app.turn(ap.s,'Перенеси в спринт «GAME Sprint 99» (доска 7, GAME): GAME-76');assert.match(unknown.text,/нет среди активных и будущих/);

 // --- Service error ---------------------------------------------------------------------------------------------------
 const err=fixture({fail:true});
 const e=await app.turn(err.s,'спланируй спринт',{now:NOW});
 assert.equal(e.error,true);assert.match(e.text,/^Планирование спринта · /);

 // --- Offer -----------------------------------------------------------------------------------------------------------
 assert.equal(offer.ready({'extension_sprint-planning':'true',module_jira:'true',jiraUrl:SITE,jiraEmail:'a@b.c',jiraToken:'t'}),true);
 assert.equal(offer.ready({'extension_sprint-planning':'true',module_jira:'true'}),false);

 // --- The card's removal of a note ------------------------------------------------------------------------------------
 const ipc=app.setup(f.s).ipc;const id=absences.notes(f.s,'GAME')[0].id;
 assert.equal(ipc.removeAbsence('GAME',id).ok,true);assert.equal(absences.notes(f.s,'GAME').length,0);assert.throws(()=>ipc.removeAbsence('GAME',id),/уже удалена/);
 console.log('Sprint planning: routing and near-misses, velocity, capacity with absences (chat and calendar), carry-over, fitted proposal, overload, questions, confirmed move through Jira history, errors passed');
})().catch(e=>{console.error(e);process.exit(1);});
