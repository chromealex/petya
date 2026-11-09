// «Учёт времени» on the real activity foundation with a fake clock and sampler: routing and near-misses, not added,
// consent when the tracker is off, the day / week / app / tasks / projects cards, categories and the user's mapping,
// classifiers (Jira keys, projects), focus overlay, CSV export, the Jira worklog preview → confirmed write (once,
// errors per row), the journal source, pause / off / wipe by voice, and periods.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const activityFeature=require('../src/features/activity.cjs');
const app=require('../src/extensions/time-tracking/feature.cjs');
const period=require('../src/extensions/time-tracking/period.cjs');
const categories=require('../src/extensions/time-tracking/categories.cjs');
const journal=require('../src/extensions/time-tracking/journal-source.cjs');
const offer=require('../src/extensions/time-tracking/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-time-'));
 let t=new Date(2026,10,9,9,0,0).getTime();// Monday 9 Nov 2026
 const RealDate=Date;const realNow=Date.now;Date.now=()=>t;
 const settings={...activityFeature.defaults,...app.defaults,jiraUrl:'https://studio.atlassian.net',jiraEmail:'me@studio.dev',jiraToken:'x'.repeat(20),jiraProjects:'BW'};
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings,dataRoot:root,saveSettings(v){app.validate(v);activityFeature.validate(v);Object.assign(settings,v);},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},requestProgress:{report(){}}};
 let window=null;
 const classifiers=[require('../src/extensions/time-tracking/classifier-jira.cjs'),require('../src/extensions/time-tracking/classifier-project.cjs')].map(c=>({...c,classify:w=>c.classify(w,settings)}));
 s.activity=activityFeature.create(s,{now:()=>t,sample:async()=>window,idleSeconds:()=>0,classifiers:()=>classifiers});
 s.activity.supported=true;
 const work=async(w,minutes)=>{window=w;for(let i=0;i<minutes*4;i++){await s.activity.tick();t+=15000;}};
 const run=async text=>{try{return await app.turn(s,text);}catch(e){if(e instanceof InputRequired)return {question:e.spec,resume:e.resume};throw e;}};

 // Not added: nothing here.
 assert.equal(await app.turn(s,'на что ушёл день'),null);
 settings['extension_time-tracking']='true';
 // Near-misses stay with others even when added.
 for(const p of ['который час','сколько времени','сколько времени займёт сборка','сколько я сегодня сфокусировался','что я сегодня сделал','время встречи с Олегом','учёт расходов за месяц','время в Токио','запиши встречу','поставь встречу на завтра'])
  assert.equal(await app.turn(s,p),null,'near-miss: '+p);

 // Tracker off: the consent question says what is collected; «Не сейчас» keeps it off.
 let q=await run('на что ушёл день');
 assert.ok(q.question,'asks for consent');assert.match(q.question.text,/только на этом компьютере/);assert.deepEqual(q.question.options,['Включить учёт','Не сейчас']);
 let r=await q.resume('Не сейчас');assert.match(r.text,/остаётся выключенным/);assert.equal(settings.activityTracking,'false');
 q=await run('на что ушёл день');r=await q.resume('Включить учёт');
 assert.equal(settings.activityTracking,'true','enabled only by the answer');
 assert.match(r.text,/активности не учтено/);

 // A working day: Unity on a project, Jira task in the browser, Slack, a Zoom call, YouTube.
 await work({app:'Unity',title:'Bunker - Main - Windows, Mac, Linux - Unity 6000.0.3f1 <DX11>'},90);
 await work({app:'Google Chrome',title:'[BW-123] Магазин падает при покупке - Jira - Google Chrome'},40);
 await work({app:'Slack',title:'#jw-bw-dev | Studio - Slack'},20);
 await work({app:'Zoom',title:'Zoom Meeting'},30);
 await work({app:'Visual Studio Code',title:'Shop.cs — Bunker — Visual Studio Code'},45);
 await work({app:'Google Chrome',title:'Смешные коты - YouTube - Google Chrome'},15);
 await work({app:'Rider',title:'Bunker – BW-77 PlayerController.cs'},20);
 // Focus overlay from «Фокус»'s own file.
 settings.extension_focus='true';
 fs.writeFileSync(path.join(root,'focus.json'),JSON.stringify({version:1,history:[{kind:'focus',label:'магазин',jira:'BW-123',start:new Date(2026,10,9,9,0).getTime(),end:new Date(2026,10,9,9,50).getTime()},{kind:'break',start:new Date(2026,10,9,9,50).getTime(),end:new Date(2026,10,9,9,55).getTime()}]}));

 r=await app.turn(s,'на что ушёл день');
 let c=r.extensionData.timeCard;
 assert.equal(c.mode,'app');assert.equal(c.period.kind,'day');
 const by=Object.fromEntries(c.categories.map(x=>[x.id,Math.round(x.ms/60000)]));
 assert.deepEqual(by,{work:195,meetings:30,communication:20,other:15},JSON.stringify(by));
 assert.equal(Math.round(c.total/60000),260);
 assert.equal(c.rows[0].key,'Unity');assert.equal(c.rows[0].category,'work');
 assert.ok(c.timeline.length>=4&&c.timeline.every(b=>categories.IDS.includes(b.category)));
 assert.equal(c.focus.length,1,'focus sessions only, not breaks');assert.equal(c.focus[0].label,'BW-123 магазин');
 assert.equal(c.calendar,false,'no calendar added');assert.equal(c.jira,true);
 assert.match(r.text,/^Сегодня учтено 4 ч 20 мин: работа 3 ч 15 мин, встречи 30 мин, общение 20 мин, другое 15 мин\. Больше всего — Unity \(1 ч 30 мин\)\./);

 // The user's mapping wins: Slack counted as work from now on.
 const ipc=app.setup(s,{dialog:{showSaveDialog:async(_,o)=>({filePath:path.join(root,o.defaultPath)})}}).ipc;
 ipc.setCategory('Slack','work');
 c=(await app.turn(s,'на что ушёл день')).extensionData.timeCard;
 assert.equal(Math.round(c.categories.find(x=>x.id==='communication').ms/60000),0);
 // Activity during a calendar meeting counts as meetings, whatever app was in front.
 const overlay=require('../src/extensions/time-tracking/overlay.cjs');const realMeetings=overlay.meetings;
 overlay.meetings=async()=>[{title:'Синк',start:new Date(2026,10,9,9,30).getTime(),end:new Date(2026,10,9,10,0).getTime()}];
 c=(await app.turn(s,'на что ушёл день')).extensionData.timeCard;
 assert.equal(Math.round(c.categories.find(x=>x.id==='meetings').ms/60000),60,'30 min of Unity inside the meeting');
 assert.equal(Math.round(c.total/60000),260,'the total does not change');assert.equal(c.calendar,true);assert.equal(c.meetings.length,1);
 overlay.meetings=realMeetings;
 ipc.setCategory('Slack','auto');assert.equal(settings.timeTrackingCategories,'{}');
 assert.throws(()=>ipc.setCategory('Slack','sleep'),/категории/);

 // An app over the week, with Russian names; tasks and projects from window titles.
 r=await app.turn(s,'сколько я сидел в Unity на этой неделе');c=r.extensionData.timeCard;
 assert.equal(c.period.kind,'week');assert.equal(Math.round(c.total/60000),90);assert.equal(c.days.length,1);
 assert.match(r.text,/^За эту неделю в «Unity» — 1 ч 30 мин\./);
 r=await app.turn(s,'сколько времени я провёл в слаке сегодня');assert.equal(Math.round(r.extensionData.timeCard.total/60000),20);
 r=await app.turn(s,'сколько я сидел в браузере сегодня');assert.equal(Math.round(r.extensionData.timeCard.total/60000),55);
 r=await app.turn(s,'сколько часов ушло на BW-123');assert.equal(Math.round(r.extensionData.timeCard.total/60000),40);
 r=await app.turn(s,'время по задачам');c=r.extensionData.timeCard;
 assert.deepEqual(c.rows.map(x=>[x.key,Math.round(x.ms/60000)]),[['BW-123',40],['BW-77',20]]);
 assert.equal(c.rows[0].url,'https://studio.atlassian.net/browse/BW-123');
 assert.match(r.text,/По задачам: BW-123 — 40 мин, BW-77 — 20 мин/);
 r=await app.turn(s,'время по проектам');c=r.extensionData.timeCard;
 assert.deepEqual(c.rows.map(x=>[x.key,Math.round(x.ms/60000)]),[['Bunker',155]]);

 // CSV: one row per span, quoted titles, BOM for Excel.
 const saved=await ipc.exportCsv(c.period.from,c.period.to,'сегодня');
 const text=fs.readFileSync(saved.path,'utf8');
 assert.ok(text.startsWith('\uFEFFstart,end,minutes,app,title,project,task,category'));
 assert.ok(text.includes('BW-123')&&text.includes(',work\r\n'));assert.equal(saved.rows,text.trim().split('\r\n').length-1);
 await assert.rejects(ipc.exportCsv(c.period.to,c.period.from),/период/);
 // «Выгрузить в Google Таблицы» (spreadsheet-export): the same rows as a table, minutes as numbers, category names.
 const sheet=ipc.exportTable(c.period.from,c.period.to);
 assert.deepEqual(sheet.header,['Начало','Конец','Минуты','Приложение','Окно','Проект','Задача','Категория']);
 assert.equal(sheet.rows.length,saved.rows,'one row per span, like the CSV');
 assert.ok(sheet.rows.every(r=>typeof r[2]==='number'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r[0])));
 assert.ok(sheet.rows.some(r=>r[6]==='BW-123'&&r[7]==='Работа'));
 assert.match(sheet.title,/^Учёт времени · \d{4}-\d\d-\d\d$/);assert.equal(sheet.app,'Учёт времени');
 assert.throws(()=>ipc.exportTable(c.period.to,c.period.from),/период/);
 // Through the real registry: the provider accepts the table as it is.
 assert.equal(require('../src/extensions/google-sheets/exports.cjs').clean(sheet).rows.length,sheet.rows.length);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'..','src','extensions','time-tracking','extension.json'),'utf8')).uses,['spreadsheet-export']);
 r=await app.turn(s,'выгрузи время в CSV');assert.equal(r.extensionData.timeCard.exportReady,true);assert.match(r.text,/Скачать CSV/);

 // Worklog: a preview first (nothing written), then only the ticked rows, once; a Jira error is shown per row.
 const posts=[];
 s.workspace={settings:()=>settings,async api(route,options){posts.push({route,body:JSON.parse(options.body)});if(route.includes('BW-77'))throw Error('Jira: задача не найдена');return {id:'1'};}};
 r=await app.turn(s,'запиши время в Jira');assert.equal(r.extensionData.timeCard.worklog,true);assert.match(r.text,/без подтверждения ничего не записывается/);
 assert.equal(posts.length,0,'the chat turn writes nothing');
 const p=ipc.worklogPreview(r.extensionData.timeCard.period.from,r.extensionData.timeCard.period.to);
 assert.deepEqual(p.rows.map(x=>[x.key,x.seconds]),[['BW-123',2400],['BW-77',1200]]);
 assert.match(p.rows[0].started,/^2026-11-09T10:30:00\.000[+-]\d{4}$/);
 assert.equal(posts.length,0,'a preview writes nothing');
 const res=await ipc.worklogWrite(p.id,p.rows.map(x=>x.id));
 assert.deepEqual(res.map(x=>[x.key,x.ok]),[['BW-123',true],['BW-77',false]]);assert.match(res[1].error,/не найдена/);
 assert.equal(posts[0].route,'/rest/api/3/issue/BW-123/worklog?adjustEstimate=auto');assert.equal(posts[0].body.timeSpentSeconds,2400);assert.equal(posts[0].body.comment.type,'doc');
 await assert.rejects(ipc.worklogWrite(p.id,[p.rows[0].id]),/устарел/,'a preview is written once');
 const again=ipc.worklogPreview(p.rows.length&&r.extensionData.timeCard.period.from,r.extensionData.timeCard.period.to);
 assert.equal(again.rows.find(x=>x.key==='BW-123').done,true,'already written rows are marked');
 await assert.rejects(ipc.worklogWrite(again.id,[again.rows.find(x=>x.key==='BW-123').id]),/Не выбрано/,'a written row is not written again');
 {const stale=ipc.worklogPreview(c.period.from,c.period.to);settings.jiraUrl='https://other.atlassian.net';await assert.rejects(ipc.worklogWrite(stale.id,['x']),/изменилось/);}settings.jiraUrl='https://studio.atlassian.net';
 // Without Jira the card has no worklog button and the text says where to connect.
 const token=settings.jiraToken;settings.jiraToken='';
 r=await app.turn(s,'запиши время в Jira');assert.equal(r.extensionData.timeCard.jira,false);assert.match(r.text,/подключите Jira/);
 assert.throws(()=>ipc.worklogPreview(c.period.from,c.period.to),/Подключите Jira/);settings.jiraToken=token;

 // Journal source: time by project or app with minutes; nothing while the tracker is off.
 assert.equal(journal.ready(settings),true);
 const j=await journal.collect(s,{from:period.startOfDay(t),to:t});
 assert.deepEqual(j.items.map(i=>[i.title,i.minutes,i.kind]).slice(0,2),[['Bunker — 2 ч 35 мин',155,'activity'],['Google Chrome — 55 мин',55,'activity']]);

 // Voice controls: pause with a duration, off, wipe after a confirmation.
 r=await app.turn(s,'поставь учёт времени на паузу на 30 минут');assert.match(r.text,/на паузе на 30 мин/);assert.ok(s.activity.status().paused);
 r=await app.turn(s,'на что ушёл день');assert.match(r.text,/на паузе/);
 r=await app.turn(s,'возобнови учёт времени');assert.match(r.text,/продолжается/);assert.equal(s.activity.status().paused,false);
 q=await run('удали историю активности');assert.deepEqual(q.question.options,['Удалить историю','Отмена']);
 r=await q.resume('Отмена');assert.match(r.text,/осталась/);assert.ok(s.activity.spans({from:0,to:t}).length);
 q=await run('удали историю активности');r=await q.resume('Удалить историю');assert.match(r.text,/удалена/);assert.equal(s.activity.spans({from:0,to:t}).length,0);
 r=await app.turn(s,'выключи учёт времени');assert.equal(settings.activityTracking,'false');
 assert.deepEqual((await journal.collect(s,{from:0,to:t})).items,[]);
 s.activity.supported=false;r=await app.turn(s,'на что ушёл день');assert.match(r.text,/не может узнать активное окно/);s.activity.supported=true;

 // Periods.
 const now=new Date(2026,10,11,15,0).getTime();// Wednesday
 const d=v=>new Date(v).toLocaleDateString('ru-RU');
 assert.equal(d(period.parse('вчера',now).from),'10.11.2026');
 assert.deepEqual([period.parse('на этой неделе',now).kind,d(period.parse('на этой неделе',now).from),d(period.parse('на этой неделе',now).to)],['week','09.11.2026','12.11.2026']);
 assert.equal(d(period.parse('на прошлой неделе',now).from),'02.11.2026');
 assert.equal(d(period.parse('в понедельник',now).from),'09.11.2026');
 assert.equal(d(period.parse('в пятницу',now).from),'06.11.2026','a weekday ahead means last week');
 assert.equal(period.parse('за последние 3 дня',now).label,'последние 3 дн.');
 assert.equal(d(period.parse('за месяц',now).from),'01.11.2026');
 assert.equal(period.parse('на что ушёл день',now).label,'сегодня');

 // Categories: browsers by page, user mapping validation.
 assert.equal(categories.of({app:'Google Chrome',title:'Inbox - Gmail'},{}),'communication');
 assert.equal(categories.of({app:'Firefox',title:'Созвон по релизу'},{}),'meetings','a call by its title, no meeting app named');
 assert.equal(categories.of({app:'Telegram',title:''},{telegram:'work'}),'work');
 const v={timeTrackingCategories:'{"slack":"work","x":"nap"}'};categories.validate(v);assert.equal(v.timeTrackingCategories,'{"slack":"work"}');

 // Offer: own phrases offer it, neighbours do not; ready = added, connected = tracker on.
 const off=require('../src/features/extension-offers.cjs');
 const offered=p=>{const x=off.decide(off.candidates(p,{offers:off.load(),settings:{}}));return x?.one?.offer.id||'';};
 for(const p of ['на что ушёл день','сколько я сидел в Unity на этой неделе','время по задачам','запиши время в Jira'])assert.equal(offered(p),'time-tracking',p);
 for(const p of ['сколько я сегодня сфокусировался','что я сегодня сделал','который час','сколько времени займёт сборка'])assert.notEqual(offered(p),'time-tracking',p);
 assert.equal(offer.connected({activityTracking:'true'}),true);

 Date.now=realNow;void RealDate;
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Time tracking: routing, consent, day/week/app/tasks/projects cards, categories, overlay, CSV, confirmed worklog, journal source, controls, periods passed');
})().catch(e=>{console.error(e);process.exit(1);});
