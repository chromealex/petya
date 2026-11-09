// «Firebase Crashlytics» crash source (Crashlytics BigQuery export): the GoogleSQL it builds (named columns only,
// FATAL only, event_timestamp window, UNION ALL with realtime twins, parameters for every value), the jobs.query
// request (NAMED parameters, maximumBytesBilled, int64 timestamps, location), waiting through getQueryResults, row
// parsing (nested arrays and structs), the card data through «Крэши», table discovery and platform choice, the
// dry-run estimate for the settings check, errors (bytes limit, permissions, missing export), settings validation,
// key import through ipc, and the offer with Firebase near-misses. No network: Google is stubbed through s.request.
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const bq=require('../src/extensions/crashlytics/client.cjs');
const source=require('../src/extensions/crashlytics/crash-source.cjs');
const feature=require('../src/extensions/crashlytics/feature.cjs');
const offer=require('../src/extensions/crashlytics/offer.cjs');
const crashes=require('../src/extensions/crashes/feature.cjs');
const registry=require('../src/features/crash-sources.cjs');
const offers=require('../src/features/extension-offers.cjs');

const NOW=new Date('2026-11-08T10:00:00Z');
const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const credential=JSON.stringify({type:'service_account',project_id:'bunker-wars-1234',client_email:'crashlytics-reader@bunker-wars-1234.iam.gserviceaccount.com',private_key:key});
const ROOT='https://bigquery.googleapis.com/bigquery/v2';
const micros=iso=>String(Date.parse(iso)*1000);
// The result schema of the issues query and two rows in BigQuery's JSON encoding.
const SCHEMA={fields:[{name:'app',type:'STRING'},{name:'platform',type:'STRING'},{name:'bundle',type:'STRING'},{name:'issue_id',type:'STRING'},{name:'title',type:'STRING'},{name:'subtitle',type:'STRING'},{name:'culprit',type:'STRING'},
 {name:'events',type:'INTEGER'},{name:'users',type:'INTEGER'},{name:'first_seen',type:'TIMESTAMP'},{name:'last_seen',type:'TIMESTAMP'},{name:'versions',type:'STRING',mode:'REPEATED'},
 {name:'daily',type:'RECORD',mode:'REPEATED',fields:[{name:'day',type:'STRING'},{name:'n',type:'INTEGER'}]},{name:'total',type:'INTEGER'}]};
const row=(values)=>({f:values.map(v=>({v}))});
const ROWS=[
 row(['com_studio_bunker_ANDROID','ANDROID','com.studio.bunker','7a1f','java.lang.NullPointerException','Attempt to invoke virtual method on a null object','BattleScene.kt:214','812','301',micros('2026-09-30T08:00:00Z'),micros('2026-11-08T09:12:00Z'),
  [{v:'2.3.0'},{v:'2.3.1'}],[{v:{f:[{v:'2026-11-06'},{v:'210'}]}},{v:{f:[{v:'2026-11-07'},{v:'260'}]}},{v:{f:[{v:'2026-11-08'},{v:'90'}]}}],'2']),
 row(['com_studio_bunker_IOS','IOS','com.studio.bunker','9c2e','UnityFramework','il2cpp::vm::Exception::Raise','UnityFramework:0',  '133','77',micros('2026-11-05T11:00:00Z'),micros('2026-11-08T08:00:00Z'),
  [{v:'2.3.1'}],[{v:{f:[{v:'2026-11-05'},{v:'40'}]}},{v:{f:[{v:'2026-11-07'},{v:'93'}]}}],'2'])
];
function services(over={},settings={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[],saved=[];
 const routes={
  token:()=>({access_token:'bq-token',expires_in:3600}),
  tables:()=>({tables:['com_studio_bunker_ANDROID','com_studio_bunker_IOS','com_studio_bunker_ANDROID_REALTIME','events_20261101','com_studio_bunker_ANDROID_backup'].map(tableId=>({tableReference:{projectId:'bunker-wars-1234',datasetId:'firebase_crashlytics',tableId}}))}),
  query:(body)=>body.dryRun?{jobComplete:true,totalBytesProcessed:'734003200'}:{jobComplete:false,jobReference:{projectId:'bunker-wars-1234',jobId:'job_abc',location:'EU'}},
  results:()=>({jobComplete:true,schema:SCHEMA,rows:ROWS,totalRows:'2',totalBytesProcessed:'734003200'}),
  ...over
 };
 const s={settings:{extension_crashes:'true',extension_crashlytics:'true',crashlyticsCredential:credential,crashlyticsProject:'bunker-wars-1234',crashlyticsDataset:'firebase_crashlytics',crashlyticsTables:'',crashlyticsRealtime:'true',crashlyticsLimitGb:'5',crashlyticsLocation:'',...settings},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  saveSettings(values,internal){saved.push([values,internal]);Object.assign(s.settings,values);if(values.clear_crashlyticsCredential)s.settings.crashlyticsCredential='';},
  async request(url,options={}){
   const u=new URL(url);calls.push({url:u,options,body:options.body&&u.hostname!=='oauth2.googleapis.com'?JSON.parse(options.body):null});
   if(u.hostname==='oauth2.googleapis.com'){const claims=JSON.parse(Buffer.from(new URLSearchParams(options.body).get('assertion').split('.')[1],'base64url'));assert.equal(claims.scope,'https://www.googleapis.com/auth/bigquery.readonly');return routes.token();}
   assert.ok(url.startsWith(ROOT),'unexpected '+url);assert.equal(options.headers.Authorization,'Bearer bq-token');
   const path=u.pathname.replace('/bigquery/v2','');
   if(path==='/projects/bunker-wars-1234/datasets/firebase_crashlytics/tables')return routes.tables();
   if(path==='/projects/bunker-wars-1234/queries'&&options.method==='POST')return routes.query(JSON.parse(options.body));
   if(path==='/projects/bunker-wars-1234/queries/job_abc')return routes.results(u);
   throw Error('unexpected route '+path);
  }};
 s.crashSources=registry.create(s);
 return {s,topic,calls,saved};
}
const queries=calls=>calls.filter(c=>c.url.pathname.endsWith('/queries')&&c.options.method==='POST');

module.exports=(async()=>{
 // --- SQL: named columns, FATAL only, the window, realtime twins, values as parameters ---
 const {sql,params}=bq.build({project:'bunker-wars-1234',dataset:'firebase_crashlytics',tables:['com_studio_bunker_ANDROID','com_studio_bunker_IOS'],realtime:['com_studio_bunker_ANDROID'],release:true});
 assert.doesNotMatch(sql,/SELECT\s+\*/i,'never SELECT *');
 assert.equal((sql.match(/FROM `bunker-wars-1234\.firebase_crashlytics\.com_studio_bunker_(ANDROID|IOS|ANDROID_REALTIME)`/g)||[]).length,3,'batch tables plus the realtime twin');
 assert.match(sql,/UNION ALL/);
 assert.equal((sql.match(/WHERE event_timestamp >= @from AND event_timestamp < @end AND error_type IN UNNEST\(@types\) AND application\.display_version = @version/g)||[]).length,3);
 assert.match(sql,/COUNT\(DISTINCT IF\(event_timestamp >= @start, event_id, NULL\)\) AS events/,'events in the period, deduplicated across batch and realtime');
 assert.match(sql,/COUNT\(DISTINCT IF\(event_timestamp >= @start, installation_uuid, NULL\)\) AS users/);
 assert.match(sql,/exceptions\[SAFE_OFFSET\(0\)\]\.type/,'Android titles from the exception');assert.match(sql,/COALESCE\(blame_frame\.file, blame_frame\.symbol\) AS title/,'Apple titles from the blamed frame');
 assert.match(sql,/ORDER BY i\.events DESC LIMIT 100/);
 assert.ok(!/2026|FATAL|1\.4\.2/.test(sql),'no values inside the SQL text');
 assert.deepEqual(params.map(p=>[p.name,p.parameterValue.value]),[['app0','com_studio_bunker_ANDROID'],['app1','com_studio_bunker_IOS']]);
 assert.deepEqual(bq.build({project:'bunker-wars-1234',dataset:'firebase_crashlytics',tables:['com_studio_bunker_IOS']}).sql.match(/application\.display_version = @version/),null,'no version filter without a release');
 for(const bad of [{tables:['x; DROP TABLE y']},{tables:['com_a_ANDROID`']},{dataset:'a.b'},{project:'Bad Project'},{tables:[]}])
  assert.throws(()=>bq.build({project:'bunker-wars-1234',dataset:'firebase_crashlytics',tables:['com_a_ANDROID'],...bad}),/неверно/);
 const p=bq.parameters({from:'2026-10-04T10:00:00Z',start:'2026-11-01T10:00:00Z',end:'2026-11-08T10:00:00Z',chart:'2026-10-26T00:00:00Z',version:'2.3.1'});
 assert.deepEqual(p.find(x=>x.name==='types'),{name:'types',parameterType:{type:'ARRAY',arrayType:{type:'STRING'}},parameterValue:{arrayValues:[{value:'FATAL'}]}},'fatal crashes only: no NON_FATAL, no ANR');
 assert.deepEqual(p.find(x=>x.name==='start'),{name:'start',parameterType:{type:'TIMESTAMP'},parameterValue:{value:'2026-11-01T10:00:00.000Z'}});
 assert.deepEqual(p.find(x=>x.name==='version'),{name:'version',parameterType:{type:'STRING'},parameterValue:{value:'2.3.1'}});
 // Row parsing: INTEGER strings, int64-microsecond TIMESTAMPs, repeated strings and repeated records.
 const parsed=bq.rows(SCHEMA,ROWS)[0];
 assert.deepEqual([parsed.events,parsed.users,parsed.first_seen,parsed.versions,parsed.daily[1]],[812,301,'2026-09-30T08:00:00.000Z',['2.3.0','2.3.1'],{day:'2026-11-07',n:260}]);
 assert.deepEqual(bq.rows({fields:[{name:'x',type:'STRING'}]},[{f:[{v:null}]}]),[{x:null}]);

 // --- Through «Крэши»: tables discovered, realtime twin read, jobs.query shape, polling, card data ---
 let {s,calls}=services();
 assert.deepEqual(s.crashSources.list().map(x=>x.id),['crashlytics']);
 const week=await crashes.crashesTurn(s,'что в Crashlytics за неделю',NOW); // fixed clock: the fixture's daily counts end on NOW
 const post=queries(calls);assert.equal(post.length,1);
 const body=post[0].body;
 assert.equal(body.useLegacySql,false);assert.equal(body.parameterMode,'NAMED');assert.equal(body.maximumBytesBilled,String(5*1024**3));
 assert.deepEqual(body.formatOptions,{useInt64Timestamp:true});assert.equal(body.dryRun,undefined);assert.equal(body.location,undefined);
 assert.equal((body.query.match(/FROM `/g)||[]).length,3,'Android, Android realtime, iOS');
 assert.deepEqual(body.queryParameters.map(x=>x.name),['app0','app1','from','start','end','chart','types']);
 const v=Object.fromEntries(body.queryParameters.map(x=>[x.name,x.parameterValue.value]));
 assert.equal(Date.parse(v.end)-Date.parse(v.start),7*86400000);assert.equal(Date.parse(v.start)-Date.parse(v.from),28*86400000,'four weeks back to tell new issues');
 const poll=calls.find(c=>c.url.pathname.endsWith('/queries/job_abc'));
 assert.equal(poll.url.searchParams.get('location'),'EU');assert.equal(poll.url.searchParams.get('formatOptions.useInt64Timestamp'),'true');
 const card=week.extensionData.crashCard;
 assert.deepEqual(card.sources.map(x=>[x.id,x.name,x.issues,x.events,x.users,x.canResolve,x.scope]),[['crashlytics','Firebase Crashlytics',2,945,378,false,'com.studio.bunker']]);
 const [android,ios]=card.issues;
 assert.deepEqual([android.id,android.title,android.culprit,android.platform,android.project,android.versions,android.isNew,android.level],['7a1f','java.lang.NullPointerException','BattleScene.kt:214','Android','com.studio.bunker',['2.3.0','2.3.1'],false,'fatal']);
 assert.equal(android.url,'https://console.firebase.google.com/project/bunker-wars-1234/crashlytics/app/android:com.studio.bunker/issues/7a1f');
 assert.equal(ios.platform,'iOS');assert.equal(ios.isNew,true);assert.equal(ios.url,'https://console.firebase.google.com/project/bunker-wars-1234/crashlytics/app/ios:com.studio.bunker/issues/9c2e');
 assert.deepEqual(android.spark.slice(-3),[210,260,90]);
 assert.equal(card.totals.fresh,1);assert.equal(card.sources[0].url,'https://console.firebase.google.com/project/bunker-wars-1234/crashlytics');
 // Platform: only that platform's tables; a release goes as a parameter; a named table list skips discovery.
 ({s,calls}=services({},{crashlyticsTables:'com_studio_bunker_IOS',crashlyticsRealtime:'false',crashlyticsLocation:'EU'}));
 await crashes.turn(s,'крэши в Firebase на iOS после релиза 2.3.1');
 assert.equal(calls.filter(c=>c.url.pathname.endsWith('/tables')).length,0,'chosen apps, no realtime: no table listing');
 const ios1=queries(calls)[0].body;
 assert.equal((ios1.query.match(/FROM `/g)||[]).length,1);assert.match(ios1.query,/com_studio_bunker_IOS`/);assert.equal(ios1.location,'EU');
 assert.equal(ios1.queryParameters.find(x=>x.name==='version').parameterValue.value,'2.3.1');
 ({s,calls}=services({},{crashlyticsTables:'com_studio_bunker_IOS',crashlyticsRealtime:'false'}));
 const android0=await crashes.crashesTurn(s,'крэши в Crashlytics на андроиде за неделю',NOW);
 assert.equal(queries(calls).length,0,'no Android table chosen: nothing queried');assert.equal(android0.extensionData.crashCard.totals.issues,0);
 // No export tables at all: the setup hint as a question.
 ({s,calls}=services({tables:()=>({tables:[{tableReference:{tableId:'events_20261101'}}]})}));
 const noExport=await crashes.turn(s,'что в Crashlytics за неделю');
 assert.equal(noExport.question,true);assert.match(noExport.text,/Включите выгрузку Crashlytics в BigQuery/);
 // Errors in words: the bytes limit, missing permissions, a missing dataset.
 const failWith=(status,detail)=>services({query:()=>{throw Object.assign(Error('Сервис вернул HTTP '+status),{status,detail});}});
 ({s}=failWith(400,'{"error":{"errors":[{"reason":"bytesBilledLimitExceeded","message":"Query exceeded limit for bytes billed: 5368709120."}]}}'));
 assert.match((await crashes.turn(s,'что в Crashlytics за неделю')).text,/больше лимита из настроек «Firebase Crashlytics»/);
 ({s}=failWith(403,'Access Denied'));assert.match((await crashes.turn(s,'что в Crashlytics за неделю')).text,/BigQuery Job User/);
 ({s}=failWith(400,'Unrecognized name: blame_frame at [3:120]'));assert.match((await crashes.turn(s,'что в Crashlytics за неделю')).text,/Схема выгрузки Crashlytics/);
 ({s}=services({tables:()=>{throw Object.assign(Error('Сервис вернул HTTP 404'),{status:404});}}));
 assert.match((await crashes.turn(s,'что в Crashlytics за неделю')).text,/выгрузка в BigQuery включена в Firebase/);
 // A query that never completes is reported, not waited on forever.
 ({s,calls}=services({results:()=>({jobComplete:false,jobReference:{jobId:'job_abc',location:'EU'}})}));
 assert.match((await crashes.turn(s,'что в Crashlytics за неделю')).text,/не успел выполнить запрос/);
 assert.equal(calls.filter(c=>c.url.pathname.endsWith('/queries/job_abc')).length,8);

 // --- Settings: dry-run estimate, tables, key import, validation ---
 ({s,calls}=services());
 const ipc=feature.setup(s).ipc;
 const estimate=await ipc.check();
 assert.deepEqual(estimate,{tables:['com_studio_bunker_ANDROID','com_studio_bunker_IOS'],bytes:734003200,limit:5*1024**3});
 const dry=queries(calls)[0].body;assert.equal(dry.dryRun,true);assert.equal(dry.maximumBytesBilled,String(5*1024**3));assert.doesNotMatch(dry.query,/SELECT\s+\*/i);
 assert.deepEqual(await ipc.tables(),{batch:['com_studio_bunker_ANDROID','com_studio_bunker_IOS'],realtime:['com_studio_bunker_ANDROID_REALTIME']});
 assert.equal(ipc.status().account,'crashlytics-reader@bunker-wars-1234.iam.gserviceaccount.com');
 let saved;({s,saved}=services({},{crashlyticsCredential:'',crashlyticsProject:''}));
 const own=feature.setup(s).ipc;
 await assert.rejects(own.check(),/Сначала загрузите ключ/);
 assert.throws(()=>own.saveKey('{"type":"authorized_user"}'),/JSON ключ сервисного аккаунта/);
 assert.throws(()=>own.saveKey('not json'),/JSON ключ/);
 const after=own.saveKey(credential);
 assert.equal(saved[0][1],true,'saved as an internal credential');assert.equal(JSON.parse(saved[0][0].crashlyticsCredential).client_email,'crashlytics-reader@bunker-wars-1234.iam.gserviceaccount.com');
 assert.equal(after.project,'bunker-wars-1234','project id taken from the key');assert.equal(after.hasKey,true);
 assert.equal(own.clearKey().hasKey,false);
 const next=v=>({crashlyticsProject:'',crashlyticsDataset:'',crashlyticsTables:'',crashlyticsRealtime:'',crashlyticsLimitGb:'',crashlyticsLocation:'',...v});
 const ok=next({crashlyticsProject:'bunker-wars-1234',crashlyticsTables:' com_a_ANDROID, com_a_IOS,com_a_IOS',crashlyticsLimitGb:'2,5',crashlyticsRealtime:'yes'});feature.validate(ok);
 assert.deepEqual([ok.crashlyticsDataset,ok.crashlyticsTables,ok.crashlyticsLimitGb,ok.crashlyticsRealtime],['firebase_crashlytics','com_a_ANDROID,com_a_IOS','2.5','false']);
 assert.throws(()=>feature.validate(next({crashlyticsProject:'Bunker Wars'})),/ID проекта/);
 assert.throws(()=>feature.validate(next({crashlyticsTables:'events_2026'})),/имена таблиц/);
 assert.throws(()=>feature.validate(next({crashlyticsDataset:'a-b'})),/Набор данных/);
 assert.throws(()=>feature.validate(next({crashlyticsLimitGb:'0'})),/Лимит/);
 assert.throws(()=>feature.validate(next({crashlyticsLocation:'eu west'})),/Регион/);
 assert.doesNotThrow(()=>feature.validate(next({crashlyticsProject:'example.com:bunker-wars'})));
 assert.deepEqual(feature.secrets,['crashlyticsCredential']);
 assert.equal(source.ready({crashlyticsCredential:'x',crashlyticsProject:'bunker-wars-1234'}),true);assert.equal(source.ready({crashlyticsCredential:'x'}),false);

 // --- Offer: Crashlytics by name or Firebase with crashes; other Firebase products are not this app ---
 const list=offers.load();
 const pick=t=>{const d=offers.decide(offers.candidates(t,{offers:list,settings:{}}));return d?.one?[d.one.offer.id]:d?.tie?.map(r=>r.offer.id)||[];};
 for(const p of ['что в Crashlytics за неделю','покажи крашлитикс','крэши в Firebase','Firebase крэши за сутки','топ крэшей в файрбейс'])assert.deepEqual(pick(p),['crashlytics'],p);
 for(const p of ['Firebase Analytics за неделю','настрой Firebase Remote Config','Firebase Auth не пускает','что в Firebase Cloud Messaging','ANR в Crashlytics','крэши Firebase Analytics'])assert.ok(!pick(p).includes('crashlytics'),p);
 assert.deepEqual(offer.also,['crashes']);
 assert.equal(offer.connected({extension_crashlytics:'true',crashlyticsCredential:'x',crashlyticsProject:'bunker-wars-1234'}),true);
 assert.equal(offer.ready({extension_crashlytics:'true',crashlyticsCredential:'x',crashlyticsProject:'bunker-wars-1234'}),false,'offered again while «Крэши» is missing');
 console.log('Crashlytics: SQL with parameters and no SELECT *, jobs.query with maximumBytesBilled, polling, row parsing, card data, platform/release/tables, errors, dry-run estimate, key import, validation and the offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
