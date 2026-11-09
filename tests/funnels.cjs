// «Воронки» (src/extensions/funnels): routing with near-misses (sales and marketing funnels, other meanings,
// metrics), the step resolution from event names, the funnel computation (exact from journeys, bucketed from SQL),
// then the two sources end to end against fakes on localhost:
//  - AppMetrica: the real metrics source (Reporting API event names through s.request, the Logs API exports through
//    raw fetch with a 202 «preparing» answer first) → the card with steps, drop-off, medians and segments;
//  - SQL: a fake connection whose schema has an events table → the events query and the funnel query are shown
//    (state pending), pass the SQL app's validator, and run only through ipc `run`; the result is bucketed.
// Not added → null; added without a source → the question; «Сохранить воронку» per project; ask for a bare «воронка».
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/funnels/feature.cjs');
const query=require('../src/extensions/funnels/query.cjs');
const steps=require('../src/extensions/funnels/steps.cjs');
const compute=require('../src/extensions/funnels/compute.cjs');
const fsql=require('../src/extensions/funnels/sql.cjs');
const offer=require('../src/extensions/funnels/offer.cjs');
const client=require('../src/extensions/appmetrica/client.cjs');
const V=require('../src/extensions/sql/validate.cjs');

// --- Routing -------------------------------------------------------------------------------------------------------
for(const t of ['воронка туториала','где отваливаются игроки на онбординге','воронка от установки до первой покупки','Воронка: tutorial_start → level_3 → purchase по платформам',
 'на каком шаге туториала уходят игроки','конверсия по шагам туториала','покажи воронку онбординга по странам за 14 дней','воронка онбординга для игроков с лендинга'])assert.equal(query.about(t),'funnel',t);
for(const t of ['воронка продаж','воронка лидов в CRM','маркетинговая воронка сайта','воронка от взрыва','кухонная воронка','что такое воронка','как построить воронку',
 'DAU за неделю','ретеншн D1 D7 D30','где мы теряем время','воронка email-рассылки','воронка сделок в амоцрм','купи воронку для кухни'])assert.equal(query.about(t),null,t);
assert.equal(query.about('покажи воронку'),'ask');
assert.equal(query.about('мои воронки'),'list');
assert.equal(query.about('воронка «Магазин»',{saved:[{name:'Магазин'}]}),'funnel');
assert.deepEqual(query.parse('воронка: install → tutorial_start, tutorial_complete -> purchase').steps,['install','tutorial_start','tutorial_complete','purchase']);
assert.equal(query.parse('воронка туториала по странам за 2 недели').segment,'country');
assert.equal(query.parse('воронка туториала по странам за 2 недели').days,14);
assert.equal(query.parse('воронка от установки до первой покупки').preset,'purchase');
// The offer: own phrases, marketing near-misses avoided.
const offers=require('../src/features/extension-offers.cjs');
const offered=t=>offers.candidates(t,{offers:[offer],settings:{}}).map(r=>r.offer.id);
for(const t of ['воронка туториала','где отваливаются игроки на онбординге','воронка от установки до первой покупки'])assert.deepEqual(offered(t),['funnels'],t);
for(const t of ['воронка продаж за месяц','покажи воронку лидов','где мы теряем время','DAU за неделю'])assert.deepEqual(offered(t),[],t);

// --- Steps -----------------------------------------------------------------------------------------------------------
const EVENTS=[{name:'session_start',users:9000},{name:'tutorial_complete',users:4000},{name:'tutorial_step_2',users:5200},{name:'tutorial_start',users:7600},{name:'tutorial_step_1',users:6900},
 {name:'level_up_3',users:3000},{name:'purchase',users:300},{name:'first_purchase',users:210},{name:'shop_open',users:2500}];
assert.deepEqual(steps.resolve('tutorial',EVENTS,{install:true}).steps.map(x=>x.event),['$install','tutorial_start','tutorial_step_1','tutorial_step_2','tutorial_complete']);
assert.deepEqual(steps.resolve('tutorial',EVENTS).steps.map(x=>x.event),['tutorial_start','tutorial_step_1','tutorial_step_2','tutorial_complete']);
assert.deepEqual(steps.resolve('purchase',EVENTS,{install:true}).steps.map(x=>x.event),['$install','tutorial_complete','first_purchase']);
assert.match(steps.resolve('purchase',EVENTS).missing,/установки/);
assert.match(steps.resolve('tutorial',[{name:'battle_start'}]).missing,/туториала/);
assert.deepEqual(steps.explicit(['install','tutorial_start','Purchase'],EVENTS,{install:true}).steps.map(x=>x.event),['$install','tutorial_start','purchase']);
assert.match(steps.explicit(['tutorial_start','nope'],EVENTS).missing,/nope/);

// --- Compute: journeys (exact) ------------------------------------------------------------------------------------------
const T=d=>Date.parse(d+'T00:00:00Z');
const list=[{event:'a',label:'a'},{event:'b',label:'b'},{event:'c',label:'c'}];
const jr=[
 {user:'1',platform:'ios',country:'US',version:'1.2',times:{a:[T('2026-11-01')],b:[T('2026-11-01')+60e3],c:[T('2026-11-01')+180e3]}},
 {user:'2',platform:'android',country:'BR',version:'1.2',times:{a:[T('2026-11-02')],b:[T('2026-11-02')+120e3]}},
 // b before a does not count; the later b does.
 {user:'3',platform:'android',country:'BR',version:'1.1',times:{a:[T('2026-11-03')],b:[T('2026-11-02'),T('2026-11-03')+30e3],c:[T('2026-11-01')]}},
 // entered before the period: not in the funnel.
 {user:'4',platform:'ios',country:'US',version:'1.2',times:{a:[T('2026-10-01')],b:[T('2026-11-02')]}},
 {user:'5',platform:'ios',country:'DE',version:'1.2',times:{a:[T('2026-11-05')]}}];
const r1=compute.fromJourneys(jr,list,{from:'2026-11-01',to:'2026-11-08'});
assert.deepEqual(r1.steps.map(s=>s.users),[4,3,1]);
assert.deepEqual(r1.steps.map(s=>s.lost),[0,1,2]);
assert.equal(r1.steps[1].fromPrev,0.75);assert.equal(r1.conversion,0.25);
assert.equal(r1.worst,2,'b → c loses two thirds');
assert.equal(r1.times[0].median,60);assert.equal(r1.times[0].exact,true);assert.equal(r1.times[1].median,120);
assert.deepEqual(r1.segments.platform.map(x=>[x.value,x.users]),[['android',[2,2,0]],['ios',[2,1,1]]]);
assert.deepEqual(r1.segments.country.find(x=>x.value==='BR').users,[2,2,0]);
// --- Compute: buckets (SQL) -----------------------------------------------------------------------------------------------
const r2=compute.fromBuckets([{seg:'__all__',step:1,bucket:-1,users:1000},{seg:'__all__',step:2,bucket:2,users:400},{seg:'__all__',step:2,bucket:3,users:300},{seg:'__all__',step:3,bucket:6,users:200},
 {seg:'ios',step:1,bucket:-1,users:600},{seg:'ios',step:2,bucket:-1,users:500},{seg:'ios',step:3,bucket:-1,users:150},{seg:'android',step:1,bucket:-1,users:400},{seg:'android',step:2,bucket:-1,users:200},{seg:'android',step:3,bucket:-1,users:50}],list,{dimension:'platform'});
assert.deepEqual(r2.steps.map(s=>s.users),[1000,700,200]);
assert.deepEqual(r2.times[0].range,{lo:30,hi:60},'median of 700 falls in the 30–60 s bucket');
assert.equal(r2.times[0].exact,false);
assert.deepEqual(r2.segments.platform.map(x=>x.value),['ios','android']);
assert.equal(r2.segments.platform[0].conversion,0.25);

// --- SQL text --------------------------------------------------------------------------------------------------------------
const SCHEMA={tables:[{name:'analytics.users',columns:[{name:'user_id',type:'String'},{name:'created_at',type:'DateTime'}]},
 {name:'analytics.events',columns:[{name:'user_id',type:'String'},{name:'event_name',type:'LowCardinality(String)'},{name:'event_time',type:'DateTime'},{name:'platform',type:'String'},{name:'country',type:'FixedString(2)'},{name:'app_version',type:'String'}]}]};
const table=fsql.detect(SCHEMA);
assert.equal(table.table,'analytics.events');assert.equal(table.platform,'platform');assert.equal(table.version,'app_version');
assert.equal(fsql.detect({tables:[{name:'fb.events_20261101',columns:[{name:'user_pseudo_id',type:'STRING'},{name:'event_name',type:'STRING'},{name:'event_timestamp',type:'INT64'}]}]}).timeKind,'micros');
for(const dialect of ['clickhouse','postgres','bigquery','mysql']){
 const sql=fsql.funnel(table,{dialect,from:'2026-10-10',to:'2026-11-08',steps:list,segment:'country'});
 const checked=V.check(sql,{dialect,maxRows:5000});
 assert.match(checked.sql,/LIMIT 5000/i,dialect);
 assert.deepEqual(V.tables(checked.sql,dialect).map(x=>x.name),['events'],dialect);
 V.check(fsql.events(table,{dialect,from:'2026-10-10',to:'2026-11-08'}),{dialect,maxRows:500});
}
assert.throws(()=>fsql.funnel(table,{dialect:'postgres',from:'2026-10-10',to:'2026-11-08',steps:[{event:"a'; DROP TABLE x; --"},{event:'b'}]}),/недопустимые символы/);

// --- End to end: AppMetrica -----------------------------------------------------------------------------------------------------
const calls=[];
const NOW=Date.parse('2026-11-09T10:00:00Z');
const day=n=>new Date(T('2026-10-10')+n*86400000);
// 600 devices over the 30 days; the tutorial loses players at step 2; iOS converts better.
const devices=[];
for(let i=0;i<600;i++){
 const ios=i%3===0,at=day(i%30).getTime()+((i*7919)%80000)*1000;
 const d={id:'dev'+i,os:ios?'iOS':'android',country:['US','BR','DE','RU'][i%4],version:i%5?'1.4.2':'1.4.1',install:at,events:{}};
 const go=(name,ok,gap)=>{if(!ok)return false;const prev=Math.max(d.install,...Object.values(d.events).flat());d.events[name]=[prev+gap*1000];return true;};
 go('tutorial_start',i%10!==9,20)&&go('tutorial_step_1',i%10<8,45)&&go('tutorial_step_2',i%10<(ios?7:5),90)&&go('tutorial_complete',i%10<(ios?6:4),40);
 devices.push(d);
}
let prepared=0;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x'),q=Object.fromEntries(u.searchParams);
 calls.push({path:u.pathname,query:q,auth:req.headers.authorization});
 const send=(code,b)=>{res.writeHead(code,{'Content-Type':typeof b==='string'?'text/plain':'application/json'});res.end(typeof b==='string'?b:JSON.stringify(b));};
 if(req.headers.authorization!=='OAuth test-token')return send(401,{errors:[{message:'Invalid token'}]});
 if(u.pathname==='/stat/v1/data'&&q.dimensions==='ym:ce2:eventLabel'){
  const names=['session_start','tutorial_start','tutorial_step_1','tutorial_step_2','tutorial_complete','shop_open','purchase'];
  return send(200,{data:names.map(n=>({dimensions:[{name:n}],metrics:[devices.filter(d=>d.events[n]).length||100]}))});
 }
 if(u.pathname.startsWith('/logs/v1/export/')){
  if(prepared++<1)return send(202,'Wait for result.');
  const since=Date.parse(q.date_since.replace(' ','T')+'Z'),until=Date.parse(q.date_until.replace(' ','T')+'Z');
  if(u.pathname.endsWith('/installations.json'))return send(200,{data:devices.filter(d=>d.install>=since&&d.install<=until).map(d=>({appmetrica_device_id:d.id,install_timestamp:Math.floor(d.install/1000),os_name:d.os,country_iso_code:d.country,app_version_name:d.version}))});
  return send(200,{data:devices.filter(d=>d.events[q.event_name]).map(d=>({appmetrica_device_id:d.id,event_name:q.event_name,event_timestamp:Math.floor(d.events[q.event_name][0]/1000),os_name:d.os,country_iso_code:d.country,app_version_name:d.version})).filter(r=>r.event_timestamp*1000>=since&&r.event_timestamp*1000<=until)});
 }
 send(404,{errors:[{message:'unknown'}]});
});
let base='';
async function request(url,{timeoutMs,headers={},...o}={}){
 const u=new URL(url);
 const r=await fetch(base+u.pathname+u.search,{...o,headers});
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.json();
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-funnels-'));
function services(settings){
 const topic={id:'t',title:'Чат',projectId:'bw',messages:[]};
 return {settings:{extension_funnels:'true',...settings},request,dataRoot:root,requestProgress:{report(){}},
  dialogue:{state:{topics:[topic],projects:[{id:'bw',name:'Bunker Wars'}],activeProjectId:'bw'},active:()=>topic,persist(){},rememberAction(c,t){topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};
}
const AM={extension_appmetrica:'true',appmetricaToken:'test-token',appmetricaApps:'4242'};

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 Object.assign(client.deps,{base,wait:async()=>{},pause:0});
 app.deps.now=()=>NOW;
 try{
  // Not added → nobody; added, no source → the question.
  assert.equal(await app.turn({...services({}),settings:{extension_funnels:'false'}},'воронка туториала'),null);
  assert.equal(await app.turn(services({}),'воронка продаж'),null);
  const none=await app.turn(services({}),'воронка туториала');
  assert.equal(none.question,true);assert.match(none.text,/AppMetrica/);assert.match(none.text,/SQL по словам/);
  // A bare «покажи воронку» asks which one (before any request).
  await assert.rejects(()=>app.turn(services(AM),'покажи воронку'),e=>e.name==='InputRequired'&&e.spec.options.includes('Туториал'));

  // AppMetrica: event names → steps → Logs API (202 first) → the card.
  const s=services(AM);
  const r=await app.turn(s,'воронка туториала по платформам');
  const card=r.extensionData.funnelCard;
  assert.equal(card.state,'done');assert.equal(card.title,'Туториал');assert.equal(card.source.name,'AppMetrica');
  assert.deepEqual(card.steps.map(x=>x.event),['$install','tutorial_start','tutorial_step_1','tutorial_step_2','tutorial_complete']);
  assert.deepEqual(card.period,{from:'2026-10-10',to:'2026-11-08',days:30});
  assert.equal(card.result.steps[0].users,600);
  assert.equal(card.result.steps[1].users,540);
  assert.equal(card.result.steps[2].users,480);
  assert.equal(card.result.steps[3].users,devices.filter(d=>d.events.tutorial_step_2).length);
  assert.equal(card.result.steps[4].users,devices.filter(d=>d.events.tutorial_complete).length);
  assert.equal(card.result.worst,3,'step 1 → step 2 is the main drop');
  assert.equal(card.result.times[0].median,20);assert.equal(card.result.times[2].median,90);
  assert.deepEqual(card.result.segments.platform.map(x=>x.value),['android','ios']);
  assert.ok(card.result.segments.platform.find(x=>x.value==='ios').conversion>card.result.segments.platform.find(x=>x.value==='android').conversion);
  assert.equal(card.result.segments.country.length,4);
  assert.match(r.text,/«Туториал» за 30 дней: начали 600 игроков, до шага «tutorial_complete» дошли \d+ \(\d+(,\d)?%\)\. Больше всего уходят между «tutorial_step_1» и «tutorial_step_2»: −\d+(,\d)?% \(\d+ игрок\p{L}*\), медиана времени 1 мин 30 с\./u);
  const logs=calls.filter(c=>c.path.startsWith('/logs/'));
  assert.ok(logs.some(c=>c.path.endsWith('/installations.json')&&c.query.application_id==='4242'&&c.query.date_since==='2026-10-10 00:00:00'&&c.query.date_until==='2026-11-08 23:59:59'));
  assert.ok(logs.some(c=>c.query.event_name==='tutorial_step_2'&&/appmetrica_device_id/.test(c.query.fields)));
  assert.equal(calls.find(c=>c.query.dimensions==='ym:ce2:eventLabel').query.date1,'2026-10-10');
  // Explicit steps; an unknown event is a question with the real candidates.
  const own=(await app.turn(services(AM),'воронка: install → tutorial_start → tutorial_complete')).extensionData.funnelCard;
  assert.deepEqual(own.steps.map(x=>x.event),['$install','tutorial_start','tutorial_complete']);assert.equal(own.title,'Своя воронка');
  await assert.rejects(()=>app.turn(services(AM),'воронка: tutorial_start → boss_killed'),e=>e.name==='InputRequired'&&/boss_killed/.test(e.message));
  // A Logs API that keeps preparing: told plainly.
  const before=client.deps.tries;client.deps.tries=1;prepared=-5;
  const wait=await app.turn(services(AM),'воронка туториала');
  assert.equal(wait.error,true);assert.match(wait.text,/готовит выгрузку логов/);
  client.deps.tries=before;prepared=1;
  // Save per project, then «мои воронки» and the saved funnel by name.
  s.dialogue.state.topics[0].messages.at(-1);
  const saved=app.save(s,card.id);
  assert.deepEqual(saved,{name:'Туториал',project:'Bunker Wars'});
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'funnels.json'),'utf8')).projects.bw[0].steps.length,5);
  assert.match((await app.turn(services(AM),'мои воронки')).text,/«Туториал» \(Установка → tutorial_start/);
  const again=(await app.turn(services(AM),'воронка «Туториал»')).extensionData.funnelCard;
  assert.equal(again.saved,true);assert.deepEqual(again.steps.map(x=>x.event),card.steps.map(x=>x.event));

  // --- SQL source ---------------------------------------------------------------------------------------------------------
  const ran=[];
  const conn={id:'ch',name:'Аналитика',kind:'clickhouse',dialect:'clickhouse',label:'Аналитика · ClickHouse'};
  app.deps.metrics=[];
  app.deps.sql={all:async()=>[conn],engine:()=>({schema:async()=>SCHEMA,estimate:async()=>({kind:'rows',value:2.4e6}),
   run:async(sql)=>{ran.push(sql);
    if(/AS event_name/.test(sql))return {columns:[{name:'event_name'},{name:'players'}],rows:EVENTS.map(e=>[e.name,e.users])};
    return {columns:[{name:'seg'},{name:'step'},{name:'bucket'},{name:'users'}],rows:[['__all__',1,-1,7600],['__all__',2,1,4000],['__all__',2,2,2900],['__all__',3,3,5200],['__all__',4,4,4000],['ios',1,-1,3000],['ios',2,-1,2800],['ios',3,-1,2200],['ios',4,-1,1800],['android',1,-1,4600],['android',2,-1,4100],['android',3,-1,3000],['android',4,-1,2200]]};}})};
  const q=services({extension_sql:'true'});
  const first=(await app.turn(q,'воронка туториала')).extensionData.funnelCard;
  assert.equal(first.state,'pending');assert.equal(first.phase,'events');assert.equal(ran.length,0,'nothing runs before «Выполнить»');
  assert.match(first.sql,/^SELECT `event_name` AS event_name/);assert.match(first.sql,/LIMIT 300/);
  assert.deepEqual(first.estimate,{kind:'rows',value:2.4e6});
  const second=await app.run(q,first.id);
  assert.equal(second.state,'pending');assert.equal(second.phase,'funnel');assert.equal(ran.length,1);
  assert.deepEqual(second.steps.map(x=>x.event),['tutorial_start','tutorial_step_1','tutorial_step_2','tutorial_complete']);
  assert.match(second.sql,/minIfOrNull/);assert.match(second.sql,/LIMIT 5000/);assert.equal(second.segment,'platform');
  // The stored card was replaced: a tampered page cannot run its own SQL.
  const stored=q.dialogue.state.topics[0].messages.at(-1).extensionData.funnelCard;
  assert.equal(stored.phase,'funnel');
  const done=await app.run(q,first.id);
  assert.equal(done.state,'done');assert.equal(ran.length,2);
  assert.deepEqual(done.result.steps.map(x=>x.users),[7600,6900,5200,4000]);
  assert.deepEqual(done.result.times[0].range,{lo:10,hi:30});
  assert.deepEqual(done.result.segments.platform.map(x=>x.value),['android','ios']);
  await assert.rejects(()=>app.run(q,first.id),/уже выполнен/);
  await assert.rejects(()=>app.run(q,'nope'),/не найдена/);
  // Explicit steps by country go straight to the funnel query.
  const byCountry=(await app.turn(q,'воронка: tutorial_start → tutorial_complete по странам')).extensionData.funnelCard;
  assert.equal(byCountry.phase,'funnel');assert.equal(byCountry.segment,'country');assert.match(byCountry.sql,/`country`/);
  // A failing run is reported on the card (and in the notification center), not thrown.
  app.deps.sql.engine=()=>({run:async()=>{throw Error('Code: 60. Table analytics.events does not exist');},estimate:async()=>({kind:'unknown'}),schema:async()=>SCHEMA});
  const failed=await app.run(q,byCountry.id);
  assert.equal(failed.state,'error');assert.match(failed.error,/does not exist/);
  console.log('Funnels: routing and marketing near-misses, offer, step presets, exact and bucketed computation, SQL for four dialects through the validator, AppMetrica Logs API (202 then data) card, explicit steps, saved per project, SQL pending → events → funnel only on «Выполнить», errors passed');
 }finally{server.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
