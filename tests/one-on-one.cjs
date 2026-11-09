// «Встречи 1:1»: routing and near-misses (games, scores, promises about tasks, meeting summaries), not added, the
// foundation not loaded; follow-ups found by code (owners, due dates, clauses without a clear owner left out); the
// outcome is only a card until «Сохранить» (IPC) with the user's edits, saved once; a missing or ambiguous person is
// asked; the prep card with history, open follow-ups, absences, Jira issues and PRs of the person (stubbed REST),
// agenda by code plus the model's questions; a failing Jira does not hide PRs; «что я обещал Маше» and closing a
// follow-up; privacy: reply texts carry counts, notes reach only the local model of a prep turn. Fake clock.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/one-on-one/feature.cjs');
const fu=require('../src/extensions/one-on-one/followups.cjs');
const activity=require('../src/extensions/one-on-one/activity.cjs');
const offer=require('../src/extensions/one-on-one/offer.cjs');
const people=require('../src/features/people.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const NOW=new Date('2026-11-09T10:00:00Z').getTime();
const SITE='https://studio.atlassian.net';
const TEAM=[{name:'Маша Петрова',aliases:'Маша',role:'Клиент',email:'masha@studio.com'},{name:'Олег Смирнов',aliases:'Олег',role:'Сервер',jiraId:'u-oleg',email:'oleg@studio.com'},{name:'Иван Козлов',aliases:'Ваня'}];

const dirs=[];process.on('exit',()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'petya-1on1-'));dirs.push(d);return d;};
function fixture({settings={},team=TEAM,jira,github,model}={}){
 const topic={id:'t1',title:'Чат',messages:[]},calls=[];
 const all={'extension_one-on-one':'true',teamMembers:JSON.stringify(team),model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...settings};
 const s={settings:all,companyId:'c1',dataRoot:tmp(),requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  workspace:{api:async(route,options)=>{calls.push({route,body:JSON.parse(options.body)});if(!jira)throw Object.assign(Error('HTTP 500'),{status:500});return jira(route,JSON.parse(options.body));}},
  async request(url,options={}){calls.push({url,options});const u=new URL(url);
   if(u.pathname==='/api/chat'){assert.ok(model,'the model is not asked here');return model(JSON.parse(options.body));}
   if(u.origin==='https://api.github.com'){assert.equal(options.headers.Authorization,'Bearer gh-test');return github(u);}
   throw Error('unexpected '+url);}};
 s.people=people.create(s,{now:()=>NOW,sources:()=>[]});
 return {s,topic,calls,ipc:app.setup(s).ipc};
}

(async()=>{
 // --- Routing -------------------------------------------------------------------------------------------------------
 for(const [p,type] of [['подготовь 1:1 с Олегом','prep'],['Петя, подготовь one-on-one с Машей на завтра','prep'],['что обсудить на 1:1 с Олегом?','prep'],['1:1 с Олегом','prep'],['повестка на встречу один на один с Ваней','prep'],
  ['запиши итоги 1:1 с Олегом: я обещал выбить бюджет','save'],['запиши итоги 1:1: обсудили отпуск','save'],['итоги 1-1 с Машей — она хочет в геймплей','save'],
  ['что я обещал Маше','promises'],['что Олег обещал?','promises'],['договорённости с Олегом','promises'],['что я обещал на 1:1','promises'],['мои обещания Маше','promises']])
  assert.equal(app.route(p)?.type,type,p);
 for(const p of ['1 на 1 в игре','кто выиграл 1 на 1','сыграем 1 на 1','счёт 1:1','мои обещания','мои обещания по задачам','итоги встречи с заказчиком: всё ок','запиши встречу','подготовь встречу с заказчиком','масштаб 1:1','привет'])
  assert.equal(app.route(p),null,p);
 assert.deepEqual([app.route('подготовь 1:1 с Олегом').who,app.route('что я обещал Маше').who,app.route('что Олег обещал?').owner],['Олегом','Маше','them']);

 // --- Follow-ups by code --------------------------------------------------------------------------------------------
 const oleg={...TEAM[1],key:'u-oleg'};
 const found=fu.extract('Обсудили переход на новый SDK. Я обещал выбить бюджет на курсы до пятницы; Олег сделает ревью архитектуры к 20 ноября.\nДоговорились, что он подготовит план миграции на следующей неделе. С меня — познакомить его с Ирой из бэкенда. Маша сделает макеты. Мне нужно поговорить с HR завтра. Он устал от дежурств',{member:oleg,now:NOW}).followups;
 assert.deepEqual(found.map(f=>[f.owner,f.text,f.due]),[['me','Выбить бюджет на курсы','2026-11-13'],['them','Сделает ревью архитектуры','2026-11-20'],['them','Подготовит план миграции','2026-11-20'],['me','Познакомить его с Ирой из бэкенда',''],['me','Поговорить с HR','2026-11-10']],
  'Маша (another colleague) and a statement without a promise are not follow-ups');
 assert.equal(fu.due('сделать к 5 декабря',NOW).due,'2026-12-05');assert.equal(fu.due('до 3.01',NOW).due,'2027-01-03');assert.equal(fu.due('до конца месяца',NOW).due,'2026-11-30');
 assert.equal(fu.due('через 2 недели',NOW).due,'2026-11-23');assert.equal(fu.due('когда-нибудь',NOW).due,'');

 // --- Not added, not loaded, unknown people ---------------------------------------------------------------------------
 let f=fixture({settings:{'extension_one-on-one':'false'}});
 assert.equal(await app.turn(f.s,'подготовь 1:1 с Олегом'),null);
 f=fixture();
 assert.equal((await app.turn({...f.s,people:null},'подготовь 1:1 с Олегом')).question,true);
 assert.equal(await app.turn(f.s,'что я обещал маме'),null,'not a colleague: not ours');
 const nobody=await app.turn(f.s,'подготовь 1:1 с Петром');assert.equal(nobody.question,true);assert.match(nobody.text,/Не нашёл «Петром»/);
 const emptyTeam=fixture({team:[]});assert.match((await app.turn(emptyTeam.s,'запиши итоги 1:1: всё хорошо')).text,/«Команда»|«Команды»/);

 // --- Saving the outcome: a card, then «Сохранить» with edits ----------------------------------------------------------
 const NOTES='Обсудили переход на новый SDK. Я обещал выбить бюджет на курсы до пятницы; Олег сделает ревью архитектуры к 20 ноября. Маша сделает макеты.';
 const r=await app.turn(f.s,'запиши итоги 1:1 с Олегом: '+NOTES);
 const card=r.extensionData.oneOnOneCard;
 assert.equal(card.mode,'confirm');assert.equal(card.person.name,'Олег Смирнов');
 assert.deepEqual(card.draft.followups.map(x=>[x.tid,x.owner,x.text]),[['f0','me','Выбить бюджет на курсы'],['f1','them','Сделает ревью архитектуры']]);
 assert.match(r.text,/нашёл договорённостей — 2 \(ваших — 1, Олег — 1\)\. Проверьте и нажмите «Сохранить»/);
 assert.ok(!r.text.includes('SDK'),'the reply text carries counts, not the notes');
 assert.equal(f.s.people.status().notes,0,'nothing saved by the chat turn');assert.equal(f.ipc.state(card.draft.id),'pending');
 // The user unchecks nothing but gives the review to himself and sets a date.
 const saved=f.ipc.confirm(card.draft.id,[{text:'Выбить бюджет на курсы',owner:'me',due:'2026-11-13'},{text:'Сделать ревью архитектуры',owner:'me',due:'2026-11-20'},{text:'',owner:'me'}]);
 assert.equal(saved.saved,2);assert.equal(f.ipc.state(card.draft.id),'saved');assert.equal(f.ipc.confirm(card.draft.id).text,'Уже сохранено');
 assert.deepEqual(f.s.people.followups({member:'u-oleg'}).map(x=>[x.owner,x.text]),[['me','Выбить бюджет на курсы'],['me','Сделать ревью архитектуры']]);
 assert.equal(f.s.people.notes('u-oleg')[0].text,NOTES);
 assert.throws(()=>f.ipc.confirm('unknown-draft'),/устарела/);
 // Without a name: the question lists «Команда», the answer continues to the card.
 let q;try{await app.turn(f.s,'запиши итоги 1:1: Маша хочет в геймплей, я обещал поговорить с лидом');}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.deepEqual(q.spec.options,['Маша Петрова · Клиент','Олег Смирнов · Сервер','Иван Козлов']);
 const masha=await q.resume('Маша Петрова · Клиент');const md=masha.extensionData.oneOnOneCard.draft;
 assert.deepEqual(md.followups.map(x=>[x.owner,x.text]),[['me','Поговорить с лидом']]);
 f.ipc.cancel(md.id);assert.equal(f.ipc.state(md.id),'expired');assert.throws(()=>f.ipc.confirm(md.id),/устарела/);
 // Without the notes: they are asked for, the answer continues to the card; an empty answer writes nothing.
 let nq;try{await app.turn(f.s,'запиши итоги 1:1 с Машей');}catch(e){nq=e;}
 assert.ok(nq instanceof InputRequired);assert.match(nq.spec.text,/^Что записать в итоги 1:1 · Маша Петрова\?/);
 assert.equal((await nq.resume('  ')).question,true);
 const asked=await nq.resume('я обещал поговорить с лидом');f.ipc.cancel(asked.extensionData.oneOnOneCard.draft.id);
 assert.deepEqual(asked.extensionData.oneOnOneCard.draft.followups.map(x=>x.text),['Поговорить с лидом']);
 const m2=(await app.turn(f.s,'запиши итоги 1:1 с Машей: я обещал поговорить с лидом до среды')).extensionData.oneOnOneCard.draft;
 f.ipc.confirm(m2.id);

 // --- «Что я обещал Маше», «что Олег обещал», closing one ----------------------------------------------------------
 const mine=await app.turn(f.s,'что я обещал Маше?');
 assert.match(mine.text,/^Маша Петрова — ваши обещания \(1\): Поговорить с лидом \(до 11 ноября\)\./);
 const items=mine.extensionData.oneOnOneCard.items;assert.equal(items.length,1);
 assert.equal(f.ipc.done('masha@studio.com',items[0].id,true).done,true);
 assert.match((await app.turn(f.s,'что я обещал Маше')).text,/^Маша Петрова: открытых ваших обещаний нет/);
 assert.equal(f.ipc.done('masha@studio.com',items[0].id,false).done,false,'«Отменить» reopens');
 assert.match((await app.turn(f.s,'что Олег обещал')).text,/^Олег Смирнов: открытых обещаний нет/);
 const allMine=await app.turn(f.s,'что я обещал на 1:1');
 assert.equal(allMine.extensionData.oneOnOneCard.items.length,3);assert.equal(allMine.extensionData.oneOnOneCard.person,null);
 assert.throws(()=>f.ipc.done('masha@studio.com','nope',true),/уже нет/);

 // --- Prep: notes, follow-ups, absences, Jira and PRs, agenda, model questions ----------------------------------------
 const jira=(route,body)=>{assert.equal(route,'/rest/api/3/search/jql');assert.equal(body.jql,'project IN ("GAME") AND assignee = "u-oleg" AND updated >= -14d ORDER BY updated DESC');
  return {issues:[{key:'GAME-12',fields:{summary:'Матчмейкинг',status:{name:'In Progress',statusCategory:{key:'indeterminate'}},updated:'2026-11-08T10:00:00Z'}},{key:'GAME-9',fields:{summary:'Логи',status:{name:'Done',statusCategory:{key:'done'}},updated:'2026-11-03T10:00:00Z'}}]};};
 const github=u=>{assert.equal(u.pathname,'/repos/studio/game/pulls');assert.equal(u.searchParams.get('state'),'all');
  return [{number:41,title:'Новый матчмейкер',user:{login:'oleg-smirnov'},state:'open',draft:false,created_at:'2026-11-02T10:00:00Z',updated_at:'2026-11-08T10:00:00Z',html_url:'https://github.com/studio/game/pull/41'},
   {number:40,title:'Чужой PR',user:{login:'masha-p'},state:'open',created_at:'2026-11-07T10:00:00Z',updated_at:'2026-11-08T10:00:00Z',html_url:'https://github.com/studio/game/pull/40'},
   {number:30,title:'Старый',user:{login:'oleg-smirnov'},state:'closed',merged_at:'2026-10-01T10:00:00Z',created_at:'2026-09-20T10:00:00Z',updated_at:'2026-10-01T10:00:00Z',html_url:'https://github.com/studio/game/pull/30'}];};
 let modelBody=null;
 const model=body=>{modelBody=body;return {message:{content:JSON.stringify({questions:['Как идёт переход на новый SDK?','x']})}};};
 const conn={module_jira:'true',jiraUrl:SITE,jiraEmail:'lead@studio.com',jiraToken:'jira-test',jiraProjects:'GAME','extension_pull-requests':'true',githubToken:'gh-test',githubRepos:'studio/game',model:'qwen3:8b'};
 const p=fixture({settings:conn,jira,github,model});
 const pd=(await app.turn(p.s,'запиши итоги 1:1 с Олегом: '+NOTES+' В следующий раз обсудить дежурства.')).extensionData.oneOnOneCard.draft;p.ipc.confirm(pd.id);
 p.s.people.addAbsence('u-oleg',{from:'2026-11-23',to:'2026-11-27',kind:'vacation'});
 const prep=await app.turn(p.s,'подготовь 1:1 с Олегом');
 const c=prep.extensionData.oneOnOneCard;
 assert.equal(c.mode,'prep');assert.deepEqual(c.history,['2026-11-09']);
 assert.deepEqual(c.mine.map(x=>x.text),['Выбить бюджет на курсы']);assert.deepEqual(c.theirs.map(x=>x.text),['Сделает ревью архитектуры']);
 assert.deepEqual(c.absences.map(a=>[a.from,a.to]),[['2026-11-23','2026-11-27']]);
 assert.deepEqual(c.jira.items.map(i=>[i.key,i.category,i.url]),[['GAME-12','progress',SITE+'/browse/GAME-12'],['GAME-9','done',SITE+'/browse/GAME-9']]);
 assert.deepEqual(c.prs.items.map(i=>[i.number,i.state]),[[41,'open']],'only his PRs of the last two weeks');
 assert.deepEqual(c.agenda,['Как дела, что изменилось с прошлой встречи (9 ноября)','Моё обещание: Выбить бюджет на курсы','Статус: Сделает ревью архитектуры','Задачи в работе: GAME-12','PR ждут ревью дольше трёх дней: #41','Отсутствие с 23 ноября: кто подхватит дела','Вернуться к: дежурства','Обратная связь в обе стороны','Вопрос: Как идёт переход на новый SDK?']);
 assert.match(prep.text,/^1:1 · Олег Смирнов: последняя встреча сегодня, открытых договорённостей: 2 \(ваших — 1\), задач в Jira за 2 недели: 2, PR: 1\./);
 assert.ok(!prep.text.includes('SDK'));
 assert.ok(modelBody.messages[1].content.includes('SDK'),'the local model of this prep turn reads the notes');
 assert.ok(!require('../src/team.cjs').context(p.s.settings,'Олег').includes('SDK'),'the team context never carries notes');
 // Jira down: PRs still there, the failure is a notice.
 const down=fixture({settings:conn,github,model});
 const dc=(await app.turn(down.s,'подготовь 1:1 с Олегом')).extensionData.oneOnOneCard;
 assert.equal(dc.prs.items.length,1);assert.match(dc.notices[0],/^Jira: HTTP 500/);
 assert.equal(dc.agenda[0],'Ожидания от встреч 1:1: как часто и о чём говорить','first meeting');
 // Without a model and without connections: the card is complete, nothing is requested.
 const bare=fixture();
 const bc=(await app.turn(bare.s,'подготовь 1:1 с Машей')).extensionData.oneOnOneCard;
 assert.equal(bc.jira.connected,false);assert.equal(bc.prs.connected,false);assert.equal(bare.calls.length,0);
 // A promises question never asks the model.
 const quiet=fixture({settings:{model:'qwen3:8b'}});await app.turn(quiet.s,'что я обещал Маше');assert.equal(quiet.calls.length,0);
 // Two Олегов: asked.
 const two=fixture({team:[...TEAM,{name:'Олег Кузнецов',role:'QA'}]});
 let tq;try{await app.turn(two.s,'подготовь 1:1 с Олегом');}catch(e){tq=e;}
 assert.ok(tq instanceof InputRequired);assert.deepEqual(tq.spec.options,['Олег Смирнов · Сервер','Олег Кузнецов · QA']);
 // GitHub author by the login on the card.
 assert.equal(activity.isAuthor('osm',{...oleg,accounts:{github:{handle:'osm'}}},TEAM),true);assert.equal(activity.isAuthor('oleg-smirnov',{...oleg,accounts:{github:{handle:'osm'}}},TEAM),false);

 // --- Offer ----------------------------------------------------------------------------------------------------------
 assert.equal(offer.ready({'extension_one-on-one':'true'}),true);assert.equal(offer.ready({}),false);
 console.log('One-on-one: routing and near-misses, follow-ups by code, confirmation card with edits, questions, promises and closing, prep with Jira, PRs, absences, agenda and model questions, failures apart, privacy passed');
})().catch(e=>{console.error(e);process.exit(1);});
