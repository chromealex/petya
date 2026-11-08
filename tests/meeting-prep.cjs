// «Подготовка к встрече»: routing and near-misses (meeting summary, calendar, recording), the calendar prerequisite
// offered through the offers flow, not-connected question, the happy path with stubbed Google Calendar, Petya's
// recorded meetings and summaries in memory, Jira status (read-only), Slack threads from memory, agenda points
// that must cite real facts (invented citations dropped, model-free fallback), the confirmed description update,
// and the persisted «Через 10 минут» reminder.
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
const app=require('../src/extensions/meeting-prep/feature.cjs');
const collect=require('../src/extensions/meeting-prep/collect.cjs');
const calendar=require('../src/extensions/calendar/feature.cjs');
const offer=require('../src/extensions/meeting-prep/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {SCOPES}=require('../src/extensions/calendar/client.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const json=(v,status=200)=>({ok:status<300,status,json:async()=>v});
const NOW=new Date(2026,10,9,14,52);// Monday 9 Nov 2026, 14:52
const at=(d,h,m=0)=>new Date(2026,10,d,h,m).toISOString();
const ms=(d,h,m=0)=>new Date(2026,10,d,h,m).getTime();
const scope='https://www.googleapis.com/auth/gmail.readonly '+SCOPES.google.join(' ');
(async()=>{
 // --- Routing ---
 const yes={'подготовь меня к встрече':'prep','Подготовь меня к синку по релизу':'prep','что обсуждали с Олегом в прошлый раз':'history','о чём следующая встреча':'next','повестка на синк':'agenda','составь повестку к завтрашней встрече':'agenda','подготовь меня к встрече «Синк по релизу»':'prep','что мы решили в прошлый раз на синке':'history'};
 for(const [t,k] of Object.entries(yes))assert.equal(app.intent(t),k,t);
 const near=['Составь повестку встречи по релизу','сводка встречи','что у меня сегодня','поставь встречу с Олегом в четверг','что решили на встрече','что обсуждали на прошлой встрече','запиши встречу','Запомни повестку следующей встречи: релиз; баги','сделай сводку встречи за вчера','подготовь отчёт','повестка дня в ООН','найди час с Машей'];
 for(const t of near)assert.equal(app.intent(t),null,t);
 // The neighbours do not take these phrases either.
 for(const t of Object.keys(yes))assert.equal(calendar.intent(t),null,'calendar must not take: '+t);
 const summary=require('../src/features/meeting-summary.cjs');
 for(const t of Object.keys(yes))assert.equal(summary.matches(t),false,'meeting summary must not take: '+t);

 // --- Query of a named meeting ---
 assert.equal(collect.query('повестка на синк'),'синк');
 assert.equal(collect.query('подготовь меня к синку по релизу'),'синку по релизу');
 assert.equal(collect.query('подготовь меня к встрече с Олегом'),'');
 assert.equal(collect.query('подготовь меня к встрече'),'');
 assert.ok(collect.similarity('синку по релизу','Синк по релизу 1.5')>=0.99);

 // --- Not added / calendar missing / not connected ---
 const topic={id:'t',title:'Чат',messages:[]};
 const dialogue={active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}};
 const settings={model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat'};
 let modelAnswers=[],modelCalls=0,jiraCalls=[];
 const s={settings,dialogue,requestProgress:{report(){}},
  async request(url,o){modelCalls++;const next=modelAnswers.shift();assert.ok(next,'unexpected model call');return {message:{content:JSON.stringify(next)}};},
  saveSettings(v){Object.assign(settings,v);},
  mailAccounts:{google:{client:()=>({access:async()=>'tok'})}}};
 assert.equal(await app.turn(s,'подготовь меня к встрече'),null,'not added: nothing here');
 settings['extension_meeting-prep']='true';
 let offered=null;s.extensionOffers={prerequisite:(id,command)=>{offered={id,command};return {items:[{id:'o1',ext:id,name:'Календарь',pitch:'…',connect:'settings'}],direct:true};}};
 const needCal=await app.turn(s,'подготовь меня к встрече');
 assert.equal(needCal.question,true);assert.match(needCal.text,/«Календарь»/);
 assert.deepEqual(offered,{id:'calendar',command:'подготовь меня к встрече'},'the calendar is offered with the original request kept');
 assert.equal(needCal.extensionData.extensionOffer.items[0].ext,'calendar');
 settings.extension_calendar='true';
 const notConnected=await app.turn(s,'подготовь меня к встрече');
 assert.equal(notConnected.question,true);assert.match(notConnected.text,/Настройки → Календарь/);

 // --- Happy path ---
 settings.gmailCredential=JSON.stringify({accounts:[{id:'a1',email:'me@corp.ru',tokens:{scope}}]});
 settings.teamMembers=JSON.stringify([{name:'Олег Иванов',aliases:'Олег',role:'Тимлид клиента',email:'oleg@corp.ru',slackId:'U1OLEG'},{name:'Мария Петрова',aliases:'Маша',role:'QA',email:'maria@corp.ru'},{name:'Олег Смирнов',email:'smirnov@corp.ru'}]);
 settings.jiraUrl='https://corp.atlassian.net';settings.jiraEmail='me@corp.ru';settings.jiraToken='x';settings.jiraProjects='REL';
 const g=(id,title,start,end,attendees,extra={})=>({id,summary:title,start:{dateTime:start},end:{dateTime:end},attendees:attendees.map(email=>({email,...email==='me@corp.ru'?{self:true,responseStatus:'accepted'}:{}})),organizer:{email:'me@corp.ru'},htmlLink:'https://calendar.google.com/event?eid='+id,hangoutLink:'https://meet.google.com/abc-defg-hij',...extra});
 const people3=['me@corp.ru','oleg@corp.ru','maria@corp.ru'];
 const upcoming=[g('e1','Синк по релизу',at(9,15,0),at(9,15,30),people3),g('e2','1:1 с Олегом',at(10,11),at(10,11,30),['me@corp.ru','oleg@corp.ru'])];
 const past=[g('p1','Синк по релизу',at(2,15,0),at(2,15,30),people3),g('p2','Синк по релизу',at(5,15,0),at(5,15,30),people3),g('p3','Обед',at(6,13),at(6,14),['me@corp.ru'])];
 let writes=[],calls=[];
 const fetcher=async(url,o={})=>{
  calls.push({url,method:o.method||'GET'});
  if(/\/events\?/.test(url)&&(!o.method||o.method==='GET')){const q=new URL(url).searchParams;const from=Date.parse(q.get('timeMin'));return json({items:from<+NOW-DAY?past:upcoming});}
  if(/\/events\/e1$/.test(url))return json({id:'e1',description:'Ссылка на доку',htmlLink:'https://calendar.google.com/event?eid=e1'});
  if(/\/events\/e1\?sendUpdates=all$/.test(url)&&o.method==='PATCH'){writes.push(JSON.parse(o.body));return json({id:'e1',htmlLink:'https://calendar.google.com/event?eid=e1'});}
  throw Error('unexpected '+url);
 };
 const DAY=86400000;
 // Petya's memory: the recording of the 5 Nov sync with its summary, an unrelated recording, Slack threads.
 const memory=[
  {id:'s5-0',sessionId:'s5',source:'Встреча',speaker:'Oleg',title:'Синк по релизу · 05.11.2026',text:'обсуждали SDK',at:ms(5,15,5)},
  {id:'s5-1',sessionId:'s5',source:'Встреча',title:'Синк по релизу · 05.11.2026',text:'и билд',at:ms(5,15,25)},
  {id:'summary:s5',sessionId:'s5',source:'Встреча',kind:'summary',title:'Сводка встречи · 5 нояб.',text:'…',at:ms(5,15,26),basis:'transcript',
   summary:{discussed:['релиз 1.5'],decisions:['Релиз 1.5 переносим на 12 ноября','Фичефлаг магазина выключен до QA'],tasks:[{who:'Олег',what:'Обновить SDK рекламы до 7.2',due:'10.11'},{who:'Маша',what:'Прогнать регресс магазина',due:''},{who:'Я',what:'REL-77 согласовать текст патчноута',due:''}],notDiscussed:['Кто дежурит в выходные релиза']}},
  {id:'x-0',sessionId:'x',source:'Встреча',title:'Собеседование · 06.11.2026',text:'о себе',at:ms(6,12)},
  {id:'slack-1',source:'Slack',channel:'C1',title:'SDK рекламы 7.2 падает на старте',url:'https://app.slack.com/archives/C1/p1',at:ms(8,18),messages:[{user:'U1OLEG',text:'SDK 7.2 падает на Android 8, нужен хотфикс',at:ms(8,18)}]},
  {id:'slack-2',source:'Slack',channel:'C2',title:'Обед в пятницу',url:'https://app.slack.com/archives/C2/p2',at:ms(8,12),messages:[{user:'U9',text:'кто идёт на обед',at:ms(8,12)}]}
 ];
 s.memory={prune:()=>memory};
 s.workspace={api:async(route,o={})=>{jiraCalls.push({route,method:o.method||'GET',body:o.body?JSON.parse(o.body):null});
  if(route.startsWith('/rest/api/3/issue/REL-77'))return {key:'REL-77',fields:{summary:'Согласовать текст патчноута 1.5',status:{name:'Готово',statusCategory:{key:'done'}}}};
  if(route==='/rest/api/3/search/jql'){const jql=JSON.parse(o.body).jql;if(/SDK/i.test(jql)||/обновить/i.test(jql))return {issues:[{key:'REL-80',fields:{summary:'Обновить SDK рекламы до 7.2',status:{name:'В работе',statusCategory:{key:'indeterminate'}}}}]};return {issues:[{key:'REL-1',fields:{summary:'Совсем другая задача',status:{name:'Open',statusCategory:{key:'new'}}}}]};}
  throw Error('unexpected jira '+route);}};
 const prep=await app.turn(s,'подготовь меня к встрече',{fetcher,now:NOW});
 const card=prep.extensionData.meetingPrep;
 assert.equal(card.event.title,'Синк по релизу');assert.equal(card.event.link,'https://meet.google.com/abc-defg-hij');assert.equal(card.event.organizer,true);
 assert.deepEqual(card.attendees.map(a=>[a.name,a.role,a.self]),[['me@corp.ru','',true],['Мария Петрова','QA',false],['Олег Иванов','Тимлид клиента',false]]);
 assert.deepEqual(card.history.map(h=>[h.title,new Date(h.at).getDate(),h.recorded,h.decisions.length]),[['Синк по релизу',5,true,2],['Синк по релизу',2,false,0]],'calendar history joined with the recording of 5 Nov; lunch and the interview are not this meeting');
 assert.equal(card.history[0].summaryId,'summary:s5');
 assert.deepEqual(card.tasks.map(t=>[t.what,t.tracker?.key||'',t.tracker?.category||'']),[['Обновить SDK рекламы до 7.2','REL-80','progress'],['Прогнать регресс магазина','',''],['REL-77 согласовать текст патчноута','REL-77','done']],'status from Jira by key or by words; an unrelated hit is not taken');
 assert.ok(jiraCalls.every(c=>c.method==='GET'||c.route==='/rest/api/3/search/jql'),'Jira is only read');
 assert.ok(jiraCalls.some(c=>c.body&&/project in \(REL\)/.test(c.body.jql)),'search is limited to the chosen projects');
 assert.deepEqual(card.slack.map(x=>x.title),['SDK рекламы 7.2 падает на старте'],'a related thread where an attendee wrote; the lunch thread is not');
 assert.equal(modelCalls,0,'no model chosen: no model call');
 assert.equal(card.agendaModel,false);
 assert.equal(card.agenda.length,3);
 for(const p of card.agenda)assert.ok(p.sources.every(id=>card.facts.some(f=>f.id===id)),'every point cites a fact');
 assert.match(card.agenda[0].text,/SDK/);
 assert.match(prep.text,/^Синк по релизу — сегодня в 15:00, 3 участника\./);
 assert.match(prep.text,/В прошлый раз \(5 нояб\.\): решили — Релиз 1\.5 переносим на 12 ноября/);
 assert.ok(calls.every(c=>c.method==='GET'),'preparing writes nothing');

 // With a model: points citing unknown facts are dropped; valid ones are kept (max 3).
 settings.model='qwen3:4b';
 modelAnswers=[{points:[{text:'Перенос релиза и SDK',sources:['D1','T1']},{text:'Выдуманная тема',sources:['X9']},{text:'Хотфикс SDK на Android 8',sources:['S1']},{text:'Дежурство на выходных',sources:['Q1']},{text:'Ещё один',sources:['T2']}]}];
 const withModel=(await app.turn(s,'повестка на синк',{fetcher,now:NOW})).extensionData.meetingPrep;
 assert.equal(withModel.agendaModel,true);
 assert.deepEqual(withModel.agenda.map(p=>p.text),['Перенос релиза и SDK','Хотфикс SDK на Android 8','Дежурство на выходных'],'a point without a real source is never shown');
 // A model that cites nothing real falls back to the rule-based agenda.
 modelAnswers=[{points:[{text:'Тема',sources:['Z1']}]}];
 assert.equal((await app.turn(s,'о чём следующая встреча',{fetcher,now:NOW})).extensionData.meetingPrep.agendaModel,false);

 // History with a person: the next 1:1 with Oleg is the target; the ambiguous «Олег» is asked first.
 settings.model='';
 const withOleg=(await app.turn(s,'что обсуждали с Олегом в прошлый раз',{fetcher,now:NOW})).extensionData.meetingPrep;
 assert.equal(withOleg.mode,'history');assert.equal(withOleg.event.title,'Синк по релизу','the alias «Олег» picks Oleg Ivanov; his next meeting');
 assert.equal(withOleg.history[0].decisions[0],'Релиз 1.5 переносим на 12 ноября');
 const team=settings.teamMembers;settings.teamMembers=JSON.stringify(JSON.parse(team).map(m=>({...m,aliases:''})));
 let asked=null;
 await assert.rejects(app.turn(s,'что обсуждали с Олегом в прошлый раз',{fetcher,now:NOW}),e=>{asked=e;return e instanceof InputRequired&&e.spec.options.length===2;});
 const resumed=await asked.resume('Олег Смирнов');
 assert.equal(resumed.extensionData.meetingPrep.event,null,'no meeting with Smirnov ahead');
 assert.match(resumed.text,/^Ближайших встреч, где есть Олег Смирнов, в календаре нет/);
 settings.teamMembers=team;
 // A named meeting that does not exist: a question with the real meetings as options.
 await assert.rejects(app.turn(s,'подготовь меня к встрече «Ретро спринта»',{fetcher,now:NOW}),e=>e instanceof InputRequired&&e.spec.options.some(o=>o.startsWith('Синк по релизу')));

 // Calendar failure is told under the app's name.
 const broken=await app.turn(s,'подготовь меня к встрече',{fetcher:async()=>json({error:{message:'denied'}},401),now:NOW});
 assert.equal(broken.error,true);assert.match(broken.text,/Подготовка к встрече · .*вход истёк/);

 // --- Confirmed write: agenda into the description (only from the card) ---
 const t2={id:'t2',messages:[{role:'assistant',extensionData:{meetingPrep:card}}]};
 dialogue.state.topics=[t2];
 const services={...s,win:null,smoke:true};
 const ipc=app.setup(services,{fetcher,now:()=>+NOW}).ipc;
 assert.match(ipc.preview(card.prepId).text,/^Повестка \(подготовил Петя\):\n1\. /);
 const added=await ipc.addAgenda(card.prepId);
 assert.equal(writes.length,1);assert.match(writes[0].description,/^Ссылка на доку\n\nПовестка \(подготовил Петя\):\n1\. /,'the old description is kept');
 assert.equal((await ipc.addAgenda(card.prepId)).already,true,'pressing twice writes once');assert.equal(writes.length,1);
 // Not the organizer: no write at all.
 const other={...card,prepId:'p-2',event:{...card.event,organizer:false},agendaAdded:undefined};t2.messages.push({role:'assistant',extensionData:{meetingPrep:other}});
 await assert.rejects(ipc.addAgenda('p-2'),/организатор/);
 // No answer from the calendar: the outcome is unknown and is never retried blindly.
 const third={...card,prepId:'p-3',agendaAdded:undefined};t2.messages.push({role:'assistant',extensionData:{meetingPrep:third}});
 const silent=app.setup(services,{fetcher:async(url,o={})=>{if(o.method==='PATCH')throw Error('socket hang up');return fetcher(url,o);},now:()=>+NOW}).ipc;
 await assert.rejects(silent.addAgenda('p-3'),/нет ответа/);
 await assert.rejects(silent.addAgenda('p-3'),/Не знаю, сохранилась ли повестка/);

 // --- Reminders: off by default; once per meeting, persisted ---
 assert.equal(app.defaults.meetingPrepRemind,'false');
 const published=[];let clock=+NOW;
 const r1=app.reminders(services,{now:()=>clock,fetcher,publish:x=>published.push(x)});
 await r1.tick();assert.equal(published.length,0,'off by default');
 settings.meetingPrepRemind='true';
 clock=ms(9,14,40);await r1.tick();assert.equal(published.length,0,'20 minutes before: not yet');
 clock=ms(9,14,50);await r1.tick();
 assert.equal(published.length,1);assert.equal(published[0].text,'Через 10 минут: Синк по релизу — открыть подготовку');assert.equal(published[0].id,'meeting-prep:e1@'+new Date(at(9,15)).toISOString());
 clock=ms(9,14,51);await r1.tick();assert.equal(published.length,1,'announced once');
 // After a restart (new scheduler, same saved settings) nothing is repeated and the snapshot restores it.
 const r2=app.reminders(services,{now:()=>clock,fetcher:async()=>{throw Error('offline');},publish:x=>published.push(x)});
 await r2.tick();assert.equal(published.length,1);
 assert.equal(r2.active()[0].text,'Через 10 минут: Синк по релизу — открыть подготовку');
 // Offline at the right moment: the saved list still brings the reminder of the next meeting.
 settings.meetingPrepReminders=JSON.stringify({next:[{key:'e9@x',title:'Демо',start:new Date(clock+8*60000).toISOString()}],shown:{},fetched:clock});
 await r2.tick();assert.equal(published.at(-1).text,'Через 8 минут: Демо — открыть подготовку');
 assert.throws(()=>app.validate({meetingPrepRemind:'yes'}));

 // --- Offer: own phrases only ---
 const all=offers.load();
 const pick=text=>{const d=offers.decide(offers.candidates(text,{offers:all,settings:{}}));return d?.one?[d.one.offer.id]:d?d.tie.map(r=>r.offer.id):[];};
 for(const t of ['подготовь меня к встрече','что обсуждали с Олегом в прошлый раз','о чём следующая встреча','повестка на синк'])assert.deepEqual(pick(t),['meeting-prep'],t);
 for(const t of ['сводка встречи','что у меня сегодня','поставь встречу с Олегом','запиши встречу'])assert.ok(!pick(t).includes('meeting-prep'),t);
 assert.equal(offer.ready({'extension_meeting-prep':'true'}),false,'without a connected calendar it is not ready');
 // The real offers service: the calendar prerequisite is a pending offer that resends the original request.
 const offerTopic={id:'ot',messages:[]},saved={};
 const offerService=offers.setup({settings:{},dialogue:{active:()=>offerTopic,persist(){},rememberAction(){}},saveSettings:v=>Object.assign(saved,v)});
 const pending=offerService.extensionOffers.prerequisite('calendar','подготовь меня к встрече');
 assert.equal(pending.items[0].ext,'calendar');assert.equal(pending.items[0].connect,'settings');
 const accepted=offerService.ipc.accept(pending.items[0].id);
 assert.equal(saved.extension_calendar,'true');assert.equal(accepted.retry,'подготовь меня к встрече');assert.equal(accepted.settings,'calendar');
 assert.equal(offerService.extensionOffers.prerequisite('no-such-app','x'),null);

 // Calendar: appending to an Outlook event keeps its HTML body and escapes the text.
 const {CalendarClient}=require('../src/extensions/calendar/client.cjs');
 const graph=[];
 const ms365=new CalendarClient({provider:'microsoft',email:'me@corp.ru',token:async()=>'t',fetcher:async(url,o={})=>{graph.push({url,method:o.method||'GET',body:o.body?JSON.parse(o.body):null});
  return o.method==='PATCH'?json({id:'m1',webLink:'https://outlook.office.com/x'}):json({body:{contentType:'html',content:'<p>Старое</p>'},webLink:'https://outlook.office.com/x'});}});
 await ms365.appendDescription('m1','Повестка:\n1. <b>SDK</b>');
 assert.equal(graph[1].method,'PATCH');assert.equal(graph[1].body.body.content,'<p>Старое</p><p>Повестка:<br>1. &lt;b&gt;SDK&lt;/b&gt;</p>');
 const again=new CalendarClient({provider:'microsoft',email:'me@corp.ru',token:async()=>'t',fetcher:async()=>json({body:{contentType:'text',content:'Повестка: 1. SDK'}})});
 assert.equal((await again.appendDescription('m1','Повестка:  1. SDK')).already,true,'the same text is not added twice');
 console.log('Meeting prep: routing and near-misses, calendar prerequisite offer, not connected, history from calendar and recordings, Jira status read-only, Slack from memory, cited agenda, confirmed description update, persisted reminders passed');
})().catch(e=>{console.error(e);process.exit(1);});
