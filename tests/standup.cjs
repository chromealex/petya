// «Стендап»: routing incl. near-misses (comedy, the meeting in the calendar, meeting summaries), not added / nothing
// connected, schedule setup and switching off, the summary from Jira activity (transitions, comments, worklogs),
// open issues (today, flagged/blocked), git commits and answers in a Slack thread (structured, unstructured, people
// outside «Команда», bots ignored), «нет ответа», since-the-last-standup, the scheduled run that only prepares and
// notifies, and service errors. No network: Jira, Slack, git and the model are stubbed.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Workspace}=require('../src/workspace.cjs');
const app=require('../src/extensions/standup/feature.cjs');
const collect=require('../src/extensions/standup/collect.cjs');
const offer=require('../src/extensions/standup/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-12T10:35:00Z');// Thursday
const SITE='https://studio.atlassian.net';
const THREAD='https://studio.slack.com/archives/C0ABCDEF1/p1794479400000100';// 2026-11-12 10:30 UTC
const TEAM=[{name:'Маша Петрова',role:'Клиент',jiraId:'u-masha',slackId:'U01MASHA',email:'masha@studio.com'},{name:'Олег Смирнов',role:'Сервер',jiraId:'u-oleg',slackId:'U01OLEG',email:'oleg@studio.com'},
 {name:'Иван Козлов',role:'Геймплей',jiraId:'u-ivan',slackId:'U01IVAN',email:'ivan@studio.com'},{name:'Аня Белова',role:'QA',jiraId:'u-anya',slackId:'U01ANYA',email:'anya@studio.com'}];
const t=iso=>iso;
const ACTIVITY=[
 {key:'GAME-60',fields:{summary:'Новый босс',status:{name:'In Progress'},comment:{comments:[{author:{accountId:'u-ivan'},created:t('2026-11-11T15:00:00.000+0000')},{author:{accountId:'u-ivan'},created:t('2026-11-01T15:00:00.000+0000')}]},
  worklog:{worklogs:[{author:{accountId:'u-ivan'},started:t('2026-11-11T12:00:00.000+0000'),timeSpentSeconds:7200}]}},
  changelog:{histories:[{author:{accountId:'u-ivan'},created:t('2026-11-11T11:00:00.000+0000'),items:[{field:'status',fromString:'To Do',toString:'In Progress'}]},{author:{accountId:'u-ivan'},created:t('2026-11-05T11:00:00.000+0000'),items:[{field:'status',fromString:'Backlog',toString:'To Do'}]}]}},
 {key:'GAME-50',fields:{summary:'Матчмейкинг',status:{name:'Review'},comment:{comments:[]},worklog:{worklogs:[]}},
  changelog:{histories:[{author:{accountId:'u-oleg'},created:t('2026-11-11T17:00:00.000+0000'),items:[{field:'status',fromString:'In Progress',toString:'Review'},{field:'assignee',fromString:'',toString:'Олег'}]}]}}
];
const st=(name,key)=>({name,statusCategory:{key}});
const OPEN=[
 {key:'GAME-60',fields:{summary:'Новый босс',status:st('In Progress','indeterminate'),priority:{name:'Medium'},assignee:{accountId:'u-ivan'},issuelinks:[],labels:[]}},
 {key:'GAME-70',fields:{summary:'Кланы: список',status:st('In Progress','indeterminate'),priority:{name:'High'},assignee:{accountId:'u-masha'},issuelinks:[],labels:[]}},
 {key:'GAME-77',fields:{summary:'Фикс локализации',status:st('Blocked','indeterminate'),priority:{name:'Medium'},assignee:{accountId:'u-masha'},issuelinks:[],labels:[]}},
 {key:'GAME-75',fields:{summary:'Античит',status:st('In Progress','indeterminate'),priority:{name:'Medium'},assignee:{accountId:'u-oleg'},issuelinks:[],labels:[],customfield_10021:[{value:'Impediment'}]}},
 {key:'GAME-80',fields:{summary:'Сервер чата',status:st('To Do','new'),priority:{name:'Medium'},assignee:{accountId:'u-oleg'},issuelinks:[{type:{inward:'is blocked by'},inwardIssue:{key:'OPS-3',fields:{status:{statusCategory:{key:'indeterminate'}}}}}],labels:[]}}
];
const REPLIES=[
 {ts:'1794479400.000100',user:'ULEAD',text:'Стендап! Вчера / сегодня / блокеры'},
 {ts:'1794479460.000200',user:'U01MASHA',text:'Вчера: доделала экран магазина GAME-51\nСегодня: кланы GAME-70\nБлокеры: жду макеты от дизайна',user_profile:{real_name:'Маша Петрова'}},
 {ts:'1794479520.000300',user:'U01OLEG',text:'чинил матчмейкинг, сегодня продолжу <https://x.io|ссылка>',user_profile:{real_name:'Oleg'}},
 {ts:'1794479580.000400',user:'U0GUEST1',text:'Вчера: ревью. Сегодня: релиз; Блокеры: нет',user_profile:{real_name:'Гость Подрядчик'}},
 {ts:'1794479600.000500',bot_id:'B1',subtype:'bot_message',text:'Напоминание'}
];

function fixture(over={}){
 const calls=[],sent=[];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-standup-'));
 const repo=path.join(dir,'game');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});
 const request=async(address,options={})=>{
  const u=new URL(address),p=u.pathname,method=options.method||'GET';calls.push({url:u,method,body:options.body?JSON.parse(options.body):null});
  if(u.hostname==='slack.com'){
   assert.equal(options.headers.Authorization,'Bearer xoxp-test');assert.equal(method,'GET','Slack is only read');
   if(over.slackError)return {ok:false,error:'channel_not_found'};
   assert.equal(p,'/api/conversations.replies');assert.equal(u.searchParams.get('channel'),'C0ABCDEF1');assert.equal(u.searchParams.get('ts'),'1794479400.000100');
   return {ok:true,messages:REPLIES,has_more:false};
  }
  if(p==='/api/chat')return {message:{content:JSON.stringify({yesterday:['чинил матчмейкинг'],today:['продолжу матчмейкинг'],blockers:[]})}};
  if(over.jiraError)throw Object.assign(Error('Сервис вернул HTTP 503'),{status:503});
  if(p==='/rest/api/3/field')return [{id:'summary',name:'Summary',custom:false},{id:'customfield_10021',name:'Flagged',custom:true}];
  if(p==='/rest/api/3/search/jql'){
   const body=JSON.parse(options.body);assert.equal(method,'POST');
   if(/updated >= -\d+m/.test(body.jql)){assert.equal(body.expand,'changelog');assert.ok(body.fields.includes('worklog'));return {issues:ACTIVITY,isLast:true};}
   if(/assignee in/.test(body.jql)){assert.ok(body.fields.includes('customfield_10021'));return {issues:OPEN,isLast:true};}
  }
  throw Error('unexpected request '+method+' '+address);
 };
 const settings={extension_standup:'true',module_jira:'true',module_slack:'true',jiraUrl:SITE,jiraEmail:'lead@studio.com',jiraToken:'jira-token',jiraProjects:'GAME',jiraProject:'GAME',slackToken:'xoxp-test',
  teamMembers:JSON.stringify(TEAM),model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...over.settings};
 const workspace=new Workspace({settings:()=>settings,request,save:()=>{}});
 const topic={id:'t1',title:'Чат',projectId:'p1',messages:[]};
 const state={topics:[topic],projects:[{id:'general',name:'Общий'},{id:'p1',name:'Game',folders:over.noFolders?[]:[repo]}],activeProjectId:'p1'};
 const git=async(d,args)=>{assert.equal(d,repo);assert.ok(args.some(a=>a.startsWith('--since=2026-11-11T10:')),'commits since the last standup: '+args.join(' '));
  return ['Ivan Kozlov\x1fivan@studio.com\x1fGAME-60 boss AI states\x1f2026-11-11T16:00:00Z','Masha\x1fmasha@studio.com\x1fShop screen polish\x1f2026-11-11T13:00:00Z',''].join('\n');};
 const notices=[];
 const s={settings,workspace,request,dataRoot:dir,modules:require('../src/modules.cjs'),requestProgress:{report(){}},
  win:{isDestroyed:()=>false,webContents:{send:(channel,item)=>notices.push({channel,item})}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state}};
 return {s,calls,sent,topic,state,settings,git,notices,repo};
}
const rowOf=(card,name)=>card.people.find(p=>p.name===name);

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'собери стендап':'collect','Петя, собери стендап':'collect','стендап':'collect','кто не ответил на стендап':'collect','покажи сводку стендапа':'collect','что вчера делала команда':'yesterday','что вчера делала команда?':'yesterday','что сделала команда вчера':'yesterday',
  'у кого блокеры':'blockers','у кого блокеры?':'blockers','какие блокеры у команды':'blockers','настрой стендап на 10:30':'configure','стендап по будням в 9:45':'configure','каждый день в 10 собирай стендап':'configure','выключи стендап':'disable','не собирай стендап':'disable'};
 for(const [p,k] of Object.entries(own))assert.equal(app.kind(p),k,p);
 for(const p of ['стенд-ап комедия','стендап-комик в клубе','сходим на стендап шоу','встань','встань пораньше','сводка встречи','во сколько стендап','перенеси стендап на 11','запиши стендап','что такое стендап','как проводить дейли','подготовь реплику на дейли','Скилл standup вчера чинил крэш, сегодня магазин','что мне сказать на стендапе','подготовь мой апдейт для стендапа','что вчера делала Маша в Jira',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 const sched=app.parseSchedule('настрой стендап на пн, ср, пт в 9:45 в треде '+THREAD);
 assert.deepEqual([sched.time,sched.days,sched.thread],['09:45',[1,3,5],THREAD]);
 assert.deepEqual(app.parseSchedule('настрой стендап каждый день в 10').days,[0,1,2,3,4,5,6]);
 assert.ok(app.parseSchedule('настрой стендап на 25:00').error);
 assert.deepEqual(collect.thread(THREAD),{channel:'C0ABCDEF1',ts:'1794479400.000100',url:THREAD});
 assert.equal(collect.thread('https://evil.example/archives/C0ABCDEF1/p1794479400000100'),null);
 assert.deepEqual(collect.split('Вчера: А; Б\nСегодня: В\nБлокеры: нет'),{yesterday:['А','Б'],today:['В'],blockers:[]});
 assert.equal(collect.split('просто текст без разметки'),null);

 // --- Not added / nothing connected ------------------------------------------------------------------------------
 let f=fixture({settings:{extension_standup:'false'}});
 assert.equal(await app.turn(f.s,'собери стендап'),null);
 f=fixture({settings:{jiraToken:'',jiraEmail:''},noFolders:true});
 const q=await app.turn(f.s,'собери стендап',{now:NOW});
 assert.equal(q.question,true);assert.match(q.text,/Подключите Jira/);assert.equal(f.calls.length,0);

 // --- Schedule setup ---------------------------------------------------------------------------------------------
 f=fixture();
 const conf=await app.turn(f.s,'настрой стендап на 10:30 в треде '+THREAD,{now:NOW});
 assert.match(conf.text,/по будням в 10:30/);assert.match(conf.text,/в Slack ничего не отправляю сам/);
 assert.equal(f.calls.length,0,'configuring reads nothing');
 const ipc=app.setup({...f.s,smoke:true}).ipc;assert.deepEqual(ipc.schedule(),{project:'Game',enabled:true,time:'10:30',days:[1,2,3,4,5],thread:THREAD});
 let timeQ;try{await app.turn(fixture().s,'настрой стендап',{now:NOW});}catch(e){timeQ=e;}
 assert.ok(timeQ instanceof InputRequired);assert.deepEqual(timeQ.spec.options,['10:00','10:30','11:00']);

 // --- Happy path: Jira + git + Slack thread -----------------------------------------------------------------------
 const r=await app.turn(f.s,'собери стендап',{now:NOW,git:f.git});
 const c=r.extensionData.standupCard;
 assert.equal(r.by,'Стендап');
 assert.equal(c.since,'2026-11-11T10:30:00.000Z','since the previous working day at the standup time');
 assert.deepEqual(c.sources,{jira:true,git:true,slack:true});
 const masha=rowOf(c,'Маша Петрова'),oleg=rowOf(c,'Олег Смирнов'),ivan=rowOf(c,'Иван Козлов'),anya=rowOf(c,'Аня Белова'),guest=rowOf(c,'Гость Подрядчик');
 assert.equal(masha.source,'slack');assert.deepEqual(masha.yesterday.map(x=>x.text),['доделала экран магазина GAME-51']);assert.equal(masha.yesterday[0].url,SITE+'/browse/GAME-51');
 assert.deepEqual(masha.today.map(x=>x.key),['GAME-70']);
 assert.deepEqual(masha.blockers.map(x=>x.text),['жду макеты от дизайна','Фикс локализации — статус Blocked'],'own words plus the blocked issue from Jira');
 assert.equal(oleg.source,'slack');assert.match(oleg.note,/чинил матчмейкинг, сегодня продолжу ссылка/);assert.deepEqual(oleg.yesterday,[]);
 assert.deepEqual(oleg.blockers.map(x=>x.text),['Античит — флаг','Сервер чата — ждёт OPS-3']);
 assert.equal(ivan.source,'draft');assert.equal(ivan.noAnswer,true,'no answer in the thread even with a Jira draft');
 assert.deepEqual(ivan.yesterday.map(x=>x.text),['Новый босс — To Do → In Progress, 1 комментарий, списано 2 ч','коммит: GAME-60 boss AI states']);
 assert.deepEqual(ivan.today.map(x=>x.text),['Новый босс (In Progress)']);
 assert.equal(anya.source,'none');assert.equal(anya.noAnswer,true);assert.deepEqual([anya.yesterday,anya.today,anya.blockers],[[],[],[]]);
 assert.equal(guest.role,'не в «Команде»');assert.deepEqual([guest.yesterday.map(x=>x.text),guest.today.map(x=>x.text)],[['ревью.'],['релиз']]);
 assert.ok(!c.people.some(p=>/Напоминание/.test(JSON.stringify(p))),'bot messages are not answers');
 assert.deepEqual(c.totals,{people:5,answered:3,drafted:1,blocked:2,blockers:4,silent:2});
 assert.equal(c.people[0].blockers.length>0,true,'people with blockers first');
 assert.match(r.text,/ответили в треде 3 из 5/);assert.match(r.text,/Блокеры у 2: /);assert.match(r.text,/Нет ответа: Аня Белова, Иван Козлов/);
 assert.ok(!f.calls.some(x=>x.url.hostname==='slack.com'&&x.method!=='GET'),'nothing is posted to Slack');
 assert.ok(!f.calls.some(x=>x.url.pathname.startsWith('/rest/')&&x.method!=='GET'&&x.url.pathname!=='/rest/api/3/search/jql'),'Jira is only read');
 // Focused questions use the same summary.
 assert.match((await app.turn(f.s,'у кого блокеры',{now:NOW,git:f.git})).text,/^Блокеры у 2: Маша Петрова \(жду макеты от дизайна, GAME-77\); Олег Смирнов \(GAME-75, GAME-80\)\.$/);
 const y=await app.turn(f.s,'что вчера делала команда',{now:NOW,git:f.git});
 assert.match(y.text,/^Вчера:\nМаша Петрова: доделала экран магазина GAME-51/);
 assert.equal(y.extensionData.standupCard.since,'2026-11-11T10:30:00.000Z','asking again the same day keeps the same period');
 // With the model, an unstructured answer is split into the three lists.
 f.settings.model='qwen3:8b';
 const m=(await app.turn(f.s,'собери стендап',{now:NOW,git:f.git})).extensionData.standupCard;
 assert.deepEqual(rowOf(m,'Олег Смирнов').yesterday.map(x=>x.text),['чинил матчмейкинг']);assert.equal(rowOf(m,'Олег Смирнов').note,undefined);
 f.settings.model='';

 // --- Without a thread: drafts only; «нет активности» for people with nothing ------------------------------------
 const plain=fixture();
 const pc=(await app.turn(plain.s,'собери стендап',{now:NOW,git:plain.git})).extensionData.standupCard;
 assert.equal(pc.thread,null);assert.equal(rowOf(pc,'Маша Петрова').source,'draft');assert.deepEqual(rowOf(pc,'Маша Петрова').yesterday.map(x=>x.text),['коммит: Shop screen polish']);
 assert.equal(rowOf(pc,'Иван Козлов').noAnswer,false);assert.equal(rowOf(pc,'Аня Белова').noAnswer,true);
 assert.match((await app.turn(plain.s,'собери стендап',{now:NOW,git:plain.git})).text,/Без активности: Аня Белова/);

 // --- Errors: Slack and Jira failures become warnings, the card is still built -----------------------------------
 const se=fixture({slackError:true});await app.turn(se.s,'настрой стендап на 10:30 в треде '+THREAD,{now:NOW});
 const sc=(await app.turn(se.s,'собери стендап',{now:NOW,git:se.git})).extensionData.standupCard;
 assert.ok(sc.warnings.some(w=>/тред не найден/.test(w)));assert.equal(sc.sources.slack,false);
 const je=fixture({jiraError:true});
 const jc=(await app.turn(je.s,'собери стендап',{now:NOW,git:je.git})).extensionData.standupCard;
 assert.ok(jc.warnings.some(w=>/^Jira: /.test(w)));assert.equal(jc.sources.git,true);

 // --- Schedule: prepares in its own chat and notifies, once a day, only on the chosen days -------------------------
 const sch=fixture();await app.turn(sch.s,'настрой стендап на 10:30 в треде '+THREAD,{now:NOW});
 assert.deepEqual(app.due(sch.s,new Date('2026-11-12T10:20:00Z')),[],'not before the time');
 assert.deepEqual(app.due(sch.s,new Date('2026-11-14T10:40:00Z')),[],'not on Saturday');
 assert.deepEqual(app.due(sch.s,new Date('2026-11-12T10:31:00Z')),['p1']);
 const prepared=await app.prepare(sch.s,'p1',new Date('2026-11-12T10:31:00Z'),{git:sch.git});
 assert.equal(prepared.topic.title,'Стендап · Game');assert.equal(prepared.topic.projectId,'p1');assert.equal(prepared.topic.messages.at(-1).extensionData.standupCard.totals.people,5);
 assert.equal(sch.notices.at(-1).channel,'extension-install-progress');assert.equal(sch.notices.at(-1).item.id,'standup:p1');assert.equal(sch.notices.at(-1).item.kind,'attention');
 assert.deepEqual(app.due(sch.s,new Date('2026-11-12T10:45:00Z')),[],'once a day');
 assert.ok(!sch.calls.some(x=>x.url.hostname==='slack.com'&&x.method!=='GET'),'the schedule never posts');
 assert.equal(sch.topic.messages.length,2,'the user chat is not touched by the schedule');
 // Switching it off.
 assert.match((await app.turn(sch.s,'выключи стендап',{now:NOW})).text,/Больше не готовлю/);assert.deepEqual(app.due(sch.s,new Date('2026-11-13T10:31:00Z')),[]);

 // --- Offer ---------------------------------------------------------------------------------------------------------
 assert.equal(offer.ready({extension_standup:'true',module_slack:'true',slackToken:'x'}),true);
 assert.equal(offer.ready({extension_standup:'true'}),false);
 console.log('Standup: routing and near-misses, schedule, Jira/git/Slack drafts and answers, blockers, no answer, period, scheduled prepare-and-notify, errors passed');
})().catch(e=>{console.error(e);process.exit(1);});
