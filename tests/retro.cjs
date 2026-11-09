// «Ретро»: routing incl. near-misses (retro styles, sprint planning, a failed build, definitions), not added / not
// connected, the sprint's facts from Jira (velocity against the previous sprints, carry-over, bugs), CI failures
// (GitHub Actions), incidents (a monitor source), decisions / complaints / open questions from meeting summaries
// and from a messenger source, every fact with its source; drafts by rules and by the model (items citing missing
// facts or the wrong tone dropped), a named sprint, the board question, votes, and service errors. No network:
// Jira, GitHub, the monitor and messenger sources and the local model are stubbed.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Workspace}=require('../src/workspace.cjs');
const app=require('../src/extensions/retro/feature.cjs');
const collect=require('../src/extensions/retro/collect.cjs');
const {rules,check}=require('../src/extensions/retro/drafts.cjs');
const offer=require('../src/extensions/retro/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const monitors=require('../src/features/monitor-sources.cjs');
const messengers=require('../src/features/messenger-sources.cjs');

const NOW=new Date('2026-11-12T09:00:00Z');
const SITE='https://studio.atlassian.net';
const TEAM=[{name:'Маша Петрова',jiraId:'u-masha'},{name:'Олег Смирнов',jiraId:'u-oleg'}];
const F='customfield_10016';
const raw=(key,summary,points,assignee,cat='new',extra={})=>({key,fields:{summary,[F]:points,status:{name:cat==='done'?'Done':'To Do',statusCategory:{key:cat}},
 assignee:assignee?{accountId:assignee,displayName:assignee}:null,priority:{name:'Medium'},issuetype:{name:extra.type||'Story',subtask:!!extra.subtask},resolutiondate:extra.resolved||null}});
const CLOSED=[10,11,12,13].map((n,i)=>{const start=new Date(Date.UTC(2026,8,14+14*i,9));const end=new Date(start.getTime()+11*86400000+9*3600000);return {id:n,name:'GAME Sprint '+n,state:'closed',startDate:start.toISOString(),endDate:end.toISOString(),completeDate:end.toISOString()};});
const ACTIVE={id:14,name:'GAME Sprint 14',state:'active',startDate:'2026-11-02T09:00:00Z',endDate:'2026-11-13T18:00:00Z',goal:'Кланы'};
const issues={};
CLOSED.forEach((sp,i)=>{const r=new Date(Date.parse(sp.completeDate)-86400000).toISOString();issues[sp.id]=[raw('GAME-'+(i*10+1),'A',10,'u-masha','done',{resolved:r}),raw('GAME-'+(i*10+2),'B',10+i*2,'u-oleg','done',{resolved:r})];});
// Average of the previous sprints: 20, 22, 24, 26 → 23. This sprint: 13 done of 34 taken.
issues[14]=[raw('GAME-50','Матчмейкинг',8,'u-oleg','indeterminate'),raw('GAME-51','Экран магазина',5,'u-masha','done',{resolved:'2026-11-06T10:00:00Z'}),raw('GAME-52','Логи сервера',8,null,'done',{resolved:'2026-11-10T10:00:00Z'}),
 raw('GAME-53','Краш при входе',3,'u-masha','new',{type:'Bug'}),raw('GAME-54','Опечатка в магазине',1,'u-masha','done',{type:'Bug',resolved:'2026-11-05T10:00:00Z'}),raw('GAME-55','Кланы: список',8,'u-masha','new'),raw('GAME-56','Подзадача',1,'u-oleg','done',{subtask:true})];
const RUNS=[
 {id:1,name:'Build Android',workflow_id:11,run_number:301,status:'completed',conclusion:'failure',created_at:'2026-11-04T10:00:00Z',updated_at:'2026-11-04T10:20:00Z',head_branch:'main',html_url:'https://github.com/studio/game/actions/runs/1'},
 {id:2,name:'Build Android',workflow_id:11,run_number:302,status:'completed',conclusion:'failure',created_at:'2026-11-06T10:00:00Z',updated_at:'2026-11-06T10:20:00Z',head_branch:'main',html_url:'https://github.com/studio/game/actions/runs/2'},
 {id:3,name:'Build Android',workflow_id:11,run_number:303,status:'completed',conclusion:'success',created_at:'2026-11-07T10:00:00Z',updated_at:'2026-11-07T10:20:00Z',head_branch:'main',html_url:'https://github.com/studio/game/actions/runs/3'},
 {id:4,name:'Tests',workflow_id:12,run_number:90,status:'completed',conclusion:'success',created_at:'2026-11-07T11:00:00Z',updated_at:'2026-11-07T11:20:00Z',head_branch:'main',html_url:'https://github.com/studio/game/actions/runs/4'},
 {id:5,name:'Build Android',workflow_id:11,run_number:250,status:'completed',conclusion:'failure',created_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-01T10:20:00Z',head_branch:'main',html_url:'https://github.com/studio/game/actions/runs/5'}
];
const MEMORY=[{id:'summary:m1',sessionId:'m1',kind:'summary',title:'Сводка встречи · 5 нояб., 12:00',at:Date.parse('2026-11-05T12:30:00Z'),
 summary:{discussed:['Сервер опять тормозит под нагрузкой','План по кланам'],decisions:['Переходим на Addressables в следующем спринте'],tasks:[],notDiscussed:['Кто отвечает за релизные заметки']}},
 {id:'summary:old',sessionId:'old',kind:'summary',title:'Сводка встречи · 1 окт.',at:Date.parse('2026-10-01T12:00:00Z'),summary:{discussed:[],decisions:['Старое решение'],tasks:[],notDiscussed:[]}}];

function fixture(over={}){
 const calls=[];
 const request=async(address,options={})=>{
  const u=new URL(address),p=u.pathname,method=options.method||'GET';calls.push({url:u,method});
  assert.equal(method==='GET'||p==='/api/chat',true,'retro only reads: '+method+' '+address);
  if(p==='/api/chat'){assert.ok(over.model,'the model is asked only when chosen');return {message:{content:JSON.stringify(over.model)}};}
  if(u.hostname==='api.github.com'){assert.equal(p,'/repos/studio/game/actions/runs');return {workflow_runs:RUNS};}
  if(over.fail)throw Object.assign(Error('Сервис вернул HTTP 401'),{status:401});
  if(p==='/rest/agile/1.0/board')return {values:over.boards||[{id:7,name:'GAME board'}],isLast:true};
  if(p==='/rest/agile/1.0/board/7/configuration')return {estimation:{type:'field',field:{fieldId:F,displayName:'Story Points'}}};
  if(p==='/rest/agile/1.0/board/7/sprint')return {values:u.searchParams.get('state')==='closed'?CLOSED:[ACTIVE],isLast:true};
  const m=/^\/rest\/agile\/1\.0\/board\/7\/sprint\/(\d+)\/issue$/.exec(p);
  if(m){const all=issues[m[1]]||[];return {issues:all,total:all.length,startAt:0};}
  throw Error('unexpected request '+method+' '+address);
 };
 const settings={extension_retro:'true',module_jira:'true',jiraUrl:SITE,jiraEmail:'lead@studio.com',jiraToken:'jira-token',jiraProjects:'GAME',jiraProject:'GAME',jiraBoardId:'',
  teamMembers:JSON.stringify(TEAM),model:over.model?'qwen3:8b':'',ollamaUrl:'http://127.0.0.1:11434/api/chat',
  'extension_ci-builds':'true',githubToken:'test-token',githubRepos:'studio/game',extension_monitoring:'true',extension_chatmsg:'true',...over.settings};
 const workspace=new Workspace({settings:()=>settings,request,save:()=>{}});
 const topic={id:'t1',title:'Чат',projectId:'general',messages:[]};
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-retro-'));
 const s={settings,workspace,request,dataRoot,modules:require('../src/modules.cjs'),requestProgress:{report(){}},memory:{prune:()=>MEMORY},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'general',name:'Общий'}],activeProjectId:'general'}}};
 s.monitorSources=monitors.create(s,{sources:[{id:'prom',extension:'monitoring',setting:'extension_monitoring',name:'Prometheus',color:'',source:{ready:()=>true,
  history:async(_s,q)=>{assert.ok(q.from<=Date.parse('2026-11-02T09:00:00Z')&&q.to>=Date.parse('2026-11-11T00:00:00Z'));return [{service:'api',status:'critical',from:'2026-11-08T21:10:00Z',to:'2026-11-08T21:50:00Z',title:'api недоступен',kind:'uptime'},{service:'cdn',status:'warn',from:'2026-11-09T10:00:00Z',to:'2026-11-09T10:05:00Z',title:'медленно',kind:'alert'}];}}}]});
 s.messengerSources=messengers.create(s,{now:()=>+NOW,sources:[{id:'chatmsg',extension:'chatmsg',setting:'extension_chatmsg',name:'Mattermost',source:{name:'Mattermost',ready:()=>true,
  channels:async()=>[{id:'c1',name:'dev'}],
  messages:async()=>({messages:[
   {id:'m1',channel:{id:'c1',name:'dev'},author:{id:'u1',name:'Маша'},text:'Сборка опять упала, никто не ревьюит мои PR третий день',at:'2026-11-06T09:00:00Z',url:'https://chat.studio.example/dev/pl/m1'},
   {id:'m2',channel:{id:'c1',name:'dev'},author:{id:'u2',name:'Олег'},text:'Договорились: релизные заметки пишет Аня',at:'2026-11-07T09:00:00Z',url:'https://chat.studio.example/dev/pl/m2'},
   {id:'m3',channel:{id:'c1',name:'dev'},author:{id:'b',name:'bot'},bot:true,text:'Сборка упала: Build Android #302',at:'2026-11-06T10:20:00Z'},
   {id:'m4',channel:{id:'c1',name:'dev'},author:{id:'u1',name:'Маша'},text:'всем привет, обед в 13',at:'2026-11-06T09:30:00Z'}]})}}]});
 return {s,calls,topic,settings};
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 for(const p of ['подготовь ретро','Петя, подготовь ретро','подготовь ретроспективу','собери ретро по спринту 14','проведём ретро команды','ретро спринта','ретроспектива по прошлому спринту',
  'что пошло не так в спринте','что пошло не так в этом спринте?','что было хорошо в прошлом спринте','итоги спринта','подведи итоги спринта','давай подготовим ретро'])
  assert.equal(app.kind(p),'retro',p);
 for(const p of ['ретро музыка','ретро-стиль','включи ретро игры','ретроград Меркурий','покажи ретро фильмы','сделай фото в стиле ретро','что такое ретроспектива','как проводить ретро',
  'спланируй спринт','что влезет в следующий спринт','что пошло не так','что пошло не так с билдом','почему упала сборка','сводка встречи','какая у нас скорость','/retro','ретро вечеринка в пятницу',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 assert.equal(app.named('ретро по спринту 12'),'12');assert.equal(app.named('ретро по «GAME Sprint 13»'),'GAME Sprint 13');assert.equal(app.named('подготовь ретро'),'');

 // --- Not added / not connected -------------------------------------------------------------------------------------
 let f=fixture({settings:{extension_retro:'false'}});
 assert.equal(await app.turn(f.s,'подготовь ретро'),null);
 f=fixture({settings:{jiraToken:'',jiraEmail:''}});
 const q=await app.turn(f.s,'подготовь ретро',{now:NOW});
 assert.equal(q.question,true);assert.match(q.text,/нужна Jira/);assert.equal(f.calls.length,0);

 // --- Happy path without a model --------------------------------------------------------------------------------------
 f=fixture();
 const r=await app.turn(f.s,'подготовь ретро',{now:NOW});
 const c=r.extensionData.retroCard;
 assert.equal(r.by,'Ретро');
 assert.equal(c.sprint.name,'GAME Sprint 14','the active sprint ends tomorrow: it is the one to look back at');
 assert.deepEqual(c.velocity.sprints.map(x=>x.completed),[20,22,24,26,14]);assert.equal(c.velocity.average,23);
 const kinds=c.facts.map(x=>x.kind);
 assert.deepEqual([...new Set(kinds)],['velocity','carry','bugs','ci','incident','decision','complaint','open']);
 const byKind=k=>c.facts.filter(x=>x.kind===k);
 assert.match(byKind('velocity')[0].text,/^Закрыто пока 14 SP из 33 SP взятых \(в среднем за прошлые 4 — 23 SP\)$/);assert.equal(byKind('velocity')[0].tone,'bad');
 assert.equal(byKind('velocity')[0].source.url,SITE+'/issues/?jql='+encodeURIComponent('sprint = 14'));
 assert.match(byKind('carry')[0].text,/^Не закрыто 3 из 6 на 19 SP: GAME-50, GAME-53, GAME-55$/);
 assert.deepEqual(byKind('carry')[0].issues.map(i=>i.url),[SITE+'/browse/GAME-50',SITE+'/browse/GAME-53',SITE+'/browse/GAME-55']);
 assert.match(byKind('bugs')[0].text,/Баги в спринте: 2, закрыто 1, открыто: GAME-53/);
 assert.equal(byKind('ci').length,1,'only the workflow that failed, only runs inside the sprint');
 assert.match(byKind('ci')[0].text,/«Build Android» \(studio\/game\) падал 2 из 3 запусков/);assert.equal(byKind('ci')[0].source.url,'https://github.com/studio/game/actions/runs/2');
 assert.equal(byKind('incident').length,1,'critical outages only');assert.match(byKind('incident')[0].text,/api — api недоступен \(40 мин\)/);assert.equal(byKind('incident')[0].source.name,'Prometheus');
 const decisions=byKind('decision');
 assert.deepEqual(decisions.map(d=>d.source.kind),['meeting','messenger']);
 assert.match(decisions[0].text,/Addressables/);assert.equal(decisions[0].source.label,'Встреча · 5 нояб., 12:00');
 assert.ok(!c.facts.some(x=>/Старое решение/.test(x.text)),'meetings outside the sprint are not facts');
 assert.equal(decisions[1].source.url,'https://chat.studio.example/dev/pl/m2');assert.equal(decisions[1].author,'Олег');
 assert.deepEqual(byKind('complaint').map(x=>x.source.kind),['meeting','messenger']);
 assert.ok(!c.facts.some(x=>/обед|Build Android #302/.test(x.text)),'small talk and bots are not facts');
 assert.match(byKind('open')[0].text,/релизные заметки/);
 assert.ok(c.facts.every(x=>x.source&&x.source.label&&/^F\d+$/.test(x.id)),'every fact names its source');
 // Drafts by rules: every item cites existing facts; «попробовать» follows the problems.
 const ids=new Set(c.facts.map(x=>x.id));
 for(const col of ['good','bad','try'])for(const item of c.drafts[col])assert.ok(item.facts.length&&item.facts.every(id=>ids.has(id)),col+': '+item.text);
 assert.equal(c.drafts.by,'rules');
 assert.ok(c.drafts.try.some(i=>/Брать в спринт меньше/.test(i.text)));assert.ok(c.drafts.try.some(i=>/дежурного по сборке/.test(i.text)));assert.ok(c.drafts.try.some(i=>/пост-мортеме/.test(i.text)));
 assert.ok(c.drafts.good.some(i=>/Addressables/.test(i.text)));
 assert.deepEqual(c.team,[{key:'u-masha',name:'Маша Петрова'},{key:'u-oleg',name:'Олег Смирнов'}]);
 assert.deepEqual(c.sources,{jira:true,ci:true,monitoring:true,meetings:1,messengers:['Mattermost']});
 assert.match(r.text,/^Ретро «GAME Sprint 14»: \d+ фактов из Jira, CI, мониторинга, встреч, Mattermost\./);
 assert.match(r.text,/задачи создаю только через трекер после подтверждения/);
 assert.ok(!f.calls.some(x=>x.method!=='GET'),'nothing is written');

 // --- With the model: items citing missing facts or the wrong tone are dropped ---------------------------------------
 const good=c.facts.find(x=>x.tone==='good').id,bad=c.facts.find(x=>x.kind==='carry').id,ci=c.facts.find(x=>x.kind==='ci').id;
 const m=fixture({model:{good:[{text:'Договорились про Addressables',facts:[good]},{text:'Выдуманный успех',facts:['F99']},{text:'Хорошо, что перенесли задачи',facts:[bad]}],
  bad:[{text:'Много переноса',facts:[bad]},{text:'Без основания',facts:[]}],try:[{text:'Дежурный по CI',facts:[ci]}]}});
 const mc=(await app.turn(m.s,'подготовь ретро',{now:NOW})).extensionData.retroCard;
 assert.equal(mc.drafts.by,'model');
 assert.deepEqual(mc.drafts.good.map(i=>i.text),['Договорились про Addressables']);
 assert.deepEqual(mc.drafts.bad.map(i=>i.text),['Много переноса']);assert.deepEqual(mc.drafts.try.map(i=>[i.id,i.text]),[['try-1','Дежурный по CI']]);
 // A column the model left empty falls back to the rules.
 const partial=check({good:[],bad:[{text:'Много переноса',facts:[bad]}],try:[]},c.facts);
 assert.equal(partial.good,null);assert.equal(partial.try,null);
 assert.ok(rules(c.facts).try.length>=3);

 // --- A named closed sprint ---------------------------------------------------------------------------------------------
 const named=await app.turn(fixture().s,'подготовь ретро по спринту 12',{now:NOW});
 const nc=named.extensionData.retroCard;
 assert.equal(nc.sprint.name,'GAME Sprint 12');assert.deepEqual(nc.velocity.sprints.map(x=>x.name),['GAME Sprint 10','GAME Sprint 11','GAME Sprint 12']);
 assert.equal(collect.target({closed:CLOSED.map(x=>({...x,end:x.endDate,complete:x.completeDate})),active:{...ACTIVE,end:ACTIVE.endDate},now:new Date('2026-11-04T09:00:00Z')}).name,'GAME Sprint 13','mid-sprint: the last closed one');

 // --- Several boards: a question, remembered --------------------------------------------------------------------------
 const two=fixture({boards:[{id:7,name:'GAME board'},{id:8,name:'Art board'}]});
 let question;try{await app.turn(two.s,'подготовь ретро',{now:NOW});}catch(e){question=e;}
 assert.ok(question instanceof InputRequired);assert.deepEqual(question.spec.options,['GAME board · 7','Art board · 8']);
 const resumed=await question.resume('GAME board · 7');
 assert.equal(resumed.extensionData.retroCard.board.id,'7');

 // --- Votes ------------------------------------------------------------------------------------------------------------
 const ipc=app.setup(f.s).ipc;
 assert.deepEqual(ipc.votes(c.retroId),{});
 ipc.vote(c.retroId,'try-1','u-masha',true);ipc.vote(c.retroId,'try-1','u-oleg',true);
 assert.deepEqual(ipc.vote(c.retroId,'try-1','u-masha',false),{'try-1':['u-oleg']});
 assert.deepEqual(app.setup(f.s).ipc.votes(c.retroId),{'try-1':['u-oleg']},'votes survive a redraw');
 assert.throws(()=>ipc.vote(c.retroId,'../x','u-masha',true),/Некорректный голос/);
 f.settings.extension_retro='false';assert.throws(()=>ipc.votes(c.retroId),/не добавлено/);

 // --- Errors -------------------------------------------------------------------------------------------------------------
 const e=await app.turn(fixture({fail:true}).s,'подготовь ретро',{now:NOW});
 assert.equal(e.error,true);assert.match(e.text,/^Ретро · /);
 // CI / monitoring / messengers off: the retro is still built and says what is missing.
 const bare=fixture({settings:{'extension_ci-builds':'false',extension_monitoring:'false',extension_chatmsg:'false'}});
 const bc=(await app.turn(bare.s,'подготовь ретро',{now:NOW})).extensionData.retroCard;
 assert.deepEqual(bc.sources,{jira:true,ci:false,monitoring:false,meetings:1,messengers:[]});
 assert.ok(bc.notes.some(n=>/добавьте «Сборки»/.test(n)));assert.ok(!bare.calls.some(x=>x.url.hostname==='api.github.com'));

 // --- Offer ----------------------------------------------------------------------------------------------------------------
 assert.equal(offer.ready({extension_retro:'true',module_jira:'true',jiraUrl:SITE,jiraEmail:'a@b.c',jiraToken:'x'}),true);
 assert.equal(offer.ready({extension_retro:'true'}),false);
 console.log('Retro: routing and near-misses, Jira/CI/incident/meeting/messenger facts with sources, grounded drafts, model checks, named sprint, board question, votes, errors passed');
})().catch(e=>{console.error(e);process.exit(1);});
