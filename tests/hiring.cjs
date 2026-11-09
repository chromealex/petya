// «Найм»: routing and near-misses (hiring units or heroes in a game, a candidate of science, other apps' phrases),
// claims for interview times and the pipeline; not added; ranking requests refused; a candidate is added only by
// «Добавить в воронку» (once, validated); notes saved only by «Сохранить» with the round and interviewer; protected
// characteristics never quoted, summarised or asked about; interview prep — model questions kept only for the role's
// skills, templates without a model, the earlier rounds' doubts quoted verbatim; the feedback summary — every quote
// checked to be verbatim in its note, invented or misplaced quotes dropped, no score; «фидбэк по Маше» is not hiring
// when Маша is not a candidate; scheduling — calendar not added → a question, free slots from a stubbed Google
// free/busy, the invitation request the calendar's own flow understands; stage moves, removal with undo, wipe,
// encryption at rest. Fake clock, no network.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/hiring/feature.cjs');
const ev=require('../src/extensions/hiring/evidence.cjs');
const offer=require('../src/extensions/hiring/offer.cjs');
const calendar=require('../src/extensions/calendar/feature.cjs');
const when=require('../src/extensions/calendar/when.cjs');
const cpeople=require('../src/extensions/calendar/people.cjs');
const people=require('../src/features/people.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const NOW=new Date('2026-11-09T10:00:00Z').getTime();
app.deps.now=()=>NOW;app.deps.crypt=null;
const TEAM=[{name:'Олег Смирнов',aliases:'Олег',role:'Бэкенд-разработчик',email:'oleg@studio.example'},{name:'Маша Петрова',aliases:'Маша',role:'Клиент'}];
const ROLES='Бэкенд: Go, PostgreSQL, проектирование API\nГеймдизайнер: баланс, экономика';
const GOOGLE_SCOPE='https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';
const dirs=[];process.on('exit',()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'petya-hire-'));dirs.push(d);return d;};
function fixture({settings={},model}={}){
 const topic={id:'t1',title:'Чат',messages:[]},asked=[];
 const all={extension_hiring:'true',hiringRoles:ROLES,teamMembers:JSON.stringify(TEAM),model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...settings};
 const s={settings:all,companyId:'c1',dataRoot:tmp(),requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){const u=new URL(url);if(u.pathname==='/api/chat'){assert.ok(model,'the model is not asked here');const body=JSON.parse(options.body);asked.push(body);return model(body);}throw Error('unexpected '+url);}};
 s.people=people.create(s,{now:()=>NOW,sources:()=>[]});
 return {s,topic,asked,ipc:app.setup(s).ipc};
}
const add=async(f,phrase)=>{const r=await app.turn(f.s,phrase);return f.ipc.add(r.extensionData.hiringCard.draftId);};
const note=async(f,phrase,opts)=>{const r=await app.turn(f.s,phrase);f.ipc.saveNote(r.extensionData.hiringCard.draftId,opts);return r;};

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------------
 for(const [p,type] of [['Добавь кандидата Анна Иванова на бэкенд, anna@mail.example','add'],['покажи воронку найма','pipeline'],['кандидаты на бэкенд','pipeline'],['как идёт найм','pipeline'],
  ['подготовь интервью с Анной','prep'],['подготовь вопросы к собеседованию','prep'],['вопросы для интервью с Анной','prep'],['запиши заметки интервью с Анной: сильная в Go','note'],['фидбэк Олега по Анне: хорошо','note'],
  ['сводка по кандидату Анна','summary'],['что говорили интервьюеры про Анну','summary'],['когда назначить интервью с Анной','schedule'],['найди время для интервью с Анной и Олегом','schedule'],['пригласи Анну на техническое интервью','schedule'],
  ['кто лучше из кандидатов','refuse'],['ранжируй кандидатов','refuse'],['кого взять из кандидатов на бэкенд','refuse']])assert.equal(app.route(p)?.type,type,p);
 for(const p of ['найм юнитов','найми рабочих в игре','нанять героев в таверне','кандидаты в казарме','кандидат наук','отзыв о кандидате','подготовь 1:1 с Олегом','сделай код-ревью','запиши итоги с Машей: всё ок','запиши итоги встречи с заказчиком: всё ок','привет'])
  assert.equal(app.route(p),null,p);
 assert.deepEqual(app.route('Добавь кандидата Пётр Сидоров на бэкенд, petr@mail.example'),{type:'add',who:'Пётр Сидоров',role:'бэкенд',email:'petr@mail.example'},'the name stays as typed');
 assert.equal(app.claims('найди время для интервью с Анной'),true);assert.equal(app.claims('покажи воронку найма'),true);assert.equal(app.claims('подготовь интервью с Анной'),false);
 assert.equal(calendar.intent('найди время для интервью с Анной'),'find','the calendar would take it — hence claims()');
 assert.deepEqual(app.roles({hiringRoles:ROLES}).map(r=>[r.name,r.skills.length]),[['Бэкенд',3],['Геймдизайнер',2]]);
 assert.equal(app.roleOf({hiringRoles:ROLES},'бэкенд').name,'Бэкенд');assert.equal(app.roleOf({hiringRoles:ROLES},'бэкенду').name,'Бэкенд');
 assert.equal(offer.ready({extension_hiring:'true'}),true);

 // --- Not added, ranking refused ----------------------------------------------------------------------------------
 let f=fixture({settings:{extension_hiring:'false'}});
 assert.equal(await app.turn(f.s,'покажи воронку найма'),null);
 f=fixture();
 const refused=await app.turn(f.s,'кто лучше из кандидатов?');
 assert.match(refused.text,/^Я не сравниваю, не ранжирую и не оцениваю кандидатов/);assert.equal(refused.extensionData,undefined);
 assert.equal((await app.turn(f.s,'подготовь интервью с Анной')).question,true,'an empty pipeline is a question');

 // --- Adding: a card, then «Добавить в воронку» ----------------------------------------------------------------------
 const r1=await app.turn(f.s,'Добавь кандидата Анна Иванова на бэкенд, anna@mail.example');
 const c1=r1.extensionData.hiringCard;
 assert.equal(c1.mode,'add');assert.deepEqual(c1.candidate,{name:'Анна Иванова',role:'Бэкенд',email:'anna@mail.example'});assert.deepEqual(c1.skills,['Go','PostgreSQL','проектирование API']);
 assert.equal(f.ipc.status().candidates,0,'nothing stored by the chat turn');
 assert.throws(()=>f.ipc.add(c1.draftId,{email:'not-an-email'}),/email/);
 const added=f.ipc.add(c1.draftId,{});assert.equal(added.text,'Добавлено в воронку: Анна Иванова');
 assert.equal(f.ipc.add(c1.draftId).text,'Уже в воронке');assert.equal(f.ipc.state(c1.draftId),'saved');
 assert.throws(()=>f.ipc.add('unknown-draft'),/устарела/);
 await add(f,'добавь кандидата Пётр Сидоров на геймдизайнер');
 const anna=added.id;
 f.ipc.move(anna,'tech');

 // --- Notes: a card, then «Сохранить»; protected characteristics flagged ---------------------------------------------
 const N1='Уверенно проектирует API, объяснил идемпотентность ретраев. В PostgreSQL слабо: путал уровни изоляции. Ей 45 лет, двое детей.';
 const n1=await app.turn(f.s,'запиши заметки интервью с Анной: '+N1);
 const nc=n1.extensionData.hiringCard;
 assert.equal(nc.mode,'note');assert.equal(nc.round,'tech');assert.equal(nc.interviewer,'Вы');assert.equal(nc.flagged,1);
 assert.match(n1.text,/Фраз о личных характеристиках: 1/);assert.ok(!n1.text.includes('идемпотент'),'the reply carries no note text');
 assert.equal(f.ipc.status().notes,0);
 f.ipc.saveNote(nc.draftId,{round:'tech',interviewer:'Вы'});assert.equal(f.ipc.state(nc.draftId),'saved');
 assert.throws(()=>f.ipc.saveNote(nc.draftId),/устарела/,'saved once');
 const N2='Go знает глубоко: горутины, контексты, профилирование. Не уверена в Kafka — стоит доспросить на финале.';
 const n2=await app.turn(f.s,'фидбэк Олега по Анне: '+N2);assert.equal(n2.extensionData.hiringCard.interviewer,'Олег Смирнов');
 f.ipc.saveNote(n2.extensionData.hiringCard.draftId,{});
 assert.equal(f.ipc.status().notes,2);
 // «фидбэк по Маше» — Маша is a colleague, not a candidate: not this app.
 assert.equal(await app.turn(f.s,'фидбэк по Маше'),null);
 assert.equal(await app.turn(f.s,'фидбэк Олега по Маше: всё отлично'),null);

 // --- Pipeline -----------------------------------------------------------------------------------------------------
 const pipe=await app.turn(f.s,'покажи воронку найма');
 const pc=pipe.extensionData.hiringCard;
 assert.equal(pc.mode,'pipeline');assert.deepEqual(pc.stages.filter(x=>x.count).map(x=>[x.id,x.count]),[['applied',1],['tech',1]]);
 assert.equal(pipe.text,'Найм: кандидатов 2, в работе 2 — отклик 1, техническое интервью 1.');
 assert.equal((await app.turn(f.s,'кандидаты на бэкенд')).extensionData.hiringCard.candidates.length,1);

 // --- Prep: model questions checked, templates for the rest, doubts quoted -------------------------------------------
 const model=body=>{
  const sys=body.messages[0].content;
  if(/вопроса на каждый навык/.test(sys)){
   const user=JSON.parse(body.messages[1].content);
   assert.ok(!JSON.stringify(user).includes('45 лет'),'protected sentences never reach the model');
   assert.ok(user.doubts.some(d=>/путал уровни изоляции/.test(d)));
   return {message:{content:JSON.stringify({questions:[{skill:'Go',text:'Как вы отлаживали утечку горутин в продакшене?'},{skill:'Rust',text:'Чем владение отличается от заимствования?'},
    {skill:'PostgreSQL',text:'Как бы вы выбрали уровень изоляции для списания баланса?'},{skill:'Go',text:'Сколько вам лет и есть ли дети?'}]})}};
  }
  // Summary: one real quote, one invented, one about age, one for a note that does not exist, one off-criteria.
  const user=JSON.parse(body.messages[1].content);
  assert.ok(!JSON.stringify(user).includes('двое детей'),'protected sentences never reach the model');
  return {message:{content:JSON.stringify({points:[{criterion:'проектирование API',note:'N1',quote:'Уверенно проектирует API, объяснил идемпотентность ретраев'},
   {criterion:'Go',note:'N2',quote:'Go знает лучше всех в команде'},{criterion:'Go',note:'N1',quote:'Ей 45 лет'},{criterion:'Go',note:'N9',quote:'горутины, контексты'},
   {criterion:'PostgreSQL',note:'N1',quote:'В PostgreSQL слабо: путал уровни изоляции'},{criterion:'Kafka',note:'N2',quote:'Не уверена в Kafka — стоит доспросить на финале'}]})}};
 };
 const m=fixture({settings:{model:'qwen3:8b'},model});
 const mAnna=(await add(m,'добавь кандидата Анна Иванова на бэкенд')).id;m.ipc.move(mAnna,'tech');
 await note(m,'запиши заметки интервью с Анной: '+N1);await note(m,'фидбэк Олега по кандидату Анна: '+N2);
 const prep=await app.turn(m.s,'подготовь интервью с Анной');
 const pr=prep.extensionData.hiringCard;
 assert.equal(pr.mode,'prep');assert.equal(pr.by,'model');assert.deepEqual(pr.skills,['Go','PostgreSQL','проектирование API']);
 assert.deepEqual(pr.questions.map(q=>[q.skill,q.text]),[['Go','Как вы отлаживали утечку горутин в продакшене?'],['PostgreSQL','Как бы вы выбрали уровень изоляции для списания баланса?'],
  ['проектирование API','Расскажите о задаче, где вы применяли проектирование API: что было сложным и как вы это решили?'],['проектирование API','Какие ошибки или подводные камни в проектирование API вы встречали и как их находили?']]);
 assert.deepEqual(pr.doubts.map(d=>[d.text,d.interviewer]),[['В PostgreSQL слабо: путал уровни изоляции.','Вы'],['Не уверена в Kafka — стоит доспросить на финале.','Олег Смирнов']]);
 assert.ok(pr.previous[0].text.includes('[личные характеристики скрыты]')&&!pr.previous[0].text.includes('45'),'earlier notes are shown without protected sentences');
 assert.match(prep.text,/^Интервью · Анна Иванова · Бэкенд: навыков 3, вопросов 4, заметок прошлых раундов 2, вернуться к 2\.$/);
 // Without a model: templates; a role without skills is a question.
 const prepRules=(await app.turn(f.s,'подготовь вопросы к собеседованию на геймдизайнер')).extensionData.hiringCard;
 assert.equal(prepRules.by,'rules');assert.equal(prepRules.candidate,null);assert.equal(prepRules.questions.length,4);
 assert.match((await app.turn(f.s,'подготовь вопросы к собеседованию на тестировщика')).text,/не указаны навыки/);

 // --- Summary: verbatim quotes only, no score -------------------------------------------------------------------------
 const sum=await app.turn(m.s,'сводка по кандидату Анна');
 const sc=sum.extensionData.hiringCard;
 assert.equal(sc.mode,'summary');assert.equal(sc.by,'model');
 const quotes=Object.fromEntries(sc.criteria.map(c=>[c.criterion,c.quotes.map(q=>[q.text,q.interviewer])]));
 assert.deepEqual(quotes,{Go:[],PostgreSQL:[['В PostgreSQL слабо: путал уровни изоляции','Вы']],'проектирование API':[['Уверенно проектирует API, объяснил идемпотентность ретраев','Вы']]});
 assert.deepEqual(sc.other.map(o=>o.text),['Не уверена в Kafka — стоит доспросить на финале']);
 assert.equal(sc.rejected,2,'the invented quote and the missing note are dropped');assert.equal(sc.dropped,1);
 for(const c of sc.criteria)for(const q of c.quotes)assert.ok(ev.verbatim(q.text,N1+' '+N2));
 assert.ok(!('score' in sc)&&!JSON.stringify(sc).match(/"(?:score|rank|grade|verdict)"/),'no score, rank or verdict');
 assert.equal(sum.text,'Анна Иванова: заметок 2 от 2 интервьюеров; цитаты есть по 2 из 3 критериев роли. Без оценок и сравнения — только слова интервьюеров. Фраз о личных характеристиках не учтено: 1.');
 // Without a model: sentences that name the criterion's words.
 const rs=(await app.turn(f.s,'сводка по кандидату Анна')).extensionData.hiringCard;
 assert.equal(rs.by,'rules');
 assert.deepEqual(rs.criteria.map(c=>[c.criterion,c.quotes.map(q=>q.text)]),[['Go',['Go знает глубоко: горутины, контексты, профилирование.']],['PostgreSQL',['В PostgreSQL слабо: путал уровни изоляции.']],['проектирование API',['Уверенно проектирует API, объяснил идемпотентность ретраев.']]]);
 assert.equal((await app.turn(f.s,'сводка по кандидату Пётр')).question,true,'no notes yet: a question');
 // Evidence helpers.
 assert.equal(ev.protectedText('Отличный тимлид, хотя ей 52 года'),true);assert.equal(ev.protectedText('Хорошо объясняет архитектуру'),false);
 assert.equal(ev.verbatim('путал  уровни   изоляции','В PostgreSQL слабо: путал уровни изоляции.'),true);assert.equal(ev.verbatim('путал','путал уровни'),false,'too short to be a quote');

 // --- Scheduling ---------------------------------------------------------------------------------------------------
 assert.match((await app.turn(f.s,'когда назначить интервью с Анной')).text,/^Добавьте «Календарь»/);
 const cal=fixture({settings:{extension_calendar:'true',calendarAccount:'google:g1',gmailCredential:JSON.stringify({client:{client_id:'test-client'},accounts:[{id:'g1',email:'lead@studio.example',tokens:{refresh_token:'test-refresh',scope:GOOGLE_SCOPE}}]})}});
 cal.s.mailAccounts={google:{client:id=>{assert.equal(id,'g1');return {access:async()=>'test-access'};}}};
 const cAnna=(await add(cal,'добавь кандидата Анна Иванова на бэкенд, anna@mail.example')).id;cal.ipc.move(cAnna,'tech');
 const fb=[];
 app.deps.fetcher=async(url,options)=>{fb.push({url,body:JSON.parse(options.body||'{}')});assert.equal(url,'https://www.googleapis.com/calendar/v3/freeBusy');assert.equal(options.headers.Authorization,'Bearer test-access');
  return {ok:true,status:200,json:async()=>({calendars:{primary:{busy:[{start:'2026-11-10T10:00:00Z',end:'2026-11-10T18:00:00Z'}]},'oleg@studio.example':{busy:[{start:'2026-11-11T09:00:00Z',end:'2026-11-11T13:00:00Z'}]}}})};};
 const sch=await app.turn(cal.s,'найди время для интервью с Анной и Олегом');
 const scard=sch.extensionData.hiringCard;
 assert.equal(scard.mode,'schedule');assert.deepEqual(fb[0].body.items,[{id:'primary'},{id:'oleg@studio.example'}],'the interviewer\'s free/busy is read too');
 assert.deepEqual(scard.interviewers,[{name:'Олег Смирнов',email:'oleg@studio.example'}]);
 assert.ok(scard.slots.length>0);
 for(const x of scard.slots){assert.ok(!(x.start<'2026-11-10T18:00:00Z'&&x.end>'2026-11-10T10:00:00Z'),'not when the user is busy');assert.ok(!(x.start<'2026-11-11T13:00:00Z'&&x.end>'2026-11-11T09:00:00Z'),'not when Олег is busy');}
 assert.match(scard.invitation,/^Здравствуйте, Анна! Приглашаем вас на этап «Техническое интервью» по позиции «Бэкенд»\. Предлагаем время: \{время\} \(60 минут\)\./);
 assert.match(sch.text,/Приглашение уйдёт только после «Отправить приглашение» и подтверждения в «Календаре»\.$/);
 // «Отправить приглашение»: a request for the calendar's own confirmed flow, with the slot's date and time.
 const inv=cal.ipc.invite(cAnna,{start:scard.slots[0].start,duration:60,interviewers:scard.interviewers});
 const d=new Date(scard.slots[0].start);
 assert.equal(inv.ask,'Поставь встречу «Интервью · Бэкенд · Анна Иванова» с anna@mail.example и oleg@studio.example '+d.getDate()+' ноября в '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+' на 60 минут');
 assert.equal(calendar.intent(inv.ask),'create');
 assert.equal(when.ymd(when.range(inv.ask,new Date(NOW)).from),scard.slots[0].start.slice(0,10));assert.equal(when.time(inv.ask),d.getHours()*60+d.getMinutes());
 assert.deepEqual(cpeople.mentioned(inv.ask),{names:[],emails:['anna@mail.example','oleg@studio.example']},'the calendar sees addresses, no names to ask about');
 assert.throws(()=>cal.ipc.invite(cAnna,{start:'2026-11-01T10:00:00Z'}),/в будущем/);
 const noMail=(await add(cal,'добавь кандидата Пётр Сидоров на бэкенд')).id;
 assert.throws(()=>cal.ipc.invite(noMail,{start:scard.slots[0].start}),/email кандидата/);
 // Calendar added without access: a question, not a failure.
 const noAccess=fixture({settings:{extension_calendar:'true',gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'lead@studio.example',tokens:{scope:'https://www.googleapis.com/auth/gmail.readonly'}}]})}});
 await add(noAccess,'добавь кандидата Анна Иванова на бэкенд');
 const na=await app.turn(noAccess.s,'когда назначить интервью с Анной');assert.equal(na.question,true);assert.match(na.text,/доступ к календарю не выдан/);
 app.deps.fetcher=undefined;

 // --- Stages, removal with undo, wipe, encryption --------------------------------------------------------------------
 assert.throws(()=>f.ipc.move(anna,'nope'),/этапа/);
 assert.equal(f.ipc.move(anna,'final').text,'Анна Иванова: Финальное интервью');
 const rm=f.ipc.remove(anna);assert.equal(f.ipc.status().candidates,1);f.ipc.restore(rm.candidate);assert.equal(f.ipc.status().candidates,2);assert.equal(f.ipc.status().notes,2);
 const file=path.join(f.s.dataRoot,'hiring','hiring.json');assert.equal(fs.statSync(file).mode&0o777,0o600);
 // Two candidates with the same first name: asked, never guessed.
 await add(f,'добавь кандидата Анна Белова на геймдизайнер');
 let q;try{await app.turn(f.s,'подготовь интервью с Анной');}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.deepEqual(q.spec.options,['Анна Иванова · Бэкенд · Финальное интервью','Анна Белова · Геймдизайнер · Отклик']);
 f.ipc.wipe();assert.equal(f.ipc.status().candidates,0);assert.equal(fs.existsSync(path.join(f.s.dataRoot,'hiring')),false);
 app.teardown();app.deps.crypt={encrypt:v=>Buffer.from(Buffer.from(v).toString('base64').split('').reverse().join('')),decrypt:b=>Buffer.from(b.toString().split('').reverse().join(''),'base64').toString()};
 const e=fixture();await add(e,'добавь кандидата Анна Иванова на бэкенд');
 const raw=fs.readFileSync(path.join(e.s.dataRoot,'hiring','hiring.json'),'utf8');assert.ok(raw.startsWith('enc:')&&!raw.includes('Анна'));assert.equal(e.ipc.status().candidates,1);
 app.teardown();app.deps.crypt=null;
 assert.throws(()=>app.setup({...e.s,settings:{...e.s.settings,extension_hiring:'false'}}).ipc.move(anna,'tech'),/не добавлено/);
 console.log('Hiring: routing and near-misses, ranking refused, candidates and notes only by buttons, protected characteristics left out, prep questions checked, verbatim-checked summary without scores, calendar slots and the invitation hand-off, stages, undo, wipe, encryption passed');
})().catch(e=>{console.error(e);process.exit(1);});
