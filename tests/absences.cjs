// «Отсутствия»: routing and near-misses (travel, HR questions, the user's own leave, sprint), not added, empty
// «Команда», the foundation not loaded; «кто в отпуске на этой неделе» with typed and calendar absences and a failing
// source; «когда Маша вернётся» across adjacent absences and the next working day; a typed absence is only a
// confirmation card until «Сохранить» (IPC), then saved once; cancel, stale and foreign-company drafts; ambiguous
// names asked; removal with restore; the dashboard accepts only reads. Fake clock (Monday 9 November 2026), no network.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/absences/feature.cjs');
const offer=require('../src/extensions/absences/offer.cjs');
const people=require('../src/features/people.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const NOW=new Date('2026-11-09T10:00:00Z').getTime();
const TEAM=[{name:'Маша Петрова',aliases:'Маша',role:'Клиент',email:'masha@studio.com'},{name:'Олег Смирнов',aliases:'Олег',role:'Сервер',jiraId:'u-oleg'},{name:'Олег Кузнецов',role:'QA'},{name:'Иван Козлов',aliases:'Ваня',email:'ivan@studio.com'}];

const dirs=[];process.on('exit',()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'petya-absences-'));dirs.push(d);return d;};
function fixture({settings={},sources=[],team=TEAM}={}){
 const topic={id:'t1',title:'Чат',messages:[]};
 const all={extension_absences:'true',teamMembers:JSON.stringify(team),...settings};
 const s={settings:all,companyId:'c1',dataRoot:tmp(),requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 s.people=people.create(s,{now:()=>NOW,sources:()=>sources});
 return {s,topic,ipc:app.setup(s).ipc};
}
const calendar=rows=>({id:'calendar',name:'Календарь',setting:'extension_calendar',source:{ready:()=>true,absences:async()=>rows}});

(async()=>{
 // --- Routing -------------------------------------------------------------------------------------------------------
 const now=new Date(NOW);
 for(const [p,type] of [['кто в отпуске на этой неделе','list'],['Петя, кто сейчас на больничном?','list'],['отпуска команды','list'],['кто когда в отпуске','list'],['график отпусков','list'],['кто из команды отсутствует завтра','list'],
  ['когда Маша вернётся','person'],['когда Олег Смирнов выйдет из отпуска?','person'],['когда у Маши отпуск','person'],['Маша в отпуске?','person'],
  ['Маша в отпуске с 10 по 20','add'],['Ваня взял отгул в пятницу','add'],['Олег Смирнов на больничном до 20-го','add'],['Маша в отпуске в Турции с 10 по 20 ноября','add']])
  assert.equal(app.route(p,TEAM,now)?.type,type,p);
 for(const p of ['отпуск в Турции','куда поехать в отпуск','сколько дней отпуска осталось','как оформить отпуск','я в отпуске с 10 по 20','хочу в отпуск на море','отпускные','кто в отпуске в спринте','что такое отпуск','привет','Маша сделала отчёт'])
  assert.equal(app.route(p,TEAM,now),null,p);
 assert.deepEqual(app.period('кто в отпуске на этой неделе',now),{from:'2026-11-09',to:'2026-11-15',label:'на этой неделе'});
 assert.deepEqual(app.period('на следующей неделе',now),{from:'2026-11-16',to:'2026-11-22',label:'на следующей неделе'});
 assert.equal(app.period('кто в отпуске в декабре',now).to,'2026-12-31');
 assert.equal(app.period('кто болеет сегодня',now).from,'2026-11-09');
 assert.equal(app.back('2026-11-13'),'2026-11-16','after Friday comes Monday');
 assert.equal(app.claims('Маша в отпуске с 10 по 20'),true);assert.equal(app.claims('сколько дней отпуска осталось'),false);
 assert.equal(app.dashboard.accepts('кто в отпуске на этой неделе'),true);assert.equal(app.dashboard.accepts('Маша в отпуске с 10 по 20'),false);

 // --- Not added, empty team, foundation not loaded ------------------------------------------------------------------
 let f=fixture({settings:{extension_absences:'false'}});
 assert.equal(await app.turn(f.s,'кто в отпуске на этой неделе'),null);
 f=fixture({team:[]});
 const empty=await app.turn(f.s,'кто в отпуске на этой неделе');assert.equal(empty.question,true);assert.match(empty.text,/«Команды»/);
 f=fixture();const loading={...f.s,people:null};
 assert.equal((await app.turn(loading,'кто в отпуске на этой неделе')).question,true);
 // A typed note about somebody outside «Команда» is not this app's.
 assert.equal(await app.turn(f.s,'Пётр в отпуске с 10 по 20'),null);

 // --- A typed absence: the card first, nothing saved before «Сохранить» -------------------------------------------------
 f=fixture();
 const r=await app.turn(f.s,'Маша в отпуске с 10 по 20');
 const card=r.extensionData.absenceCard;
 assert.equal(card.mode,'confirm');assert.match(r.text,/Маша Петрова — отпуск с 10 по 20 ноября\? Подтвердите/);
 assert.deepEqual([card.draft.member,card.draft.from,card.draft.to,card.draft.kind],['masha@studio.com','2026-11-10','2026-11-20','vacation']);
 assert.deepEqual([card.from,card.to],['2026-11-09','2026-11-22'],'the strip around the absence, from Monday');
 assert.equal(f.s.people.stored().length,0,'nothing written by the chat turn');
 assert.equal(f.ipc.state(card.draft.id),'pending');
 const saved=f.ipc.confirm(card.draft.id);
 assert.match(saved.text,/^Сохранено: Маша Петрова — отпуск/);assert.equal(f.s.people.stored().length,1);
 assert.equal(f.ipc.state(card.draft.id),'saved');assert.equal(f.ipc.confirm(card.draft.id).text,'Уже сохранено','a second press saves nothing');
 assert.equal(f.s.people.stored().length,1);
 // Cancel; a stale or unknown draft; another company's draft.
 const r2=await app.turn(f.s,'Ваня взял отгул в пятницу');const d2=r2.extensionData.absenceCard.draft;
 assert.equal(d2.kind,'dayoff');f.ipc.cancel(d2.id);assert.equal(f.ipc.state(d2.id),'expired');
 assert.throws(()=>f.ipc.confirm(d2.id),/устарела/);assert.throws(()=>f.ipc.confirm('../../x'),/Некорректная/);
 const r3=await app.turn(f.s,'Ваня взял отгул в пятницу');const d3=r3.extensionData.absenceCard.draft;
 f.s.companyId='c2';assert.throws(()=>f.ipc.confirm(d3.id),/устарела/);f.s.companyId='c1';
 // Two Олегов: asked, never guessed; the answer continues to the card.
 let q;try{await app.turn(f.s,'Олег в отпуске с 16 по 20');}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.deepEqual(q.spec.options,['Олег Смирнов · Сервер','Олег Кузнецов · QA']);
 const picked=await q.resume('Олег Кузнецов · QA');assert.equal(picked.extensionData.absenceCard.draft.member,'Олег Кузнецов');
 f.ipc.confirm(picked.extensionData.absenceCard.draft.id);

 // --- Who is away this week: typed + calendar, a failing source reported apart ---------------------------------------
 f.s.settings.extension_calendar='true';
 const g=fixture({settings:{extension_calendar:'true',extension_hr:'true'},sources:[calendar([{member:'u-oleg',from:'2026-11-12',to:'2026-11-13',kind:'vacation',title:'Отпуск Олег'}]),
  {id:'hr',name:'HR',setting:'extension_hr',source:{ready:()=>true,absences:async()=>{throw Error('HTTP 503');}}}]});
 g.s.people.addAbsence('masha@studio.com',{from:'2026-11-10',to:'2026-11-20'});
 const week=await app.turn(g.s,'кто в отпуске на этой неделе');
 const wc=week.extensionData.absenceCard;
 assert.equal(wc.mode,'list');assert.deepEqual([wc.from,wc.to],['2026-11-09','2026-11-15']);
 assert.deepEqual(wc.rows.map(x=>[x.name,x.source,x.removable]),[['Маша Петрова','chat',true],['Олег Смирнов','calendar',false]]);
 assert.deepEqual(wc.people.map(x=>x.name),['Маша Петрова','Олег Смирнов']);assert.equal(wc.present,2);
 assert.match(week.text,/^Отсутствуют на этой неделе \(с 9 по 15 ноября\): Маша Петрова — отпуск с 10 по 20 ноября; Олег Смирнов — отпуск с 12 по 13 ноября\. HR: HTTP 503/);
 const nobody=await app.turn(fixture().s,'кто болеет завтра');
 assert.match(nobody.text,/^Отсутствий завтра не отмечено \(календарь не подключён/);assert.equal(nobody.extensionData.absenceCard.rows.length,0);

 // --- When does Маша come back: adjacent absences are one stretch -------------------------------------------------------
 const h=fixture();
 h.s.people.addAbsence('masha@studio.com',{from:'2026-11-05',to:'2026-11-13',kind:'vacation'});
 h.s.people.addAbsence('masha@studio.com',{from:'2026-11-16',to:'2026-11-16',kind:'dayoff'});
 const back=await app.turn(h.s,'когда Маша вернётся?');
 assert.match(back.text,/^Маша Петрова сейчас отсутствует \(отпуск\) до 16 ноября включительно — вернётся вторник, 17 ноября\./);
 assert.equal(back.extensionData.absenceCard.mode,'person');assert.equal(back.extensionData.absenceCard.focus,'masha@studio.com');
 const ivan=await app.turn(h.s,'когда Ваня вернётся');assert.match(ivan.text,/Иван Козлов на работе: отсутствий на ближайшие 4 месяца не отмечено/);
 h.s.people.addAbsence('ivan@studio.com',{from:'2026-12-01',to:'2026-12-05',kind:'vacation'});
 assert.match((await app.turn(h.s,'когда у Вани отпуск')).text,/Иван Козлов сейчас на работе\. Ближайшее отсутствие — отпуск с 1 по 5 декабря\./);
 const who=await app.turn(h.s,'когда Пётр вернётся');assert.equal(who.question,true);assert.match(who.text,/Не нашёл «Пётр»/);

 // --- Removal from the card with «Отменить» ---------------------------------------------------------------------------
 const row=h.s.people.stored().find(x=>x.member==='ivan@studio.com');
 const rm=h.ipc.remove('ivan@studio.com',row.id);assert.match(rm.text,/Отметка удалена: Иван Козлов/);
 assert.throws(()=>h.ipc.remove('ivan@studio.com',row.id),/уже удалена/);
 h.ipc.restore('ivan@studio.com',rm.row);assert.ok(h.s.people.stored().some(x=>x.id===row.id));
 h.s.settings.extension_absences='false';assert.throws(()=>h.ipc.remove('ivan@studio.com',row.id),/не добавлено/);

 // --- Offer ----------------------------------------------------------------------------------------------------------
 assert.equal(offer.ready({extension_absences:'true'}),true);assert.equal(offer.ready({}),false);
 console.log('Absences: routing and near-misses, not added, empty team, list with sources, return date, confirmation card before saving, drafts, ambiguous names, removal with undo passed');
})().catch(e=>{console.error(e);process.exit(1);});
