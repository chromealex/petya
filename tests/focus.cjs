// «Фокус»: the persistent timer (pause, extend, stop, breaks, pomodoro series, restart), day and week report,
// routing with near-misses, holding back non-urgent system notifications, the calendar warning and a length that
// fits before the next meeting (stubbed Google Calendar), notification-center items and card data.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FocusStore,MIN}=require('../src/extensions/focus/store.cjs');
const parse=require('../src/extensions/focus/parse.cjs');
const hold=require('../src/extensions/focus/hold.cjs');
const app=require('../src/extensions/focus/feature.cjs');
const offer=require('../src/extensions/focus/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const {SCOPES}=require('../src/extensions/calendar/client.cjs');

const T=new Date(2026,10,9,10,0).getTime();// Monday 9 Nov 2026, 10:00
const json=(v,status=200)=>({ok:status<300,status,json:async()=>v});
(async()=>{
 // --- Store: pause, extend, finish, report ---
 let clock=T;const now=()=>clock;
 const st=new FocusStore({now});
 st.start({minutes:50,label:'над картой уровня'});
 clock+=10*MIN;st.pause();clock+=5*MIN;
 assert.equal(st.remaining(),40*MIN,'a pause stops the clock');
 st.resume();assert.equal(st.endsAt(),T+55*MIN);
 st.extend(10);assert.equal(st.endsAt(),T+65*MIN);
 assert.deepEqual(st.tick(T+64*MIN),[],'not yet');
 clock=T+66*MIN;
 const done=st.tick();assert.equal(done[0].session.outcome,'done');assert.equal(done[0].session.focused,60*MIN);assert.equal(done[0].session.end,T+65*MIN,'closed at the planned end');
 st.start({minutes:30,label:'BW-123 баг',jira:'BW-123'});clock+=12*MIN;
 const stopped=st.stop();assert.equal(stopped.session.outcome,'stopped','stopped early is an interruption');
 st.start({minutes:30});clock+=29.5*MIN;assert.equal(st.stop().session.outcome,'done','stopped in the last minute is not an interruption');
 let r=st.report();
 assert.deepEqual([r.count,r.minutes,r.interruptions],[3,102,1]);
 assert.deepEqual(r.tasks.map(t=>[t.label,t.jira,t.minutes]),[['над картой уровня','',60],['','',30],['BW-123 баг','BW-123',12]]);
 assert.equal(r.week.length,7);assert.equal(r.week[0].date,'2026-11-09');assert.equal(r.week[0].minutes,102);assert.equal(r.week[0].interruptions,1);
 // A break in the middle of focus ends the focus (early → interruption).
 st.start({minutes:25});clock+=5*MIN;const br=st.takeBreak(5);
 assert.equal(br[0].session.outcome,'stopped');assert.equal(st.active.kind,'break');
 clock+=6*MIN;assert.equal(st.tick()[0].session.kind,'break');assert.equal(st.active,null);

 // --- Pomodoro series: focus → break → focus → done ---
 clock=T;const ps=new FocusStore({now});
 ps.start({minutes:25,series:{total:2,done:0,focus:25,short:5,long:15,label:'диздок',jira:''}});
 clock=T+25*MIN;let ev=ps.tick();
 assert.deepEqual(ev.map(e=>e.type),['finished','started']);assert.equal(ps.active.kind,'break');assert.equal(ps.active.planned,5*MIN);
 clock=T+30*MIN;ev=ps.tick();assert.equal(ps.active.kind,'focus');assert.equal(ps.active.label,'диздок');assert.equal(ps.view().series.round,2);
 clock=T+55*MIN;ev=ps.tick();assert.deepEqual(ev.map(e=>e.type),['finished','series-done']);assert.equal(ps.active,null);

 // --- Persistence: survives a restart; an expired session is closed at its end, a series is not replayed ---
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-focus-'));const file=path.join(dir,'focus.json');
 clock=T;const a=new FocusStore({file,now});a.start({minutes:50,label:'карта'});
 const b=new FocusStore({file,now});assert.equal(b.active.label,'карта','state is read back');
 clock=T+20*MIN;assert.equal(b.remaining(),30*MIN);
 a.start({minutes:25,series:{total:4,done:0,focus:25,short:5,long:15}});
 clock=T+3*60*MIN;const c=new FocusStore({file,now});const late=c.tick();
 assert.equal(late[0].session.end,T+20*MIN+25*MIN,'closed at its planned end');assert.equal(c.active,null,'rounds slept through are not started');assert.equal(c.series,null);
 assert.ok(c.history.some(h=>h.outcome==='switched'),'the replaced session is kept');

 // --- Routing ---
 const yes={'фокус на 50 минут над картой уровня':['start',50,'над картой уровня'],'помодоро 4 раза':['pomodoro',25,''],'перерыв':['break',5],'перерыв 5':['break',5],'сделай перерыв на 10 минут':['break',10],
  'сколько я сегодня сфокусировался':['report'],'сколько я фокусировался на этой неделе':['report'],'помоги сосредоточиться':['help'],'запусти фокус':['start',25,''],'фокус на час по BW-123':['start',60,''],
  'помодоро по 50 минут 3 раза над рефакторингом':['pomodoro',50,'над рефакторингом'],'фокус полчаса':['start',30,'']};
 for(const [t,[action,minutes,label]] of Object.entries(yes)){const w=parse.intent(t);assert.equal(w?.action,action,t);if(minutes!==undefined)assert.equal(w.minutes,minutes,t);if(label!==undefined)assert.equal(w.label,label,t);}
 assert.equal(parse.intent('фокус на час по BW-123').jira,'BW-123');assert.equal(parse.intent('помодоро 4 раза').count,4);
 assert.equal(parse.intent('сколько я фокусировался на этой неделе').period,'week');
 const near=['фокус камеры в Unity','фокус на задаче','давай сфокусируемся на багах','давай сфокусируемся на багах на 2 часа','фокус-группа в пятницу','как сделать фокус на поле ввода','у нас перерыв в работе сервера','стоп','пауза','ещё 10 минут','сколько осталось','автофокус объектива','фокус спринта — стабильность'];
 for(const t of near)assert.equal(parse.intent(t),null,t);
 const during={'пауза':'pause','продолжи':'resume','стоп':'stop','ещё 10 минут':'extend','сколько осталось':'status','останови фокус':'stop'};
 for(const [t,action] of Object.entries(during))assert.equal(parse.intent(t,{active:true})?.action,action,t);

 // --- Holding notifications: non-urgent wait during focus, urgent and own ones pass ---
 const shown=[];
 class FakeNotification{constructor(o){Object.assign(this,o);}show(){shown.push(this.body);}static isSupported(){return true;}}
 let holding=false;const held=[];
 assert.equal(hold.install({Notification:FakeNotification},n=>{if(!holding||hold.urgent(n))return false;held.push(n.body);return true;}),true);
 new FakeNotification({title:'Петя',body:'Ответ готов.'}).show();
 holding=true;
 new FakeNotification({title:'Петя',body:'Создана задача BW-12'}).show();
 new FakeNotification({title:'Петя',body:'BW-12: нужно ваше решение. Результат — в разделе «Агенты».'}).show();
 new FakeNotification({title:'Петя',body:'Не удалось проверить поручение'}).show();
 const own=new FakeNotification({title:'Петя · Фокус',body:'Фокус завершён'});own.petyaFocus=true;own.show();
 assert.deepEqual(shown,['Ответ готов.','BW-12: нужно ваше решение. Результат — в разделе «Агенты».','Не удалось проверить поручение','Фокус завершён']);
 assert.deepEqual(held,['Создана задача BW-12']);
 assert.equal(hold.install({Notification:FakeNotification},()=>false),true,'installed once, gate replaced');
 new FakeNotification({title:'Петя',body:'Создана задача BW-13'}).show();assert.equal(shown.at(-1),'Создана задача BW-13');

 // --- Chat turns ---
 const topic={id:'t',title:'Чат',messages:[]};
 const sent=[];
 const s={settings:{model:''},requestProgress:{report(){}},smoke:true,
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(channel,item)=>sent.push({channel,item})}},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 clock=T;const e=app.engine(s,{now});
 assert.equal(await app.turn(s,'фокус на 50 минут над картой уровня'),null,'not added: the offer handles it');
 assert.equal(offer.ready(s.settings),false);
 s.settings.extension_focus='true';assert.equal(offer.ready(s.settings),true);
 for(const t of near)assert.equal(await app.turn(s,t),null,t);
 // No calendar: starts at once.
 const started=await app.turn(s,'фокус на 50 минут над картой уровня');
 assert.equal(started.text,'Фокус 50 мин над картой уровня — до 10:50. Не срочные уведомления придержу до конца.');
 const cardData=started.extensionData.focusCard;
 assert.equal(cardData.mode,'session');assert.equal(cardData.active.label,'над картой уровня');assert.equal(cardData.active.remaining,50*MIN);assert.equal(cardData.report.week.length,7);
 assert.equal(topic.messages.at(-1).by,'Фокус');
 assert.equal(sent.at(-1).channel,'extension-install-progress');assert.equal(sent.at(-1).item.id,'focus-session');assert.equal(sent.at(-1).item.busy,true);
 assert.match(sent.at(-1).item.text,/^Осталось 50 мин · до 10:50/);
 // During the session: bare commands are ours, a non-urgent notification is held.
 assert.equal(e.gate({title:'Петя',body:'Ответ готов.'}),true);assert.equal(e.gate({title:'Петя',body:'Нужно уточнить проект для Codex'}),false);
 clock+=10*MIN;
 assert.match((await app.turn(s,'пауза')).text,/^Пауза\. Осталось 40 мин/);
 assert.equal(sent.at(-1).item.text.startsWith('На паузе'),true);
 clock+=5*MIN;assert.equal((await app.turn(s,'продолжи')).text,'Продолжаем: осталось 40 мин, до 10:55.');
 assert.equal((await app.turn(s,'ещё 10 минут')).text,'Добавил 10 мин: теперь до 11:05.');
 assert.equal((await app.turn(s,'сколько осталось')).text,'Фокус: осталось 50 мин, до 11:05.');
 // Finishing: the held notification comes as one summary, the center card says what was done.
 clock=T+65*MIN;e.tick();
 const held1=sent.find(x=>x.item.id==='focus-held');assert.ok(held1,'held summary published');assert.match(held1.item.text,/^1 уведомление: Ответ готов\./);
 assert.equal(e.store.held.length,0);
 const fin=sent.filter(x=>x.item.id==='focus-session').at(-1).item;assert.equal(fin.busy,false);assert.equal(fin.title,'Фокус завершён');assert.equal(fin.ended,'focus');
 assert.ok(e.sent.some(n=>n.title==='Фокус завершён'),'own system notification');
 assert.equal(await app.turn(s,'стоп'),null,'no session: bare «стоп» is not ours');
 assert.match((await app.turn(s,'останови фокус')).text,/Сейчас фокус не идёт/);
 // Break and report.
 const brk=await app.turn(s,'перерыв 5');assert.equal(brk.text,'Перерыв 5 мин — до 11:10.');
 assert.equal((await app.turn(s,'стоп')).text,'Перерыв закончен.');
 const rep=await app.turn(s,'сколько я сегодня сфокусировался');
 assert.equal(rep.text,'Сегодня: 1 сессия фокуса, 1 ч, без прерываний. Задачи: над картой уровня — 1 ч.');
 assert.equal(rep.extensionData.focusCard.mode,'report');
 assert.match((await app.turn(s,'сколько я фокусировался на этой неделе')).text,/^За неделю: 1 ч фокуса, 1 сессия; больше всего — пн/);
 // An early stop is an interruption in the report.
 await app.turn(s,'фокус на 30 минут по BW-7');clock+=10*MIN;
 assert.equal((await app.turn(s,'стоп')).text,'Остановил фокус на 10 мин из 30 мин. Сегодня всего 1 ч 10 мин.');
 assert.match((await app.turn(s,'сколько я сегодня сфокусировался')).text,/прервано 1\. Задачи: над картой уровня — 1 ч; BW-7 — 10 мин\./);
 // Help to concentrate: one question with choices, then the session.
 const help=await app.turn(s,'помоги сосредоточиться').catch(x=>x);
 assert.ok(help instanceof InputRequired);assert.deepEqual(help.spec.options,['25 минут','50 минут','Помодоро 4 раза','Не сейчас']);
 const pom=await help.resume('Помодоро 4 раза');assert.match(pom.text,/^Помодоро: 4 × 25 мин с перерывами по 5 минут, всего около 1 ч 55 мин/);
 assert.equal(pom.extensionData.focusCard.active.series.total,4);
 assert.equal((await app.turn(s,'стоп')).text.startsWith('Остановил фокус'),true);
 // ipc from the card and the notification center.
 let st2=e.ipc.start({minutes:25,label:'x'});assert.equal(st2.active.planned,25*MIN);
 st2=e.ipc.pause();assert.equal(st2.active.state,'paused');st2=e.ipc.resume();st2=e.ipc.extend(10);assert.equal(st2.active.planned,35*MIN);
 st2=e.ipc.breakNow(5);assert.equal(st2.active.kind,'break');st2=e.ipc.stop();assert.equal(st2.active,null);
 assert.throws(()=>e.ipc.extend(10),/не идёт/);
 await calendarPart();
})().catch(err=>{console.error(err);process.exit(1);});

// --- With the calendar app: a length that fits before the next meeting, the warning 5 minutes before ---
async function calendarPart(){
 const topic={id:'t',title:'Чат',messages:[]};
 let clock=T;const now=()=>clock;
 const GOOGLE_SCOPE='https://www.googleapis.com/auth/gmail.readonly '+SCOPES.google.join(' ');
 const calls=[];let failing=false;
 const fetcher=async(url)=>{calls.push(url);if(failing)throw Error('сеть недоступна');assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?'),url);
  return json({items:[{id:'1',summary:'Daily',start:{dateTime:new Date(T+40*MIN).toISOString()},end:{dateTime:new Date(T+55*MIN).toISOString()}},{id:'2',summary:'Обед',transparency:'transparent',start:{dateTime:new Date(T+120*MIN).toISOString()},end:{dateTime:new Date(T+180*MIN).toISOString()}}]});};
 const manager={client:()=>({access:async()=>'tok'})};
 const s={settings:{extension_focus:'true',extension_calendar:'true',gmailCredential:JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope:GOOGLE_SCOPE}}]}),jiraUrl:'https://corp.atlassian.net'},
  requestProgress:{report(){}},smoke:true,mailAccounts:{google:manager},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const e=app.engine(s,{now});
 const asked=await app.turn(s,'фокус на 50 минут над картой уровня',{fetcher}).catch(x=>x);
 assert.ok(asked instanceof InputRequired,'a session that runs into a meeting asks for a length');
 assert.match(asked.spec.text,/^Встреча «Daily» в 10:40, до неё 40 мин\. Поставить фокус на 35 минут/);
 assert.deepEqual(asked.spec.options,['35 минут','50 минут']);
 assert.equal(e.store.active,null,'nothing started before the answer');
 const fit=await asked.resume('35 минут');
 assert.equal(fit.text,'Фокус 35 мин над картой уровня — до 10:35. Не срочные уведомления придержу до конца. Следующая встреча — «Daily» в 10:40.');
 assert.deepEqual(fit.extensionData.focusCard.meetings.map(m=>m.title),['Daily'],'free time (transparent) is not a meeting');
 assert.equal(fit.extensionData.focusCard.jiraUrl,'https://corp.atlassian.net');
 // Keeping the asked length: the warning comes 5 minutes before the meeting, once.
 e.store.stop();clock=T;
 const keep=await (await app.turn(s,'фокус на 50 минут',{fetcher}).catch(x=>x)).resume('50 минут');
 assert.equal(keep.text,'Фокус 50 мин — до 10:50. Не срочные уведомления придержу до конца. Встреча «Daily» в 10:40 — предупрежу за 5 минут.');
 clock=T+34*MIN;e.tick();
 assert.equal(e.sent.filter(n=>n.title==='Встреча скоро').length,0,'6 minutes before is too early');
 clock=T+35.5*MIN;e.tick();
 assert.ok(e.sent.some(n=>n.title==='Встреча скоро'&&/^Через 5 мин встреча «Daily» \(10:40\)\.$/.test(n.body)),'warned 5 minutes before');
 e.tick();assert.equal(e.sent.filter(n=>n.title==='Встреча скоро').length,1,'once');
 // A meeting too close: start anyway or not now.
 e.store.stop();clock=T+36*MIN;
 const close=await app.turn(s,'фокус на 25 минут',{fetcher}).catch(x=>x);
 assert.deepEqual(close.spec.options,['Начать на 25 минут','Не сейчас']);
 assert.match((await close.resume('Не сейчас')).text,/не начинаю/);assert.equal(e.store.active,null);
 // Calendar unreachable: focus still starts, without meetings.
 failing=true;clock=T;
 const offline=await app.turn(s,'фокус на 50 минут',{fetcher});
 assert.equal(offline.text,'Фокус 50 мин — до 10:50. Не срочные уведомления придержу до конца.');
 // Calendar not added: no request at all.
 e.store.stop();calls.length=0;s.settings.extension_calendar='false';
 assert.equal((await app.turn(s,'фокус на 50 минут',{fetcher})).extensionData.focusCard.active.planned,50*MIN);assert.equal(calls.length,0);
 // Report text helpers.
 assert.equal(app.dur(125),'2 ч 5 мин');assert.equal(app.dur(60),'1 ч');assert.equal(app.dur(7),'7 мин');
 console.log('Focus: timer with pause/extend/stop/breaks, pomodoro series, restart, day and week report, routing with near-misses, held notifications, meeting fit and warning, center items passed');
}
