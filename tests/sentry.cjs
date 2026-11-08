// «Sentry» extension: the Sentry crash source read through «Крэши» (issue stream request, card data, release with exact
// versions and crash-free, platform/yesterday/project/environment filters, errors in words), «Решено»/undo through the
// crashes ipc, settings validation and ipc, the migration from Sentry settings inside «Крэши», and the offer.
// No network: Sentry and the local model are stubbed through s.request.
const assert=require('node:assert/strict');
const crashes=require('../src/extensions/crashes/feature.cjs');
const feature=require('../src/extensions/sentry/feature.cjs');
const source=require('../src/extensions/sentry/crash-source.cjs');
const client=require('../src/extensions/sentry/client.cjs');
const offer=require('../src/extensions/sentry/offer.cjs');
const registry=require('../src/features/crash-sources.cjs');
const offers=require('../src/features/extension-offers.cjs');

const NOW=new Date('2026-11-08T10:00:00Z');
const DAY=86400000;
const today=Date.UTC(2026,10,8);
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
 const s={settings:{model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_crashes:'true',extension_sentry:'true',sentryUrl:'https://sentry.io',sentryToken:'sntrys_test',sentryOrg:'my-studio',sentryProjects:'game-android,game-ios',sentryEnvironment:'',sentryQuery:''},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){
   const u=new URL(url);calls.push({url:u,options});
   const route=routes[u.pathname];assert.ok(route,'unexpected request '+url);
   if(u.pathname.startsWith('/api/0/'))assert.equal(options.headers.Authorization,'Bearer sntrys_test');
   return route(u,options);
  }};
 s.crashSources=registry.create(s);
 return {s,topic,calls};
}
const last=(calls,path)=>calls.filter(c=>c.url.pathname===path).at(-1);

module.exports=(async()=>{
 // Only Sentry is ready here: Google Play has no credential, Crashlytics is not added.
 let {s,topic,calls}=services();
 assert.deepEqual(s.crashSources.list().map(x=>x.id),['sentry']);
 assert.equal(source.ready({sentryToken:'x',sentryOrg:''}),false);assert.equal(source.ready({sentryToken:'x',sentryOrg:'o'}),true);
 // A week of crashes in the two chosen projects.
 const week=await crashes.crashesTurn(s,'какие крэши за неделю',NOW);
 const req=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.deepEqual(req.getAll('project'),['11','12'],'only the chosen projects, by id');
 assert.equal(req.get('statsPeriod'),'7d');assert.equal(req.get('groupStatsPeriod'),'14d');assert.equal(req.get('sort'),'freq');assert.equal(req.get('query'),'is:unresolved');assert.equal(req.get('limit'),'100');
 const card=week.extensionData.crashCard;
 assert.deepEqual(card.sources.map(x=>[x.id,x.name,x.scope,x.canResolve]),[['sentry','Sentry','my-studio / game-android, game-ios',true]]);
 assert.equal(card.totals.issues,9);assert.equal(card.totals.events,540+300+120+10+9+8+7+6+5);assert.equal(card.totals.users,120+80+40+12);
 assert.equal(card.totals.fresh,1,'GAME-102 appeared within the week');
 assert.deepEqual(card.issues.filter(i=>i.isNew).map(i=>i.id),['102']);
 assert.equal(card.chart.days.length,7);assert.equal(card.chart.days.at(-1),'2026-11-08');
 assert.equal(card.chart.series.length,6,'five issues and the rest');assert.equal(card.chart.series.at(-1).id,'rest');
 assert.deepEqual(card.chart.series[0].values,[50,60,70,80,90,100,105],'last 7 of the 14 daily buckets');
 assert.deepEqual(card.chart.series.at(-1).values,[4,4,4,4,4,4,8],'rest = issues 6..9 summed per day');
 assert.deepEqual(card.chart.bySource.map(x=>x.id),['sentry']);
 assert.equal(card.issues[0].spark.length,14);assert.equal(card.issues[0].spark.at(-1),105);assert.equal(card.issues[0].shortId,'GAME-101');assert.equal(card.issues[0].unhandled,true);
 assert.equal(card.issues[0].url,'https://my-studio.sentry.io/issues/101/');assert.equal(card.issues[0].canResolve,true);assert.equal(card.common,'','no model: no common line');
 assert.match(week.text,/^За неделю: 9 крэшей, 1\s005 событий, затронуто до 252 пользователей\. Чаще всего — «NullReferenceException/u);
 assert.match(week.text,/Новых: 1\./);
 assert.ok(card.sources[0].url.startsWith('https://sentry.io/organizations/my-studio/issues/?project=11&project=12'));
 assert.equal(topic.messages.at(-1).sources[0].title,'Sentry · my-studio / game-android, game-ios');
 // «что в Sentry за сутки» is a crash request by the name alone, read from Sentry only.
 assert.equal((await crashes.turn(s,'что в Sentry за сутки')).extensionData.crashCard.period.label,'за сутки');
 assert.equal(last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams.get('statsPeriod'),'24h');

 // Release: exact versions (1.4.20 is not 1.4.2), the period from the release, only new ones, crash-free.
 const rel=await crashes.crashesTurn(s,'новые крэши после релиза 1.4.2',NOW);
 const rq=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.equal(rq.get('query'),'is:unresolved release:["com.studio.game@1.4.2+102"]');
 assert.equal(rq.get('start'),'2026-11-04T08:00:00.000Z');assert.equal(rq.get('statsPeriod'),null);
 const rc=rel.extensionData.crashCard;
 assert.deepEqual(rc.issues.map(i=>i.id),['102'],'only issues first seen after the release');
 assert.equal(rc.release.name,'1.4.2');assert.equal(rc.period.label,'после релиза 1.4.2');
 assert.deepEqual(rc.sources[0].crashFree,{sessions:0.9871,users:0.9712,total:52000});
 const sq=last(calls,'/api/0/organizations/my-studio/sessions/').url.searchParams;
 assert.deepEqual(sq.getAll('field'),['crash_free_rate(session)','crash_free_rate(user)','sum(session)']);assert.equal(sq.get('query'),'release:"com.studio.game@1.4.2+102"');
 assert.match(rel.text,/^После релиза 1\.4\.2: 1 новый крэш, 300 событий, затронуто до 80 пользователей\. Чаще всего — «IndexOutOfRange/u);
 // Release health not set up: the card is still complete.
 ({s,calls}=services({'/api/0/organizations/my-studio/sessions/':()=>{throw Object.assign(Error('HTTP 400'),{status:400});}}));
 assert.equal((await crashes.crashesTurn(s,'крэши в релизе 1.4.2',NOW)).extensionData.crashCard.sources[0].crashFree,null);
 // Unknown release: a question, not an empty card.
 ({s,calls}=services({'/api/0/organizations/my-studio/releases/':()=>[]}));
 const none=await crashes.crashesTurn(s,'новые крэши после релиза 9.9.9',NOW);
 assert.equal(none.question,true);assert.match(none.text,/В Sentry нет релиза «9\.9\.9»/);
 assert.equal(calls.filter(c=>c.url.pathname==='/api/0/organizations/my-studio/issues/').length,0,'no issue stream for an unknown release');

 // Platform, yesterday, a named project, the settings filter and environment.
 ({s,calls}=services());
 await crashes.crashesTurn(s,'что с крэшами на андроиде',NOW);
 assert.equal(last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams.get('query'),'is:unresolved os.name:Android');
 const y=await crashes.crashesTurn(s,'сколько падений вчера',NOW);
 const yq=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.ok(yq.get('start')&&yq.get('end'));assert.equal(yq.get('statsPeriod'),null);
 assert.equal(y.extensionData.crashCard.period.label,'вчера');assert.match(y.text,/^Вчера: /);
 s.settings.sentryQuery='error.unhandled:true';s.settings.sentryEnvironment='production';
 await crashes.crashesTurn(s,'топ крэшей game-ios',NOW);
 const pq=last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams;
 assert.deepEqual(pq.getAll('project'),['12']);assert.equal(pq.get('query'),'is:unresolved error.unhandled:true');assert.equal(pq.get('environment'),'production');
 await crashes.crashesTurn(s,'топ крэшей на стейдже',NOW);
 assert.equal(last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams.get('environment'),'staging','the request wins over the settings environment');
 s.settings.sentryProjects='';s.settings.sentryQuery='';s.settings.sentryEnvironment='';
 await crashes.crashesTurn(s,'топ крэшей',NOW);
 assert.deepEqual(last(calls,'/api/0/organizations/my-studio/issues/').url.searchParams.getAll('project'),['11','12','13'],'no projects chosen: all of the organization');

 // Service errors are told in words.
 ({s,calls}=services({'/api/0/organizations/my-studio/projects/':()=>{throw Object.assign(Error('Сервис вернул HTTP 401'),{status:401});}}));
 const denied=await crashes.turn(s,'топ крэшей');
 assert.equal(denied.error,true);assert.match(denied.text,/^Крэши · Sentry не принял токен/);
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':()=>{throw Object.assign(Error('Сервис вернул HTTP 403'),{status:403});}}));
 assert.match((await crashes.turn(s,'топ крэшей')).text,/не хватает прав/);
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':()=>({detail:'oops'})}));
 assert.match((await crashes.turn(s,'топ крэшей')).text,/некорректный список/);
 ({s,calls}=services({'/api/0/organizations/my-studio/projects/':()=>[]}));
 const noProjects=await crashes.turn(s,'топ крэшей');assert.equal(noProjects.question,true);assert.match(noProjects.text,/нет проектов game-android, game-ios/);

 // «Решено» and undo through the crashes ipc: bulk-mutate with one id; bad ids refused.
 ({s,calls}=services({'/api/0/organizations/my-studio/issues/':(u,o)=>{assert.equal(o.method,'PUT');return JSON.parse(o.body);}}));
 const ipc=crashes.setup(s).ipc;
 assert.deepEqual(await ipc.resolve('sentry','101'),{source:'sentry',id:'101',status:'resolved',text:'Отмечено решённым в Sentry'});
 let put=last(calls,'/api/0/organizations/my-studio/issues/');
 assert.equal(put.url.searchParams.get('id'),'101');assert.deepEqual(JSON.parse(put.options.body),{status:'resolved'});
 assert.equal((await ipc.reopen('sentry','101')).text,'Снова открыто в Sentry');
 put=last(calls,'/api/0/organizations/my-studio/issues/');assert.deepEqual(JSON.parse(put.options.body),{status:'unresolved'});
 await assert.rejects(ipc.resolve('sentry','101&id=102'),/Некорректный ID/);
 s.settings.extension_sentry='false';await assert.rejects(ipc.resolve('sentry','101'),/не добавлен или не подключён/);
 // Chat turns never write to Sentry.
 ({s,calls}=services());for(const p of ['какие крэши за неделю','новые крэши после релиза 1.4.2'])await crashes.turn(s,p);
 assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));

 // Settings ipc for the settings card.
 const own=feature.setup(s).ipc;
 assert.deepEqual(await own.organizations(),[{slug:'my-studio',name:'My Studio'}]);
 assert.equal((await own.projects()).length,3);
 assert.deepEqual(own.status(),{added:true,hasToken:true,url:'https://sentry.io',org:'my-studio',projects:['game-android','game-ios'],environment:''});

 // Settings validation: https (or local http) address only, slugs only.
 const next=v=>({sentryUrl:'',sentryOrg:'',sentryProjects:'',sentryEnvironment:'',sentryQuery:'',...v});
 const ok=next({sentryUrl:'https://sentry.example.com/',sentryOrg:'my-studio',sentryProjects:' game-android , game-ios,game-ios'});feature.validate(ok);
 assert.equal(ok.sentryUrl,'https://sentry.example.com');assert.equal(ok.sentryProjects,'game-android,game-ios');
 const blank=next({});feature.validate(blank);assert.equal(blank.sentryUrl,'https://sentry.io');
 assert.throws(()=>feature.validate(next({sentryUrl:'http://sentry.example.com'})),/https/);
 assert.doesNotThrow(()=>feature.validate(next({sentryUrl:'http://localhost:9000'})));
 assert.throws(()=>feature.validate(next({sentryUrl:'https://user:pw@sentry.io'})),/без логина/);
 assert.throws(()=>feature.validate(next({sentryOrg:'my studio'})),/Slug/);
 assert.throws(()=>feature.validate(next({sentryProjects:'a,b/c'})),/Проекты/);
 assert.equal(client.base(''),'https://sentry.io');
 assert.deepEqual(feature.secrets,['sentryToken']);assert.equal(feature.defaults.extension_sentry,'false');
 assert.equal(require('../src/extensions/crashes/feature.cjs').defaults.sentryToken,undefined,'«Крэши» no longer owns Sentry settings');

 // Migration: «Крэши» with a saved Sentry token → «Sentry» added once and saved; decisions and new users kept.
 const migrate=(saved)=>{const settings={...feature.defaults,...saved};const changed=feature.migrate(settings,saved);return {settings,changed};};
 let m=migrate({extension_crashes:'true',sentryToken:'base64-encrypted',sentryOrg:'my-studio'});
 assert.equal(m.changed,true);assert.equal(m.settings.extension_sentry,'true');
 let saves=0;feature.setup({settings:m.settings,saveSettings(v,internal){saves++;assert.deepEqual(v,{});assert.equal(internal,true);}});assert.equal(saves,1,'saved once so the file holds the switch');
 feature.setup({settings:m.settings,saveSettings(){saves++;}});assert.equal(saves,1,'not saved again');
 m=migrate({extension_crashes:'true',sentryToken:'x',extension_sentry:'false'});assert.equal(m.changed,false);assert.equal(m.settings.extension_sentry,'false','an explicit removal is kept');
 m=migrate({extension_crashes:'true',sentryToken:''});assert.equal(m.settings.extension_sentry,'false','no token: nothing to migrate');
 m=migrate({extension_crashes:'false',sentryToken:'x'});assert.equal(m.settings.extension_sentry,'false','«Крэши» removed: Sentry not added');
 assert.equal(feature.migrate({...feature.defaults},null),false,'new users: no settings file');

 // Offer: by name only, brings «Крэши»; catalog «connected» by the token alone.
 const list=offers.load();
 const pick=(t,settings={})=>{const d=offers.decide(offers.candidates(t,{offers:list,settings}));return d?.one?[d.one.offer.id]:d?.tie?.map(r=>r.offer.id)||[];};
 for(const p of ['что в Sentry за сутки','покажи Sentry','топ крэшей в сентри'])assert.deepEqual(pick(p),['sentry'],p);
 for(const p of ['ANR в Sentry','какие крэши за неделю','крэши в Google Play'])assert.ok(!pick(p).includes('sentry'),p);
 assert.deepEqual(offer.also,['crashes']);assert.equal(offer.connect,'settings');
 assert.equal(offer.connected({extension_sentry:'true',sentryToken:'t',sentryOrg:'o'}),true);
 assert.equal(offer.ready({extension_sentry:'true',sentryToken:'t',sentryOrg:'o'}),false,'offered again while «Крэши» is missing');
 assert.equal(offer.ready({extension_sentry:'true',sentryToken:'t',sentryOrg:'o',extension_crashes:'true'}),true);
 console.log('Sentry: issue stream through «Крэши», card data, release/crash-free, filters, errors, resolve/reopen, settings ipc and validation, migration from «Крэши» and the offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
