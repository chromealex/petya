// «Онбординг новичка» (the app; tests/onboarding.cjs is Petya's own first-run onboarding): routing and near-misses (players' onboarding and tutorials, a knowledge-base search, «что такое»),
// not added; the newcomer's name is asked when only a genitive form is known and the role when none is named; the
// plan from stubbed sources — «Поиск по всему» documents (chats and tasks left out), the semantic index, «Кто знает»
// and «Команда» people (a meeting moved past an absence), Jira «good first issue» tasks (assigned ones left out, the
// newcomer's area first) and the role-filtered accesses checklist — every item with its source; nothing stored before
// «Начать онбординг»; saving with skipped items and another first day, once; progress per day with a fake clock; the
// list of plans; removal with «Отменить»; wipe; encryption at rest; gaps instead of failures when nothing is connected
// or Jira fails; the welcome draft names nobody's private data.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/onboarding/feature.cjs');
const src=require('../src/extensions/onboarding/sources.cjs');
const offer=require('../src/extensions/onboarding/offer.cjs');
const people=require('../src/features/people.cjs');
const {InputRequired}=require('../src/input-required.cjs');
let NOW=new Date('2026-11-09T10:00:00Z').getTime();   // Monday
app.deps.now=()=>NOW;
app.deps.crypt=null;
const SITE='https://studio.atlassian.net';
const TEAM=[{name:'Олег Смирнов',aliases:'Олег',role:'Бэкенд-разработчик',email:'oleg@studio.example',jiraId:'u-oleg'},{name:'Маша Петрова',aliases:'Маша',role:'Клиент',email:'masha@studio.example'},
 {name:'Иван Козлов',aliases:'Ваня',role:'Бэкенд, тимлид',email:'ivan@studio.example'},{name:'Ира Лебедева',aliases:'Ира',role:'QA'}];
const dirs=[];process.on('exit',()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'petya-onb-'));dirs.push(d);return d;};

function fixture({settings={},team=TEAM,jira,index}={}){
 const topic={id:'t1',title:'Чат',messages:[]},calls=[];
 const all={extension_onboarding:'true','extension_search-all':'true','extension_who-knows':'true',teamMembers:JSON.stringify(team),model:'',
  module_jira:'true',jiraUrl:SITE,jiraEmail:'lead@studio.example',jiraToken:'jira-test',jiraProjects:'GAME',
  onboardingAccesses:'Корпоративная почта\nSlack и каналы команды\nбэкенд: доступ к staging и логам\nклиент: Unity Cloud',...settings};
 const s={settings:all,companyId:'c1',dataRoot:tmp(),requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  workspace:{api:async(route,options)=>{calls.push({route,body:JSON.parse(options.body)});if(!jira)throw Object.assign(Error('HTTP 500'),{status:500});return jira(route,JSON.parse(options.body));}},
  semanticIndex:index||null,
  async request(url){throw Error('no network in tests: '+url);}};
 s.people=people.create(s,{now:()=>NOW,sources:()=>[]});
 return {s,topic,calls,ipc:app.setup(s).ipc};
}
const searchAll=async(s,query)=>{
 assert.match(query,/онбординг бэкенд/);
 return {items:[
  {source:'confluence',title:'Бэкенд: как устроен сервер',url:'https://studio.atlassian.net/wiki/spaces/GAME/pages/1',snippet:'Архитектура сервера, деплой'},
  {source:'slack',title:'#backend · про онбординг',url:'https://studio.slack.com/archives/C1/p1',snippet:'болтовня'},
  {source:'jira',title:'GAME-3 · онбординг',url:SITE+'/browse/GAME-3',snippet:''},
  {source:'files',title:'docs/backend/README.md',url:'',path:'/work/game/docs/backend/README.md',snippet:'Как запустить сервер локально'},
  {source:'mm',messenger:true,title:'Mattermost · dev',url:'https://mm.example/x',snippet:''}],
  sources:[{id:'confluence',label:'Confluence'},{id:'files',label:'Файлы проекта'}]};
};
const index={enabled:id=>id==='files',search:async(ids,q,{k})=>{assert.deepEqual(ids,['files']);assert.equal(k,6);
 return {hits:[{collection:'files',id:'f1',text:'Код-стайл бэкенда',meta:{path:'/work/game/docs/backend/STYLE.md',title:'STYLE.md'}},{collection:'files',id:'f2',text:'то же',meta:{path:'/work/game/docs/backend/README.md'}}]};}};
const whoKnows=async(s,topic)=>{
 assert.equal(topic,'backend бэкенд сервер');
 return {people:[
  {name:'Олег Смирнов',member:true,role:'Бэкенд-разработчик',points:{code:5.2,jira:2,slack:0,meetings:0},commits:[{url:'https://github.com/studio/game/commit/abc'}],issues:new Map()},
  {name:'Чужой Автор',member:false,points:{code:9},commits:[],issues:new Map()},
  {name:'Маша Петрова',member:true,role:'Клиент',points:{code:0.4,jira:0,slack:1,meetings:0},commits:[],issues:new Map()}]};
};
const jira=(route,body)=>{
 assert.equal(route,'/rest/api/3/search/jql');
 assert.equal(body.jql,'project IN ("GAME") AND labels IN ("good-first-issue","good_first_issue","goodfirstissue","starter","onboarding") AND statusCategory != Done ORDER BY priority DESC, created ASC');
 return {issues:[
  {key:'GAME-40',fields:{summary:'Поправить текст в настройках',labels:['good-first-issue','client'],components:[],assignee:null}},
  {key:'GAME-41',fields:{summary:'Логи запросов API',labels:['good-first-issue','backend'],components:[{name:'Server'}],assignee:null}},
  {key:'GAME-42',fields:{summary:'Уже взята',labels:['good-first-issue','backend'],assignee:{accountId:'u-oleg'}}},
  {key:'GAME-43',fields:{summary:'Метрики сервера',labels:['starter'],components:[{name:'Backend'}],assignee:null}}]};
};

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------------
 const r=app.route('подготовь онбординг для Ани, она бэкенд');assert.deepEqual(r,{type:'create',name:'Ани',role:'бэкенд'});
 for(const [p,type] of [['Петя, составь план онбординга для Димы Петрова — он геймдизайнер','create'],['план онбординга нового сотрудника','create'],['к нам выходит Катя, QA, подготовь онбординг','create'],
  ['к нам выходит новый бэкендер, подготовь план адаптации','create'],['как идёт онбординг Ани?','show'],['покажи онбординг','show'],['онбординг новичков','show']])assert.equal(app.route(p)?.type,type,p);
 for(const p of ['онбординг в игре','воронка онбординга','где отваливаются игроки на онбординге','найди в Notion страницу про онбординг','что такое онбординг','онбординг пользователей в приложении','туториал онбординг','подготовь 1:1 с Олегом','привет'])
  assert.equal(app.route(p),null,p);
 assert.deepEqual(['Ани','Маши','Олега','Димы Петрова','Ани Смирновой'].map(app.nominative),['Аня','Маша','Олег','Дима Петров','Аня Смирнова']);
 assert.equal(offer.ready({extension_onboarding:'true'}),true);

 // --- Not added ----------------------------------------------------------------------------------------------------------
 let f=fixture({settings:{extension_onboarding:'false'}});
 assert.equal(await app.turn(f.s,'подготовь онбординг для Ани, она бэкенд'),null);

 // --- The name and the role are asked, never guessed ------------------------------------------------------------------
 f=fixture({jira,index});app.deps.searchAll=searchAll;app.deps.whoKnows=whoKnows;
 let q;try{await app.turn(f.s,'подготовь онбординг для Ани, она бэкенд');}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.equal(q.spec.text,'Как записать имя новичка?');assert.deepEqual(q.spec.options,['Аня','Ани']);
 const res=await q.resume('Аня Смирнова');
 const card=res.extensionData.onboardingCard;
 assert.equal(card.mode,'draft');assert.equal(card.name,'Аня Смирнова');assert.equal(card.role,'бэкенд');
 assert.equal(card.start,'2026-11-10');assert.deepEqual(card.days,['2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-23']);
 // Every item has a source; chats, tasks and messenger hits are not documents; the index adds its own file once.
 for(const i of card.items)assert.ok(i.source?.label,i.id+' has a source');
 const docs=card.items.filter(i=>i.kind==='doc');
 assert.deepEqual(docs.map(d=>[d.day,d.title,d.source.label]),[[1,'Бэкенд: как устроен сервер','Confluence'],[2,'docs/backend/README.md','Файлы проекта'],[2,'STYLE.md','Файлы · по смыслу']]);
 assert.equal(docs[1].source.path,'/work/game/docs/backend/README.md');
 // Accesses: the common ones and the backend one, not the client's.
 assert.deepEqual(card.items.filter(i=>i.kind==='access').map(i=>[i.day,i.title]),[[1,'Корпоративная почта'],[1,'Slack и каналы команды'],[1,'доступ к staging и логам']]);
 // People: «Кто знает» members first (not outsiders), then the same role from «Команда», one meeting a day from day 2.
 const met=card.items.filter(i=>i.kind==='person');
 assert.deepEqual(met.map(p=>[p.day,p.title,p.source.label]),[[2,'Олег Смирнов','Кто знает'],[3,'Маша Петрова','Кто знает'],[4,'Иван Козлов','Команда']]);
 assert.equal(met[0].source.url,'https://github.com/studio/game/commit/abc');
 // Tasks: free ones of the backend first, the assigned one left out.
 assert.deepEqual(card.items.filter(i=>i.kind==='task').map(t=>[t.day,t.key]),[[3,'GAME-41'],[6,'GAME-43'],[9,'GAME-40']]);
 assert.equal(card.items.find(i=>i.key==='GAME-41').source.url,SITE+'/browse/GAME-41');
 assert.deepEqual(card.gaps,[]);
 assert.equal(card.welcome,'Привет, Аня! Рады, что ты с нами в роли «бэкенд». В первый день помогу с доступами — их 3. На первой неделе — знакомства: Олег, Маша, Иван. Первая задача — GAME-41. Если что-то непонятно — пиши мне в любое время.');
 assert.match(res.text,/^Онбординг · Аня Смирнова \(бэкенд\): план на две недели — документов: 3, знакомств: 3, стартовых задач: 3, доступов: 3\. План сохранится только после «Начать онбординг»\.$/);
 assert.equal(f.ipc.status().plans,0,'nothing stored by the chat turn');assert.equal(f.ipc.state(card.draftId),'pending');

 // A colleague's absence moves the meeting to a later day.
 const g=fixture({jira,index});g.s.people.addAbsence('u-oleg',{from:'2026-11-11',to:'2026-11-13',kind:'vacation'});
 const moved=(await app.turn(g.s,'подготовь онбординг для Олега Смирнова, он бэкенд')).extensionData.onboardingCard;
 assert.equal(moved.name,'Олег Смирнов','a member of «Команда» needs no question');
 assert.deepEqual(moved.items.filter(i=>i.kind==='person').map(p=>[p.day,p.title]),[[2,'Маша Петрова'],[3,'Иван Козлов'],[4,'Ира Лебедева']],'the newcomer is not his own meeting; a small team fills up to three');
 const h=fixture({jira,index});h.s.people.addAbsence('u-oleg',{from:'2026-11-11',to:'2026-11-13',kind:'vacation'});
 const moved2=(await app.turn(h.s,'подготовь онбординг для Ани Смирновой, она бэкенд').catch(e=>e.resume('Аня Смирнова'))).extensionData.onboardingCard;
 assert.deepEqual(moved2.items.filter(i=>i.kind==='person').map(p=>[p.day,p.title,/отсутствует/.test(p.note)]),[[5,'Олег Смирнов',false],[6,'Маша Петрова',false],[7,'Иван Козлов',false]]);

 // No role: asked with choices; an empty answer builds nothing.
 let rq;try{await app.turn(f.s,'план онбординга для Олега Смирнова');}catch(e){rq=e;}
 assert.ok(rq instanceof InputRequired);assert.match(rq.spec.text,/^Какая роль у новичка \(Олег Смирнов\)\?/);assert.ok(rq.spec.options.includes('бэкенд')&&rq.spec.options.includes('QA'));
 assert.equal((await rq.resume(' ')).question,true);
 // No name at all.
 let nq;try{await app.turn(f.s,'план онбординга нового сотрудника');}catch(e){nq=e;}
 assert.equal(nq.spec.text,'Как зовут новичка?');

 // --- Saving: once, with the user's edits ----------------------------------------------------------------------------
 const saved=f.ipc.save(card.draftId,{start:'2026-11-16',skip:['t3','d3'],welcome:'Привет, Аня! Добро пожаловать.'});
 assert.equal(saved.text,'План онбординга сохранён: пунктов — '+(card.items.length-2));
 assert.equal(f.ipc.state(card.draftId),'saved');assert.equal(f.ipc.save(card.draftId).text,'Уже сохранено');
 assert.throws(()=>f.ipc.save('unknown-draft'),/устарела/);
 assert.throws(()=>f.ipc.save(moved.draftId,{start:'2026-02-30'}),/Некорректная дата/);
 const planId=saved.planId;
 // Before the first day: «начнётся …».
 let show=await app.turn(f.s,'как идёт онбординг Ани?');
 assert.match(show.text,/^Онбординг · Аня Смирнова: начнётся 16 ноября, сделано 0 из 10\.$/);
 // Day 3 of the plan (Wed 18 Nov): two items ticked, the rest of days 1–3 wait.
 NOW=new Date('2026-11-18T09:00:00Z').getTime();
 assert.deepEqual(f.ipc.check(planId,'a1',true),{ok:true,done:true,count:1,total:10});
 f.ipc.check(planId,'d1',true);
 show=await app.turn(f.s,'как идёт онбординг Ани?');
 const plan=show.extensionData.onboardingCard;
 assert.equal(plan.mode,'plan');assert.equal(plan.day,3);assert.equal(plan.items.filter(i=>i.done).length,2);
 assert.match(show.text,/^Онбординг · Аня Смирнова: день 3 из 10, сделано 2 из 10, ждут отметки: \d+\.$/);
 assert.equal(plan.welcome,'Привет, Аня! Добро пожаловать.');
 assert.throws(()=>f.ipc.check(planId,'zz',true),/пункта уже нет/);
 // Two plans: a list; a name picks one.
 const other=(await app.turn(f.s,'подготовь онбординг для Иры Лебедевой, она QA').catch(e=>e.resume('Ира Лебедева'))).extensionData.onboardingCard;
 f.ipc.save(other.draftId);
 const list=await app.turn(f.s,'покажи онбординг');assert.equal(list.extensionData.onboardingCard.mode,'list');assert.equal(list.extensionData.onboardingCard.plans.length,2);
 assert.equal((await app.turn(f.s,'как идёт онбординг Иры')).extensionData.onboardingCard.name,'Ира Лебедева');
 assert.equal((await app.turn(f.s,'как идёт онбординг Пети Новикова')).question,true);
 // Removal with «Отменить».
 const removed=f.ipc.remove(planId);assert.equal(f.ipc.status().plans,1);f.ipc.restore(removed.plan);assert.equal(f.ipc.status().plans,2);
 // At rest: encrypted with the keychain when there is one — no names in the file.
 const file=path.join(f.s.dataRoot,'onboarding','plans.json');
 assert.ok(fs.readFileSync(file,'utf8').includes('Аня'),'without a keychain the file is plain JSON');
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 app.teardown();app.deps.crypt={encrypt:v=>Buffer.from(Buffer.from(v).toString('base64').split('').reverse().join('')),decrypt:b=>Buffer.from(b.toString().split('').reverse().join(''),'base64').toString()};
 const e=fixture({jira,index});const enc=(await app.turn(e.s,'подготовь онбординг для Олега Смирнова, он бэкенд')).extensionData.onboardingCard;e.ipc.save(enc.draftId);
 const raw=fs.readFileSync(path.join(e.s.dataRoot,'onboarding','plans.json'),'utf8');assert.ok(raw.startsWith('enc:')&&!raw.includes('Олег'));
 assert.equal(e.ipc.status().plans,1);assert.equal(e.ipc.status().encrypted,true);
 app.teardown();app.deps.crypt=null;
 // Wipe.
 f.ipc.wipe();assert.equal(f.ipc.status().plans,0);assert.equal(fs.existsSync(path.join(f.s.dataRoot,'onboarding')),false);
 assert.equal((await app.turn(f.s,'покажи онбординг')).question,true);
 assert.throws(()=>app.setup({...f.s,settings:{...f.s.settings,extension_onboarding:'false'}}).ipc.check(planId,'a1',true),/не добавлено/);

 // --- Nothing connected: gaps, not failures ------------------------------------------------------------------------
 NOW=new Date('2026-11-09T10:00:00Z').getTime();
 const bare=fixture({settings:{'extension_search-all':'false','extension_who-knows':'false',module_jira:'false',onboardingAccesses:''},team:[]});
 const b=(await app.turn(bare.s,'подготовь онбординг для Олега, он бэкенд').catch(e=>e.resume('Олег'))).extensionData.onboardingCard;
 assert.equal(b.items.length,0);
 assert.deepEqual(b.gaps,['Доступы: чек-лист пуст — заполните его в настройках «Онбординга».','Документы: добавьте «Поиск по всему», чтобы искать вводные документы по Confluence, Notion и файлам проекта.',
  'Люди: добавьте «Кто знает», чтобы подобрать знакомства по коду и задачам.','Люди: «Команда» пуста — заполните её, чтобы спланировать знакомства.','Задачи: Jira не подключена — стартовые задачи с меткой «good first issue» не подобраны.']);
 assert.throws(()=>bare.ipc.save(b.draftId),/не осталось пунктов/);
 // Jira and the search failing: their gaps, the rest of the plan stays.
 app.deps.searchAll=async()=>{throw Error('таймаут');};
 const broken=fixture({jira:null,index:null});
 const bc=(await app.turn(broken.s,'подготовь онбординг для Олега Смирнова, он бэкенд')).extensionData.onboardingCard;
 assert.deepEqual(bc.gaps,['Документы: поиск не ответил (таймаут).','Задачи: Jira не ответила (HTTP 500).']);
 assert.ok(bc.items.some(i=>i.kind==='person')&&bc.items.some(i=>i.kind==='access'));
 // Sources by themselves.
 assert.deepEqual(src.labelsOf({onboardingLabels:'starter, good first, gfi'}),['starter','gfi'],'labels with spaces are not Jira labels');
 assert.deepEqual(src.workdays('2026-11-13',3),['2026-11-13','2026-11-16','2026-11-17']);
 assert.equal(src.role('она будет фронтендером').id,'фронтенд');
 app.teardown();
 console.log('Onboarding: routing and near-misses, name and role asked, plan from docs/index/people/tasks/accesses with sources, absences respected, saved once, progress by day, list, undo, wipe, encryption, gaps passed');
})().catch(e=>{console.error(e);process.exit(1);});
