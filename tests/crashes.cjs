// «Крэши» (Sentry): routing incl. near-misses that belong to other apps, not added / not connected,
// the issue stream request and card data (totals, stacked chart, sparklines, «новый»), release filter with
// crash-free rate, yesterday and platform filters, service errors, model-free behaviour, resolve/reopen and the offer.
// No network: Sentry and the local model are stubbed through s.request.
const assert=require('node:assert/strict');
const app=require('../src/extensions/crashes/feature.cjs');
const query=require('../src/extensions/crashes/query.cjs');
const client=require('../src/extensions/crashes/client.cjs');
const offer=require('../src/extensions/crashes/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');

const NOW=new Date('2026-11-08T10:00:00Z');
const DAY=86400000;
const today=Date.UTC(2026,10,8);
// Sentry's 14d group stats: 14 daily buckets [unixSeconds, count], oldest first.
const stats=values=>({'14d':values.map((v,i)=>[(today-(13-i)*DAY)/1000,v])});
const issue=(id,title,count,users,firstSeen,values,extra={})=>({id,shortId:'GAME-'+id,title,culprit:'PlayerController.Update',level:'fatal',count:String(count),userCount:users,
 firstSeen,lastSeen:'2026-11-08T09:00:00Z',platform:'csharp',project:{id:'11',slug:'game-android',platform:'android'},permalink:'https://my-studio.sentry.io/issues/'+id+'/',status:'unresolved',isUnhandled:true,stats:stats(values),...extra});
const ISSUES=[
 issue('101','NullReferenceException: Object reference not set',540,120,'2026-09-01T00:00:00Z',[10,12,9,20,30,25,40,50,60,70,80,90,100,105]),
 issue('102','IndexOutOfRangeException: Index was outside the bounds',300,80,'2026-11-05T12:00:00Z',[0,0,0,0,0,0,0,0,0,0,40,80,90,90],{culprit:'Inventory.Add'}),
 issue('103','OutOfMemoryException',120,40,'2026-10-01T00:00:00Z',[5,5,5,5,5,5,10,10,10,10,10,20,20,20],{level:'error',culprit:'TextureLoader.Load'}),
 ...Array.from({length:6},(_,i)=>issue(String(110+i),'Minor crash '+i,10-i,2,'2026-08-01T00:00:00Z',[0,0,0,0,0,0,0,1,1,1,1,1,1,2],{level:'warning'}))
];

function services(over={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[];
 const routes={
  '/api/0/organizations/my-studio/projects/':()=>[{id:'11',slug:'game-android',name:'Game Android',platform:'android'},{id:'12',slug:'game-ios',name:'Game iOS',platform:'apple-ios'},{id:'13',slug:'backend',name:'Backend',platform:'python'}],
  '/api/0/organizations/my-studio/issues/':()=>ISSUES,
  '/api/0/organizations/my-studio/releases/':()=>[{version:'com.studio.game@1.4.2+102',dateReleased:'2026-11-04T08:00:00Z'},{version:'com.studio.game@1.4.20+1',dateReleased:'2026-11-07T08:00:00Z'}],
  '/api/0/organizations/my-studio/sessions/':()=>({groups:[{by:{},totals:{'crash_free_rate(session)':0.9871,'crash_free_rate(user)':0.9712,'sum(session)':52000}}]}),
  '/api/0/organizations/':()=>[{slug:'my-studio',name:'My Studio'}],
  '/api/chat':()=>({message:{content:JSON.stringify({common:'Все в игровом цикле Unity на Android'})}}),
  ...over
 };
 const s={settings:{model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_crashes:'true',sentryUrl:'https://sentry.io',sentryToken:'sntrys_test',sentryOrg:'my-studio',sentryProjects:'game-android,game-ios',sentryEnvironment:'',sentryQuery:''},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){
   const u=new URL(url);calls.push({url:u,options});
   const route=routes[u.pathname];assert.ok(route,'unexpected request '+url);
   if(u.pathname.startsWith('/api/0/'))assert.equal(options.headers.Authorization,'Bearer sntrys_test');
   return route(u,options);
  }};
 return {s,topic,calls};
}
const last=(calls,path)=>calls.filter(c=>c.url.pathname===path).at(-1);

(async()=>{
 // Routing: the brief's phrases are crash requests; ANR, red builds, «сервер упал», fixes and Jira tasks are not.
 for(const p of ['какие крэши за неделю','топ крэшей','новые крэши после релиза 1.4.2','что с крэшами на андроиде','сколько падений вчера','что в Sentry за сутки','покажи краши на iOS','Sentry'])
  assert.ok(query.about(p),'should trigger: '+p);
 for(const p of ['ANR за неделю','какие ANR на андроиде','сколько ANR вчера','упала сборка','сборка опять упала','почему упала сборка 1.4.2','сервер упал','сервер упал, что делать','падение продаж за неделю','какой вылет рейса',
  'исправь крэш в PlayerController','Исправь баг в коде — крэш из Sentry: NRE в Player.Update','Создай задачу в Jira: Крэш GAME-1 — NRE','что такое крэш-репорт','зависания на андроиде','у меня всё крашится иногда','пиши крэш-тесты',''])
  assert.ok(!query.about(p),'should not trigger: '+p);
 // Filters.
 const yesterday=query.period('сколько падений вчера',new Date(2026,10,8,15,0));
 assert.equal(yesterday.label,'вчера');assert.equal(new Date(yesterday.start).getDate(),7);assert.equal(Date.parse(yesterday.end)-Date.parse(yesterday.start),DAY);
 assert.equal(query.period('крэши за неделю').statsPeriod,'7d');assert.equal(query.period('крэши за 3 дня').statsPeriod,'3d');assert.equal(query.period('крэши за сутки').statsPeriod,'24h');assert.equal(query.period('топ крэшей'),null);
 assert.equal(query.release('новые крэши после релиза 1.4.2'),'1.4.2');assert.equal(query.release('крэши в версии v2.0.1-rc1'),'2.0.1-rc1');assert.equal(query.release('топ крэшей за 7 дней'),null);
 assert.equal(query.platform('что с крэшами на андроиде'),'Android');assert.equal(query.platform('крэши на айфоне'),'iOS');assert.equal(query.platform('крэши в iOS'),'iOS');
 assert.equal(query.environment('крэши в проде'),'production');assert.equal(query.project('крэши game-ios за неделю',['game-android','game-ios']),'game-ios');

 // Not added: nothing here (the offer handles it).
 let {s,topic,calls}=services();
 s.settings.extension_crashes='false';
 assert.equal(await app.turn(s,'какие крэши за неделю'),null);
 // Added but not connected: a question telling where to connect, no request.
 s.settings.extension_crashes='true';s.settings.sentryToken='';
 const ask=await app.turn(s,'какие крэши за неделю');
 assert.equal(ask.question,true);assert.match(ask.text,/Настройки → «Крэши»/);assert.equal(calls.length,0);
 s.settings.sentryToken='sntrys_test';
 for(const p of ['ANR за неделю','упала сборка','сервер упал'])assert.equal(await app.turn(s,p),null,p);

 // Happy path: a week of crashes in the two chosen projects.
 const week=await app.crashesTurn(s,'какие крэши за неделю',NOW);
 const req=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.deepEqual(req.getAll('project'),['11','12'],'only the chosen projects, by id');
 assert.equal(req.get('statsPeriod'),'7d');assert.equal(req.get('groupStatsPeriod'),'14d');assert.equal(req.get('sort'),'freq');assert.equal(req.get('query'),'is:unresolved');assert.equal(req.get('limit'),'100');
 const card=week.extensionData.crashCard;
 assert.equal(card.totals.issues,9);assert.equal(card.totals.events,540+300+120+10+9+8+7+6+5);assert.equal(card.totals.users,120+80+40+12);
 assert.equal(card.totals.fresh,1,'GAME-102 appeared within the week');
 assert.deepEqual(card.issues.filter(i=>i.isNew).map(i=>i.id),['102']);
 assert.equal(card.chart.days.length,7);assert.equal(card.chart.days.at(-1),'2026-11-08');
 assert.equal(card.chart.series.length,6,'five issues and the rest');assert.equal(card.chart.series.at(-1).id,'rest');
 assert.deepEqual(card.chart.series[0].values,[50,60,70,80,90,100,105],'last 7 of the 14 daily buckets');
 assert.deepEqual(card.chart.series.at(-1).values,[4,4,4,4,4,4,8],'rest = issues 6..9 summed per day');
 assert.equal(card.issues[0].spark.length,14);assert.equal(card.issues[0].spark.at(-1),105);
 assert.equal(card.issues[0].url,'https://my-studio.sentry.io/issues/101/');assert.equal(card.crashFree,null);assert.equal(card.common,'','no model: no common line');
 assert.match(week.text,/^За неделю: 9 крэшей, 1\s005 событий, затронуто до 252 пользователей\. Чаще всего — «NullReferenceException/u);
 assert.match(week.text,/Новых: 1\./);
 assert.equal(topic.messages.at(-1).by,'Крэши');assert.ok(topic.messages.at(-1).extensionData.crashCard);
 assert.ok(card.url.startsWith('https://sentry.io/organizations/my-studio/issues/?project=11&project=12'));
 assert.ok(!calls.some(c=>c.url.pathname==='/api/chat'),'model never called without a chosen model');

 // «топ крэшей» defaults to a week; the turn entry point gives the same.
 assert.equal((await app.turn(s,'топ крэшей')).extensionData.crashCard.period.label,'за неделю');

 // Release: exact versions found by the number (1.4.20 is not 1.4.2), period from the release, only new ones, crash-free.
 const rel=await app.crashesTurn(s,'новые крэши после релиза 1.4.2',NOW);
 const rq=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.equal(rq.get('query'),'is:unresolved release:["com.studio.game@1.4.2+102"]');
 assert.equal(rq.get('start'),'2026-11-04T08:00:00.000Z');assert.equal(rq.get('statsPeriod'),null);
 const rc=rel.extensionData.crashCard;
 assert.deepEqual(rc.issues.map(i=>i.id),['102'],'only issues first seen after the release');
 assert.equal(rc.release.name,'1.4.2');assert.equal(rc.period.label,'после релиза 1.4.2');
 assert.deepEqual(rc.crashFree,{sessions:0.9871,users:0.9712,total:52000});
 const sq=last(calls,'/api/0/organizations/my-studio/sessions/').url.searchParams;
 assert.deepEqual(sq.getAll('field'),['crash_free_rate(session)','crash_free_rate(user)','sum(session)']);assert.equal(sq.get('query'),'release:"com.studio.game@1.4.2+102"');
 assert.match(rel.text,/^После релиза 1\.4\.2: 1 новый крэш, 300 событий, затронуто до 80 пользователей\. Чаще всего — «IndexOutOfRange/u);
 // Release health not set up: the card is still complete.
 ({s,calls}=services({'/api/0/organizations/my-studio/sessions/':()=>{throw Object.assign(Error('HTTP 400'),{status:400});}}));
 assert.equal((await app.crashesTurn(s,'крэши в релизе 1.4.2',NOW)).extensionData.crashCard.crashFree,null);
 // Unknown release: a question, not an empty card.
 ({s,calls}=services({'/api/0/organizations/my-studio/releases/':()=>[]}));
 const none=await app.crashesTurn(s,'новые крэши после релиза 9.9.9',NOW);
 assert.equal(none.question,true);assert.match(none.text,/нет релиза «9\.9\.9»/);

 // Platform and yesterday.
 ({s,calls}=services());
 await app.crashesTurn(s,'что с крэшами на андроиде',NOW);
 assert.equal(last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams.get('query'),'is:unresolved os.name:Android');
 const y=await app.crashesTurn(s,'сколько падений вчера',NOW);
 const yq=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.ok(yq.get('start')&&yq.get('end'));assert.equal(yq.get('statsPeriod'),null);
 assert.equal(y.extensionData.crashCard.period.label,'вчера');assert.equal(y.extensionData.crashCard.chart.days.length,7);
 assert.match(y.text,/^Вчера: /);
 // A project named in the request narrows to it; settings filter and environment are sent.
 s.settings.sentryQuery='error.unhandled:true';s.settings.sentryEnvironment='production';
 await app.crashesTurn(s,'топ крэшей game-ios',NOW);
 const pq=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.deepEqual(pq.getAll('project'),['12']);assert.equal(pq.get('query'),'is:unresolved error.unhandled:true');assert.equal(pq.get('environment'),'production');
 // No projects chosen: all projects of the organization.
 s.settings.sentryProjects='';s.settings.sentryQuery='';s.settings.sentryEnvironment='';
 await app.crashesTurn(s,'топ крэшей',NOW);
 assert.deepEqual(last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams.getAll('project'),['11','12','13']);

 // Empty result.
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':()=>[]}));
 const empty=await app.crashesTurn(s,'какие крэши за неделю',NOW);
 assert.equal(empty.text,'Крэшей за неделю нет.');assert.equal(empty.extensionData.crashCard.issues.length,0);

 // Service errors are told in words, as an error reply.
 ({s,calls}=services({'/api/0/organizations/my-studio/projects/':()=>{throw Object.assign(Error('Сервис вернул HTTP 401'),{status:401});}}));
 const denied=await app.turn(s,'топ крэшей');
 assert.equal(denied.error,true);assert.match(denied.text,/^Крэши · Sentry не принял токен/);
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':()=>{throw Object.assign(Error('Сервис вернул HTTP 403'),{status:403});}}));
 assert.match((await app.turn(s,'топ крэшей')).text,/не хватает прав/);
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':()=>({detail:'oops'})}));
 assert.match((await app.turn(s,'топ крэшей')).text,/некорректный список/);

 // With a model: one «что общего» line; a useless or broken answer is dropped, the card stays complete.
 ({s,calls}=services());s.settings.model='qwen3:4b';
 const withModel=await app.crashesTurn(s,'топ крэшей',NOW);
 assert.equal(withModel.extensionData.crashCard.common,'Все в игровом цикле Unity на Android');
 const prompt=JSON.parse(last(calls,'/api/chat').options.body);assert.match(prompt.messages[1].content,/NullReferenceException/);
 ({s,calls}=services({'/api/chat':()=>({message:{content:'not json'}})}));s.settings.model='qwen3:4b';
 const broken=await app.crashesTurn(s,'топ крэшей',NOW);
 assert.equal(broken.extensionData.crashCard.common,'');assert.equal(broken.extensionData.crashCard.issues.length,9);
 ({s,calls}=services({'/api/chat':()=>{throw Error('model down');}}));s.settings.model='qwen3:4b';
 assert.equal((await app.crashesTurn(s,'топ крэшей',NOW)).extensionData.crashCard.common,'');

 // «Решено» and undo: bulk-mutate with one id, only through ipc (a card button); bad ids and missing setup refused.
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':(u,o)=>{assert.equal(o.method,'PUT');return JSON.parse(o.body);}}));
 const ipc=app.setup(s).ipc;
 assert.deepEqual(await ipc.resolve('101'),{id:'101',status:'resolved',text:'Отмечено решённым в Sentry'});
 let put=last(calls,'/api/0/organizations/my-studio/issues/');
 assert.equal(put.url.searchParams.get('id'),'101');assert.deepEqual(JSON.parse(put.options.body),{status:'resolved'});
 assert.equal((await ipc.reopen('101')).status,'unresolved');
 put=last(calls,'/api/0/organizations/my-studio/issues/');assert.deepEqual(JSON.parse(put.options.body),{status:'unresolved'});
 await assert.rejects(ipc.resolve('101&id=102'),/Некорректный ID/);
 s.settings.extension_crashes='false';await assert.rejects(ipc.resolve('101'),/не добавлено/);
 s.settings.extension_crashes='true';s.settings.sentryToken='';await assert.rejects(ipc.resolve('101'),/не подключён/);
 // Chat turns never write to Sentry.
 ({s,calls}=services());for(const p of ['какие крэши за неделю','новые крэши после релиза 1.4.2'])await app.turn(s,p);
 assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
 // Settings ipc: organizations and projects for the settings card.
 assert.deepEqual(await app.setup(s).ipc.organizations(),[{slug:'my-studio',name:'My Studio'}]);
 assert.equal((await app.setup(s).ipc.projects()).length,3);
 assert.deepEqual(app.setup(s).ipc.status(),{hasToken:true,url:'https://sentry.io',org:'my-studio',projects:['game-android','game-ios'],environment:''});

 // Settings validation: https (or local http) address only, slugs only.
 const next=v=>({sentryUrl:'',sentryOrg:'',sentryProjects:'',sentryEnvironment:'',sentryQuery:'',...v});
 const ok=next({sentryUrl:'https://sentry.example.com/',sentryOrg:'my-studio',sentryProjects:' game-android , game-ios,game-ios'});app.validate(ok);
 assert.equal(ok.sentryUrl,'https://sentry.example.com');assert.equal(ok.sentryProjects,'game-android,game-ios');
 const blank=next({});app.validate(blank);assert.equal(blank.sentryUrl,'https://sentry.io');
 assert.throws(()=>app.validate(next({sentryUrl:'http://sentry.example.com'})),/https/);
 assert.doesNotThrow(()=>app.validate(next({sentryUrl:'http://localhost:9000'})));
 assert.throws(()=>app.validate(next({sentryUrl:'https://user:pw@sentry.io'})),/без логина/);
 assert.throws(()=>app.validate(next({sentryOrg:'my studio'})),/Slug/);
 assert.throws(()=>app.validate(next({sentryProjects:'a,b/c'})),/Проекты/);
 assert.equal(client.base(''),'https://sentry.io');

 // Offer: Sentry only, never for ANR, red builds or Crashlytics; ready once added and connected.
 const list=offers.load();assert.ok(list.some(o=>o.id==='crashes'));
 const settings={extension_crashes:'false'};
 const pick=t=>offers.candidates(t,{offers:list,settings}).filter(r=>r.offer.id==='crashes');
 for(const p of ['какие крэши за неделю','топ крэшей','сколько падений вчера','что в Sentry'])assert.equal(pick(p).length,1,'offered for: '+p);
 assert.equal(pick('какие крэши за неделю')[0].direct,true);
 for(const p of ['ANR за неделю','упала сборка','сервер упал','крэши в Crashlytics','падение продаж за неделю'])assert.equal(pick(p).length,0,'not offered for: '+p);
 assert.doesNotMatch(offer.pitch,/crashlytics|firebase/i);
 assert.equal(offer.ready({extension_crashes:'true',sentryToken:'x',sentryOrg:''}),false);
 assert.equal(offer.ready({extension_crashes:'true',sentryToken:'x',sentryOrg:'my-studio'}),true);
 console.log('Crashes: routing and near-misses, not added/not connected, week/top/release/platform/yesterday requests, totals, stacked chart, sparklines, new marks, crash-free, errors, model-free card, resolve/reopen, validation and offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
