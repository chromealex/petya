// «Идеи для ивентов» (src/extensions/event-ideas): holidays computed by code (Lunar New Year and Mid-Autumn from new
// moons and solar terms, Islamic holidays from the tabular calendar against the published dates of «Объясни график»,
// Diwali, Easter, Thanksgiving, Carnival), regions and windows; routing with near-misses (an event in the calendar, in
// code, in a funnel); ideas with evidence (holidays, competitors' release-note lines read from «Конкуренты»' own
// store, our past events with DAU / revenue from a metrics source) and their cost from the fixture project's configs
// (terms with file:line, days of income); the turns: ideas, «запланируй ивент N» (plan card, nothing written), the
// plan saved once on the button, a past event recorded with its metrics, clarifications; the model's pitch without
// numbers; the offer.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const H=require('../src/extensions/event-ideas/holidays.cjs');
const I=require('../src/extensions/event-ideas/ideas.cjs');
const query=require('../src/extensions/event-ideas/query.cjs');
const app=require('../src/extensions/event-ideas/feature.cjs');
const offer=require('../src/extensions/event-ideas/offer.cjs');
const ce=require('../src/extensions/chart-explain/holidays.cjs');
const E=require('../src/extensions/balance-sim/economy.cjs');
const ROOT=path.join(__dirname,'fixtures/balance-sim/project');

(async()=>{
 // --- Holidays -----------------------------------------------------------------------------------------------------------
 assert.deepEqual([2023,2024,2025,2026,2027,2028,2029,2030,2031,2032].map(y=>H.lunarNewYear(y)),['2023-01-22','2024-02-10','2025-01-29','2026-02-17','2027-02-06','2028-01-26','2029-02-13','2030-02-03','2031-01-23','2032-02-11']);
 assert.deepEqual([2023,2024,2025,2026,2027,2028,2029,2030].map(y=>H.midAutumn(y)),['2023-09-29','2024-09-17','2025-10-06','2026-09-25','2027-09-15','2028-10-03','2029-09-22','2030-09-12'],'2025 has a leap month: still the 15th of the 8th month');
 // Against the published dates in «Объясни график» (Islamic holidays follow the crescent: ± 1 day).
 const published=y=>ce.year(y).filter(h=>/Ураза|Курбан|Китайский/.test(h.name));
 for(let y=2024;y<=2030;y++)for(const h of published(y)){
  const mine=/Ураза/.test(h.name)?H.islamic(y,10,1):/Курбан/.test(h.name)?H.islamic(y,12,10):[H.lunarNewYear(y)];
  assert.ok(mine.some(d=>Math.abs(Date.parse(d)-Date.parse(h.date))<=86400000*(/Китайский/.test(h.name)?0:1)),h.name+' '+y+': '+mine+' vs '+h.date);
 }
 const diwali={2024:['2024-10-31','2024-11-01'],2025:['2025-10-20','2025-10-21'],2026:['2026-11-08'],2027:['2027-10-29'],2028:['2028-10-17'],2029:['2029-11-05'],2030:['2030-10-26']};
 for(const [y,list] of Object.entries(diwali))assert.ok(list.some(d=>Math.abs(Date.parse(d)-Date.parse(H.diwali(Number(y))))<=86400000),'Diwali '+y+': '+H.diwali(Number(y)));
 const y26=H.year(2026),on=id=>y26.find(h=>h.id===id+'-2026');
 assert.equal(on('easter').date,'2026-04-05');assert.equal(on('orthodox-easter').date,'2026-04-12');assert.equal(on('carnival').date,'2026-02-17');
 assert.equal(on('thanksgiving').date,'2026-11-26');assert.equal(on('black-friday').date,'2026-11-27');assert.equal(on('mothers-day').date,'2026-05-10');
 assert.equal(on('seollal').date,'2026-02-17');assert.equal(on('chuseok').date,'2026-09-25');
 assert.deepEqual([on('halloween').start,on('halloween').end],['2026-10-24','2026-11-02']);
 assert.equal(on('ramadan').approx,true);assert.equal(on('halloween').approx,false);
 const up=(regions)=>H.upcoming('2026-11-09','2027-03-01',regions).map(h=>h.id.replace(/-\d{4}$/,''));
 assert.ok(up([]).includes('christmas')&&up([]).includes('lunar-new-year')&&!up([]).includes('feb23'),'worldwide only');
 assert.ok(up(['RU']).includes('feb23')&&up(['RU']).includes('orthodox-christmas'));
 assert.ok(up(['BR']).includes('carnival')&&!up(['US']).includes('carnival'));
 assert.ok(up(['TR']).includes('ramadan'));

 // --- Routing -------------------------------------------------------------------------------------------------------------
 for(const t of ['какой ивент провести в декабре','идеи ивентов на Хэллоуин для Бразилии','придумай ивент к Новому году','что провести из лайв-опс ивентов в Азии','предложи ивенты на ближайший месяц','какие ивенты запустить для России'])assert.equal(query.about(t),'ideas',t);
 for(const t of ['запланируй ивент 2','запланируй ивент «Хэллоуин»','заплань ивент на Чёрную пятницу'])assert.equal(query.about(t),'plan',t);
 assert.equal(query.about('прошлый ивент «Хэллоуин» шёл с 24 октября по 2 ноября 2025'),'past');
 for(const t of ['поставь ивент в календаре на завтра','какие ивенты в календаре на неделю','создай ивент в календаре с Олегом','как подписаться на ивент в коде','UnityEvent не вызывается','воронка: ивенты tutorial_start → purchase','сколько ивентов в AppMetrica','что такое ивент','ивент прошёл отлично','какой ивент у меня завтра на встрече'])assert.equal(query.about(t),null,t);
 assert.deepEqual(query.regions('идеи для Бразилии и Азии').sort(),['BR','CN','ID','JP','KR','VN']);
 assert.equal(query.horizon('какой ивент провести в декабре','2026-11-09'),52);assert.equal(query.horizon('на 2 месяца','2026-11-09'),60);assert.equal(query.horizon('на ближайший месяц','2026-11-09'),30);
 assert.equal(query.horizon('идеи на февраль','2026-11-09'),111);
 assert.deepEqual(query.dates('с 24 октября по 2 ноября 2025','2026-11-09'),['2025-10-24','2025-11-02']);
 assert.deepEqual(query.dates('шёл 24.10–02.11','2026-11-09'),['2026-10-24','2026-11-02']);
 assert.equal(query.named('ивент на Чёрную пятницу'),'black-friday');assert.equal(query.quoted('ивент «Хэллоуин 2025» шёл'),'Хэллоуин 2025');

 // --- Ideas and costs ---------------------------------------------------------------------------------------------------
 const {economy}=await E.read([ROOT]);
 const r=I.refs(economy,{actionsPerDay:8,winRate:0.5});
 assert.equal(r.income,840);assert.equal(r.win.field,'winGold');assert.equal(r.daily.amount,200);assert.equal(r.max.label,'Меч 6');
 const login=I.cost('login',7,r);
 assert.deepEqual(login.terms.map(t=>[t.label,t.value,t.from?.file.split('/').pop()+':'+t.from?.line]),[['7 × ежедневный подарок',1400,'economy.json:2'],['главный приз: «Меч 4»',2400,'upgrades.json:6']]);
 assert.equal(login.total,3800);assert.equal(login.incomeDays,4.5);assert.equal(login.level,'medium');assert.equal(login.currency,'gold');
 assert.equal(I.cost('collect',7,r).total,3600);assert.equal(I.cost('double',2,r).total,1280);assert.equal(I.cost('sale',3,r).total,5040);assert.equal(I.cost('sale',3,r).level,'high');
 assert.equal(I.cost('tournament',7,r).total,1560);assert.equal(I.cost('tournament',7,r).level,'low');assert.equal(I.cost('pair',7,r).total,2400);
 assert.equal(I.cost('login',7,null),null,'no economy, no cost');
 const notes=[{name:'Clash Arena',store:'appstore',day:'2026-10-20',notes:'• Halloween event: collect pumpkins in battles and win the Spooky Knight skin!\n• Bug fixes and performance.'},{name:'Hero Wars',store:'appstore',day:'2026-11-01',notes:'Новый турнир выходного дня с призами для лучших.\nИсправлены ошибки.'},{name:'Quiet Game',day:'2026-11-02',notes:'Improved stability.'}];
 const ev=I.competitorEvents(notes);
 assert.deepEqual(ev.map(e=>[e.game,e.quote,e.mechanic,e.holiday]),[['Clash Arena','Halloween event: collect pumpkins in battles and win the Spooky Knight skin!','collect','halloween'],['Hero Wars','Новый турнир выходного дня с призами для лучших.','tournament',null]]);
 const ideas=I.build({today:'2026-11-09',days:60,regions:['RU','US'],economy,loop:{actionsPerDay:8,winRate:0.5},competitors:notes,past:[{id:'p1',name:'Хэллоуин 2025',start:'2025-10-24',end:'2025-11-02',mechanic:'collect',holiday:'halloween',uplift:{dau:0.12,revenue:0.31},source:'AppMetrica'}]});
 assert.ok(ideas.length<=6);
 for(const i of ideas){assert.ok(i.evidence.length>=1,i.title);assert.ok(i.start>='2026-11-16','a week to prepare: '+i.title);assert.ok(i.cost&&i.cost.total>0,i.title);}
 assert.ok(ideas.some(i=>i.holiday==='christmas'&&i.mechanic==='login'));
 assert.ok(ideas.some(i=>i.holiday==='black-friday'&&i.mechanic==='sale'));
 assert.ok(ideas.some(i=>i.title==='Турнир — как у Hero Wars'&&i.evidence[0].quote==='Новый турнир выходного дня с призами для лучших.'));
 assert.ok(ideas.some(i=>i.title==='Повторить «Хэллоуин 2025»'),'the best past event once more');
 assert.ok(ideas.every((i,n)=>!n||ideas[n-1].start<=i.start),'by date');

 // --- Turns ------------------------------------------------------------------------------------------------------------------
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-events-'));
 const make=(extra={})=>{
  const topic={id:'t',title:'Чат',messages:[],projectId:'p'};
  return {topic,s:{settings:{'extension_event-ideas':'true',...extra},dataRoot,requestProgress:{report(){}},
   dialogue:{state:{projects:[{id:'p',name:'Arena',folders:[ROOT]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
   async request(url,opts){return {message:{content:JSON.stringify({items:JSON.parse(JSON.parse(opts.body).messages[1].content).ideas.map((x,n)=>({id:x.id,line:n===0?'Тыквы в каждом бою и 3 награды':'Праздничное настроение и подарки каждый день'}))})}};}}};
 };
 app.deps.now=()=>Date.parse('2026-11-09T09:00:00Z');
 {const {s}=make();s.settings['extension_event-ideas']='false';assert.equal(await app.turn(s,'какой ивент провести в декабре'),null,'not added');}
 {const {s}=make();assert.equal(await app.turn(s,'поставь ивент в календаре на завтра'),null);}
 // Competitors through their own store (as «Конкуренты» keeps it); metrics from a stub source.
 const {s,topic}=make({extension_competitors:'true',model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'});
 const h=require('../src/extensions/competitors/history.cjs'),st=h.store(s);
 h.setList(st,'p',[{key:'appstore:1',store:'appstore',id:'1',name:'Clash Arena',url:'https://apps.apple.com/app/id1'},{key:'appstore:2',store:'appstore',id:'2',name:'Hero Wars'}]);
 h.record(st,'appstore:1','2026-10-01',{version:'1.0',notes:'Bug fixes.'});h.record(st,'appstore:1','2026-10-20',{version:'1.1',notes:notes[0].notes});
 h.record(st,'appstore:2','2026-11-01',{version:'2.0',notes:notes[1].notes});h.record(st,'appstore:2','2026-06-01',{version:'1.0',notes:'Летний турнир!'});
 const DAY=86400000;
 const series=(metric,base,lift,from,to)=>{const out=[];for(let t=Date.parse(from);t<=Date.parse(to);t+=DAY){const d=new Date(t).toISOString().slice(0,10);out.push({date:d,value:d>='2025-10-24'&&d<='2025-11-02'?base*(1+lift):base});}return {metric,unit:metric==='dau'?'users':'currency:USD',series:out};};
 app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{fetch:async(_,q)=>({series:[series('dau',1000,0.2,q.from,q.to),series('revenue',500,0.5,q.from,q.to)]})}}];
 const r1=await app.turn(s,'какой ивент провести в декабре для России');
 const card=topic.messages.at(-1).extensionData.eventCard;
 assert.equal(card.mode,'ideas');assert.equal(card.days,52);assert.deepEqual(card.regions,['RU']);
 assert.equal(card.sources.competitorNotes,3,'three texts in 60 days; the June notes are older');
 assert.ok(card.ideas.some(i=>i.evidence.some(e=>e.kind==='competitor'&&e.game==='Hero Wars')));
 assert.match(r1.text,/^Идеи ивентов с 9 ноября по 31 декабря \(регионы: Россия\):\n1\. /);
 assert.match(r1.text,/\(золото\) на игрока — [\d,]+ (?:день|дня|дней) дохода\./);
 assert.ok(card.ideas.some(i=>i.pitch==='Праздничное настроение и подарки каждый день'));
 assert.ok(!card.ideas.some(i=>/\d/.test(i.pitch||'')),'a pitch with numbers is dropped');
 assert.equal(card.economy.main,'gold');assert.deepEqual(card.economy.loop,{actionsPerDay:8,winRate:0.5});
 // Plan by number: a plan card; nothing stored until the button.
 const n=card.ideas.findIndex(i=>i.holiday==='christmas')+1;
 const p=await app.turn(s,'запланируй ивент '+n);
 const plan=topic.messages.at(-1).extensionData.eventCard;
 assert.equal(plan.mode,'plan');assert.equal(plan.idea.holiday,'christmas');assert.equal(plan.saved,false);
 assert.match(p.text,/^План: «Календарь входа: Рождество», 18 декабря – 27 декабря \(10 дней\)\. Подарок за каждый день входа, большой приз в последний день\. Стоимость: /);
 assert.match(p.text,/кнопкой «Создать задачу» в карточке\.$/);
 assert.deepEqual(require('../src/extensions/event-ideas/store.cjs').list(s),[],'nothing stored by the chat turn');
 const {ipc}=app.setup(s);
 assert.equal(ipc.planned(plan.id).saved,true);assert.equal(ipc.planned(plan.id).already,true,'saved once');
 assert.deepEqual(ipc.events().map(e=>[e.name,e.start,e.end,e.planned]),[['Календарь входа: Рождество','2026-12-18','2026-12-27',true]]);
 // Plan by holiday name without an ideas card in the chat; an unknown one is asked.
 {const x=make();const q2=await app.turn(x.s,'запланируй ивент на Чёрную пятницу');assert.equal(x.topic.messages.at(-1).extensionData.eventCard.idea.holiday,'black-friday');assert.match(q2.text,/Распродажа: Чёрная пятница/);}
 {const x=make();await assert.rejects(app.turn(x.s,'запланируй ивент'),e=>e.name==='InputRequired'&&/Какой ивент запланировать/.test(e.spec.text));}
 // A past event with its metrics; remembered on the button; then it is evidence for the next ideas.
 const past=await app.turn(s,'прошлый ивент «Хэллоуин 2025» шёл с 24 октября по 2 ноября 2025');
 const pc=topic.messages.at(-1).extensionData.eventCard;
 assert.equal(pc.mode,'past');assert.deepEqual(pc.uplift,{dau:0.2,revenue:0.5,source:'AppMetrica'});
 assert.match(past.text,/^Ивент «Хэллоуин 2025», 24 октября – 2 ноября: DAU \+20%, выручка в день \+50% к двум неделям до \(AppMetrica\)\./);
 assert.equal(ipc.remember(pc.id).saved,true);assert.equal(ipc.remember(pc.id).already,true);
 assert.equal(pc.event.holiday,'halloween');
 await app.turn(s,'какие ивенты провести на 2 месяца');
 const c2=topic.messages.at(-1).extensionData.eventCard;
 assert.equal(c2.sources.past,1);
 const again=c2.ideas.find(i=>i.title==='Повторить «Хэллоуин 2025»');assert.ok(again,'the past event with a DAU rise is suggested again');
 assert.deepEqual(again.evidence[0].uplift,{dau:0.2,revenue:0.5});
 assert.match((await app.turn(s,'прошлый ивент «Зимний» шёл с 1 декабря по 20 декабря 2026')).text,/ещё не закончился/);
 // Without a project folder there is no cost, and the text says so.
 {const x=make();x.s.dialogue.state.projects=[];const t2=await app.turn(x.s,'какой ивент провести в декабре');assert.match(t2.text,/Стоимость в валюте не посчитана: подключите папку проекта/);assert.ok(x.topic.messages.at(-1).extensionData.eventCard.ideas.every(i=>i.cost===null));}
 assert.equal(app.dashboard.accepts('какой ивент провести в декабре'),true);assert.equal(app.dashboard.accepts('запланируй ивент 2'),false);

 // --- Offer -------------------------------------------------------------------------------------------------------------------
 const offers=require('../src/features/extension-offers.cjs');
 const offered=t=>offers.candidates(t,{offers:[offer],settings:{}}).map(x=>x.offer.id);
 for(const t of ['какой ивент провести в декабре','идеи ивентов на Хэллоуин для Бразилии','запланируй ивент на Новый год'])assert.deepEqual(offered(t),['event-ideas'],t);
 for(const t of ['поставь ивент в календаре на завтра','какие ивенты в календаре','UnityEvent не вызывается','воронка ивентов туториала'])assert.deepEqual(offered(t),[],t);
 app.deps.metrics=null;app.deps.now=()=>Date.now();
 fs.rmSync(dataRoot,{recursive:true,force:true});
 console.log('Event ideas: holidays by code (lunar from astronomy, Islamic tabular vs published, Diwali, Easter, Thanksgiving, Carnival), regions and windows, routing and calendar/code/funnel near-misses, ideas with holiday, competitor and past-event evidence, costs from configs with file:line, plan card then save once, past event metrics and remember, pitch without numbers, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
