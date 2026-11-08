// «Петя-наставник»: routing and near-misses, the analysis of a synthetic local history (repeated requests,
// a chain of apps used every morning, a pasted template, a repeated web search), what is left out (recurring runs,
// already automated commands, the mentor's own commands, hidden and created patterns), time estimates by the shown
// method, each proposal type and «Создать» (recurring command through the chat, a skill through the skill tools,
// an extension.json draft, a catalog app through the offers flow), the weekly schedule and settings validation.
// No model and no network: s.request throws if anything tries.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/mentor/feature.cjs');
const history=require('../src/extensions/mentor/history.cjs');
const proposals=require('../src/extensions/mentor/proposals.cjs');
const offer=require('../src/extensions/mentor/offer.cjs');
const recurring=require('../src/features/recurring.cjs');
const installedSkills=require('../src/skill-library/installed.cjs');

const {NOW,at,chat,topics}=require('./fixtures/mentor-history.cjs');

(async()=>{
 // --- routing ---------------------------------------------------------------------------------------------------
 for(const t of ['что мне автоматизировать?','что я делаю руками','Петя, что я делаю руками?','что можно автоматизировать','что я постоянно прошу','Петя-наставник, что нового?','наставник, разбор недели','какие запросы повторяются','где я теряю время'])
  assert.deepEqual(app.route(t),{kind:'analyze'},t);
 assert.deepEqual(app.route('включи наставника по пятницам в 17:00'),{kind:'weekly',on:true,time:'17:00',day:5});
 assert.deepEqual(app.route('включи еженедельный разбор наставника по средам в 9'),{kind:'weekly',on:true,time:'09:00',day:3});
 assert.deepEqual(app.route('выключи наставника'),{kind:'weekly',on:false});
 assert.deepEqual(app.route('Создай повтор: Покажи PR каждый день в 09:30'),{kind:'repeat',phrase:'Покажи PR каждый день в 09:30'});
 // Near-misses: a mentor for a subject or a junior (hiring), the day's plan (journal / calendar), recurring commands
 // list, automating a build or CI (that system, not the user's habits).
 for(const t of ['наставник по Unity','ментор для джуна','нужен ментор для джуна','найди наставника','что мне делать сегодня','что у меня сегодня','какие у меня повторы','что можно автоматизировать в сборке Unity','что мне автоматизировать в CI','как автоматизировать деплой','автоматизируй сборку'])
  assert.equal(app.route(t),null,'not ours: '+t);
 const offered=t=>(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)))&&!offer.avoid.some(r=>r.test(t));
 for(const t of ['что мне автоматизировать?','что я делаю руками','Петя-наставник'])assert.ok(offered(t),t);
 for(const t of ['наставник по Unity','ментор для джуна','что мне делать сегодня','какие у меня повторы'])assert.ok(!offered(t),t);

 // --- normalization and estimates ---------------------------------------------------------------------------------
 assert.deepEqual([...history.stems('Петя, покажи PR, которые ждут моего ревью!')].sort(),['pr','ждут','покаж','ревью']);
 assert.ok(history.similarity(history.stems('какие PR ждут моего ревью'),history.stems('покажи PR, которые ждут ревью')).score>=0.6);
 assert.equal(history.slug('Покажи PR, которые ждут'),'pokazhi-pr-kotorye-zhdut');
 const est=history.estimate({kind:'request',length:100,perWeek:3},'schedule');
 assert.deepEqual(est,{perTime:Math.round(100/(200/60)+15+20),spentWeek:Math.round((100/(200/60)+35)*3/60*10)/10,savedWeek:Math.round((100/(200/60)+15)*3/60*10)/10});

 // --- the chat turn on a synthetic history --------------------------------------------------------------------------
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-mentor-'));
 const state={topics:topics(),projects:[{id:'general',name:'Общий'}],activeProjectId:'general'};
 const active={id:'now',title:'Чат',messages:[]};state.topics.push(active);
 const sent=[],saved=[],proposed=[];
 const s={settings:{model:'qwen3:8b'},companyId:'c1',dataRoot:dir,skillRoot:path.join(dir,'skills'),smoke:true,requestProgress:{report(){}},
  dialogue:{state,active:()=>active,persist(){},rememberAction(c,text){active.messages.push({role:'user',text:c,at:Date.now()},{role:'assistant',text,at:Date.now()});}},
  win:{isDestroyed:()=>false,webContents:{send:(ch,d)=>sent.push([ch,d])}},
  saveSettings(patch){saved.push(patch);Object.assign(s.settings,patch);},
  extensionOffers:{prerequisite:(id,command)=>{proposed.push([id,command]);return {items:[{id:'o1',ext:id,name:'Крэши',pitch:'покажу крэши'}],direct:true};}},
  async request(){throw Error('nothing leaves the computer');}};
 const chatJobs={busy:()=>false,start:()=>({})};
 const rec=recurring.setup({dataRoot:dir,smoke:true,dialogue:s.dialogue,chatJobs});
 s.recurring=rec.recurring;
 // «Проверь почту» is already a recurring command.
 rec.recurring.turn('Проверяй почту каждый день в 10:00');active.messages.length=0;
 Object.assign(s,(({ipc,...rest})=>(s.ipc=ipc,rest))(app.setup(s)));
 const realNow=Date.now;Date.now=()=>NOW;

 assert.equal(await app.turn(s,'что мне автоматизировать?'),null,'not added: nothing here');
 s.settings.extension_mentor='true';
 const r=await app.turn(s,'что мне автоматизировать?');
 const card=r.extensionData.mentorCard;
 const byKind=kind=>card.patterns.filter(p=>p.kind===kind);
 const titles=card.patterns.map(p=>p.title);
 // Chain of three apps every morning around 09:30 → a recurring command.
 const chain=byKind('sequence')[0];
 assert.equal(chain.title,'Pull requests → Сборки → Jira');assert.equal(chain.days,6);assert.equal(chain.regular,true);
 assert.equal(chain.proposal.type,'schedule');
 assert.equal(chain.proposal.phrase,'Покажи PR, которые ждут моего ревью, затем статус CI, затем мои задачи в Jira на сегодня каждый день в 09:30');
 assert.ok(!titles.includes('покажи PR, которые ждут моего ревью'),'a request that is a step of the chain is the chain');
 // A long instruction at irregular times → a skill draft.
 const rep=card.patterns.find(p=>/отчёт для заказчика/.test(p.title));
 assert.equal(rep.kind,'request');assert.equal(rep.count,4);assert.equal(rep.proposal.type,'skill');
 assert.match(rep.proposal.skillMd,/^---\nname: napishi-korotkiy-otchet-zakazchika\ndescription: "Когда я прошу «напиши короткий отчёт/);
 assert.equal(rep.examples.length,4);assert.ok(rep.examples.every(e=>!Number.isNaN(Date.parse(e.at))),'evidence has dates');
 // A short request served by an app that has no catalog equivalent → an extension idea with extension.json.
 const rel=card.patterns.find(p=>p.title==='сколько дней до релиза');
 assert.equal(rel.proposal.type,'extension');
 const manifest=JSON.parse(rel.proposal.json);
 assert.equal(manifest.id,'my-skolko-dney-reliza');assert.equal(manifest.setting,'extension_my-skolko-dney-reliza');assert.equal(manifest.examples.length,3);
 // A request a catalog app answers → that app through the offers flow.
 const cr=card.patterns.find(p=>p.title==='какие крэши за неделю');
 assert.deepEqual(cr.proposal.app,{id:'crashes',name:'Крэши',pitch:require('../src/extensions/crashes/offer.cjs').pitch});
 // A pasted text with the same lines → a template skill; varying lines become «{…}».
 const paste=byKind('paste')[0];
 assert.equal(paste.count,3);assert.equal(paste.proposal.type,'skill');
 assert.match(paste.template,/^Привет! Еженедельный апдейт по проекту Бункер\.\n\{…\}\nВ работе: магазин и ивент на Хэллоуин\nБлокеры: нет, всё идёт по плану\n\{…\}/);
 assert.match(paste.proposal.skillMd,/```text\nПривет! Еженедельный апдейт/);
 // A web search every morning → a recurring search.
 const news=byKind('search')[0];
 assert.equal(news.title,'новости Unity 6');assert.equal(news.proposal.type,'schedule');assert.equal(news.proposal.phrase,'Найди в интернете новости Unity 6 каждый день в 08:05');
 // Left out: the recurring mail check, the recurring runs, noise, the mentor's own command.
 assert.ok(!titles.some(t=>/почту/i.test(t)),'already a recurring command');
 assert.ok(!titles.some(t=>/автоматизир|^привет$|2\+2/i.test(t)));
 // Ranked by time saved, with the totals and the method.
 for(let i=1;i<card.patterns.length;i++)assert.ok(card.patterns[i-1].savedWeek>=card.patterns[i].savedWeek,'ranked by time saved');
 assert.equal(card.totalSaved,Math.round(card.patterns.reduce((a,p)=>a+p.savedWeek,0)*10)/10);
 assert.deepEqual(card.method,history.METHOD);
 assert.deepEqual(card.weekly,{enabled:false,day:5,time:'17:00'});
 assert.match(r.text,/^За 8 недель нашёл 6 повторений, можно сэкономить около [\d,]+ мин в неделю\. Больше всего — «.+»: .+\. Ничего не создаю без «Создать»\.$/);
 assert.ok(!fs.existsSync(s.skillRoot),'nothing is created by the analysis');

 // --- «Создать» and «Скрыть» (card buttons → ipc) -------------------------------------------------------------------
 const made=await s.ipc.create(rep.key);
 assert.match(made.text,/^Скилл «napishi-korotkiy-otchet-zakazchika» создан/);
 const skill=installedSkills.list(s.skillRoot).find(x=>x.name==='napishi-korotkiy-otchet-zakazchika');
 assert.ok(skill);assert.match(skill.description,/Когда я прошу/);
 const draft=await s.ipc.create(rel.key);
 assert.ok(draft.path.startsWith(path.join(dir,'extensions','mentor','drafts')));
 assert.deepEqual(JSON.parse(fs.readFileSync(draft.path,'utf8')),manifest);
 assert.throws(()=>s.ipc.reveal(path.join(dir,'..','etc','passwd')),/не найден/,'only drafts can be revealed');
 const appOffer=await s.ipc.create(cr.key);
 assert.deepEqual(proposed,[['crashes','какие крэши за неделю']]);assert.equal(appOffer.offer.items[0].ext,'crashes');
 const schedule=await s.ipc.create(chain.key);
 assert.equal(schedule.ask,'Создай повтор: '+chain.proposal.phrase);
 // The card sends it to the chat; the mentor hands it to the recurring commands.
 const repeat=await app.turn(s,schedule.ask);
 assert.equal(repeat.by,'Петя-наставник');assert.match(repeat.text,/^Хорошо: «Покажи PR, которые ждут моего ревью, затем статус CI, затем мои задачи в Jira на сегодня» каждый день в 09:30/);
 assert.ok(rec.ipc.list().some(i=>i.schedule==='каждый день в 09:30'));
 assert.equal(active.messages.at(-2).text,schedule.ask,'the chat keeps the user\'s words');
 assert.equal((await app.turn(s,'Создай повтор: что-то без расписания')).error,true);
 s.ipc.hide(news.key);
 const again=(await app.turn(s,'что я делаю руками')).extensionData.mentorCard;
 assert.deepEqual(again.patterns.map(p=>p.title).sort(),[cr.title,paste.title].sort(),'created, hidden and now-recurring patterns are gone; the app offer stays until it is added');
 await assert.rejects(async()=>s.ipc.create('request:nothing'),/устарела/);

 // --- weekly schedule ---------------------------------------------------------------------------------------------
 const friday=new Date(2026,10,13,17,5);
 assert.equal(app.due(s,friday),false,'off until the user enables it');
 const on=await app.turn(s,'включи наставника по пятницам в 17:00');
 assert.deepEqual(saved.at(-1),{mentorWeekly:'true',mentorDay:'5',mentorTime:'17:00'});
 assert.match(on.text,/^Хорошо: по пятницам в 17:00 разберу/);
 assert.equal(app.due(s,new Date(2026,10,13,16,59)),false);assert.equal(app.due(s,new Date(2026,10,12,17,5)),false,'not on Thursday');
 assert.equal(app.due(s,friday),true);
 // New history so the weekly run has something to show.
 state.topics.push(chat('w','Ещё',[0,1,2].map(d=>['собери статистику по ревью за неделю для команды',new Date(2026,10,13-d*2,15).getTime()])));
 Date.now=()=>friday.getTime();
 const weekly=await s.mentor.tick(friday);
 assert.ok(weekly,'weekly review prepared');
 const mentorTopic=state.topics.find(t=>t.mentor);
 assert.equal(mentorTopic.messages.at(-1).by,'Петя-наставник');assert.ok(mentorTopic.messages.at(-1).extensionData.mentorCard.patterns.length>0);
 assert.ok(sent.some(([ch,d])=>ch==='extension-install-progress'&&d.id==='mentor:weekly'&&d.kind==='success'));
 assert.equal(await s.mentor.tick(new Date(2026,10,13,17,30)),null,'once a day');
 assert.equal(mentorTopic.messages.length,1,'the mentor chat is not analysed itself');
 assert.match((await app.turn(s,'выключи наставника')).text,/выключен/);assert.equal(s.settings.mentorWeekly,'false');
 // Settings validation.
 assert.throws(()=>app.validate({mentorDay:'7'}),/День/);assert.throws(()=>app.validate({mentorTime:'25:00'}),/Время/);assert.throws(()=>app.validate({mentorWeekly:'yes'}));
 app.validate({mentorWeekly:'true',mentorDay:'1',mentorTime:'09:30'});
 // Little history: says so instead of guessing.
 const empty={...s,dialogue:{...s.dialogue,state:{topics:[chat('x','Новый',[['привет',at(1,9)]])],projects:[]}}};
 assert.match(app.summary(app.analyzeNow(empty,NOW)),/^Пока мало истории/);
 // Proposal fallbacks without an app or regular time.
 assert.equal(proposals.propose({kind:'request',title:'что там',length:20,by:'',regular:false,examples:[],count:3}).type,'skill');
 Date.now=realNow;
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('Mentor: routing, synthetic history patterns, estimates, proposals, «Создать» for each type, hide, weekly schedule passed');
})().catch(e=>{console.error(e);process.exit(1);});
