// Google Play crash source (Android vitals through the Play Developer Reporting API): the errorIssues:search request
// (UTC hour-aligned interval, `errorIssueType = CRASH`, order, page size), the errorCountMetricSet daily counts per
// issue (`reportType = CRASH`, issueId dimension, four weeks before the period), issue parsing (cause, location,
// reports, users, versions, Play Console link, «новый»), app choice, versionCode filter, iOS skipped, crash-free users
// from crashRateMetricSet, routing of «крэши в Google Play» away from the ANR card, and the offer.
// No network: Google is stubbed through s.request.
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const source=require('../src/extensions/google-play/crash-source.cjs');
const crashes=require('../src/extensions/crashes/feature.cjs');
const registry=require('../src/features/crash-sources.cjs');
const offer=require('../src/extensions/google-play/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');

const NOW=new Date('2026-11-08T10:30:00Z');
const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const credential=JSON.stringify({type:'service_account',client_email:'play-crashes@test.iam.gserviceaccount.com',private_key:key});
const ROOT='https://playdeveloperreporting.googleapis.com/v1beta1/';
const ymd=s=>{const [y,m,d]=s.split('-').map(Number);return {year:y,month:m,day:d,timeZone:{id:'America/Los_Angeles'}};};
const countRow=(day,issueId,n)=>({startTime:ymd(day),dimensions:[{dimension:'issueId',stringValue:issueId}],metrics:[{metric:'errorReportCount',decimalValue:{value:String(n)}},{metric:'distinctUsers',decimalValue:{value:String(n)}}]});
const ISSUES=[
 {name:'apps/com.studio.game/errorIssues/aaa111',type:'CRASH',cause:'java.lang.IllegalStateException',location:'com.studio.game.Billing.onPurchase',errorReportCount:'420',distinctUsers:'130',
  lastErrorReportTime:'2026-11-08T07:00:00Z',firstAppVersion:{versionCode:'10420'},lastAppVersion:{versionCode:'10422'},issueUri:'https://play.google.com/console/developers/1/app/2/vitals/crashes/aaa111/details'},
 {name:'apps/com.studio.game/errorIssues/bbb222',type:'CRASH',cause:'SIGSEGV',location:'libunity.so',errorReportCount:'95',distinctUsers:'60',lastErrorReportTime:'2026-11-08T05:00:00Z',
  firstAppVersion:{versionCode:'10422'},lastAppVersion:{versionCode:'10422'},issueUri:'https://play.google.com/console/developers/1/app/2/vitals/crashes/bbb222/details'},
 {name:'apps/com.studio.game/errorIssues/ccc333',type:'ANR',cause:'Input dispatching timed out',errorReportCount:'50',distinctUsers:'40'}
];
function services(over={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[];
 const routes={
  'https://oauth2.googleapis.com/token':()=>({access_token:'play-token',expires_in:3600}),
  'apps:search':()=>({apps:[{name:'apps/com.studio.game',packageName:'com.studio.game',displayName:'Bunker Wars'},{name:'apps/com.studio.other',packageName:'com.studio.other',displayName:'Other Game'}]}),
  'errorCountMetricSet':()=>({freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:ymd('2026-11-08')}]}}),
  'errorCountMetricSet:query':(app)=>app==='apps/com.studio.game'?{rows:[countRow('2026-10-20','aaa111',10),countRow('2026-11-06','aaa111',150),countRow('2026-11-07','aaa111',200),countRow('2026-11-05','bbb222',30),countRow('2026-11-07','bbb222',65)]}:{rows:[]},
  'errorIssues:search':(app)=>app==='apps/com.studio.game'?{errorIssues:ISSUES}:{errorIssues:[]},
  'crashRateMetricSet':()=>({freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:ymd('2026-11-08')}]}}),
  'crashRateMetricSet:query':()=>({rows:[{startTime:ymd('2026-11-06'),metrics:[{metric:'crashRate',decimalValue:{value:'0.01'}},{metric:'distinctUsers',decimalValue:{value:'1000'}}]},{startTime:ymd('2026-11-07'),metrics:[{metric:'crashRate',decimalValue:{value:'0.004'}},{metric:'distinctUsers',decimalValue:{value:'3000'}}]}]}),
  ...over
 };
 const s={settings:{extension_crashes:'true',googlePlayCredential:credential,module_googleplay:'true'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){
   calls.push({url:new URL(url),options});
   if(url.startsWith('https://oauth2'))return routes[url]();
   assert.ok(url.startsWith(ROOT),'unexpected '+url);assert.equal(options.headers.Authorization,'Bearer play-token');
   const route=url.slice(ROOT.length).split('?')[0];
   const m=route.match(/^(apps\/[^/]+)\/(.+)$/);
   const name=m?m[2]:route;assert.ok(routes[name],'unexpected route '+route);
   return routes[name](m?.[1],options);
  }};
 s.crashSources=registry.create(s);
 return {s,topic,calls};
}
const find=(calls,suffix)=>calls.filter(c=>c.url.pathname.endsWith(suffix));

module.exports=(async()=>{
 let {s,calls}=services();
 assert.deepEqual(s.crashSources.list().map(x=>x.id),['google-play']);
 assert.equal(source.ready({googlePlayCredential:'x'}),true);assert.equal(source.ready({googlePlayCredential:'x',module_googleplay:'false'}),false);assert.equal(source.ready({}),false);
 // «крэши в Google Play за неделю»: a crash request (named source), read for every app (two).
 const week=await crashes.crashesTurn(s,'крэши в Google Play за неделю',NOW);
 const search=find(calls,'/errorIssues:search');
 assert.deepEqual(search.map(c=>c.url.pathname),['/v1beta1/apps/com.studio.game/errorIssues:search','/v1beta1/apps/com.studio.other/errorIssues:search']);
 const sp=search[0].url.searchParams;
 assert.equal(sp.get('filter'),'errorIssueType = CRASH');assert.equal(sp.get('orderBy'),'errorReportCount desc');assert.equal(sp.get('pageSize'),'100');
 assert.deepEqual(['year','month','day','hours'].map(k=>sp.get('interval.startTime.'+k)),['2026','11','1','10'],'UTC, hour-aligned start a week back');
 assert.deepEqual(['year','month','day','hours'].map(k=>sp.get('interval.endTime.'+k)),['2026','11','8','10'],'hour-aligned end, not in the future');
 assert.equal(sp.get('interval.startTime.minutes'),null);
 const counts=find(calls,'/errorCountMetricSet:query')[0];
 assert.equal(counts.options.method,'POST');
 const body=JSON.parse(counts.options.body);
 assert.deepEqual(body,{timelineSpec:{aggregationPeriod:'DAILY',startTime:{year:2026,month:10,day:4,timeZone:{id:'America/Los_Angeles'}},endTime:{year:2026,month:11,day:8,timeZone:{id:'America/Los_Angeles'}}},
  dimensions:['issueId'],metrics:['errorReportCount','distinctUsers'],filter:'reportType = CRASH',pageSize:10000},'four weeks before the period, up to the freshest day');
 assert.equal(find(calls,'/errorCountMetricSet').filter(c=>!c.options.method||c.options.method==='GET').length,2,'freshness read per app');
 const card=week.extensionData.crashCard;
 assert.deepEqual(card.sources.map(x=>[x.id,x.issues,x.events,x.canResolve,x.scope]),[['google-play',2,515,false,'Bunker Wars, Other Game']]);
 const [a,b]=card.issues;
 assert.deepEqual([a.id,a.title,a.culprit,a.level,a.events,a.users,a.platform,a.project,a.versions,a.lastSeen,a.canResolve],
  ['aaa111','java.lang.IllegalStateException','com.studio.game.Billing.onPurchase','fatal',420,130,'Android','Bunker Wars',['versionCode 10420','versionCode 10422'],'2026-11-08T07:00:00.000Z',false]);
 assert.equal(a.url,'https://play.google.com/console/developers/1/app/2/vitals/crashes/aaa111/details');
 assert.equal(a.isNew,false,'reports four weeks ago: not new');assert.equal(a.firstSeen,'2026-10-20T00:00:00.000Z');
 assert.equal(b.isNew,true,'first report inside the week');assert.equal(b.firstSeen,'2026-11-05T00:00:00.000Z');
 assert.ok(!card.issues.some(i=>i.title.includes('Input dispatching')),'ANR clusters are never crashes');
 assert.deepEqual(card.chart.bySource[0].values.slice(-4),[30,150,265,0],'Play days end at the freshest complete day');
 assert.equal(a.spark.at(-2),200);
 // An app named in the request: only it.
 ({s,calls}=services());await crashes.crashesTurn(s,'крэши Bunker Wars в Google Play за сутки',NOW);
 assert.deepEqual(find(calls,'/errorIssues:search').map(c=>c.url.pathname),['/v1beta1/apps/com.studio.game/errorIssues:search']);
 // A versionCode: filters every call; crash-free users = 1 − weighted crash rate.
 ({s,calls}=services());
 const vc=await crashes.crashesTurn(s,'крэши в Google Play versionCode 10422 за неделю',NOW);
 assert.equal(find(calls,'/errorIssues:search')[0].url.searchParams.get('filter'),'errorIssueType = CRASH AND versionCode = 10422');
 assert.equal(JSON.parse(find(calls,'/errorCountMetricSet:query')[0].options.body).filter,'reportType = CRASH AND versionCode = 10422');
 const rate=JSON.parse(find(calls,'/crashRateMetricSet:query')[0].options.body);
 assert.deepEqual(rate.metrics,['crashRate','distinctUsers']);assert.equal(rate.filter,'versionCode = 10422');assert.equal(rate.timelineSpec.aggregationPeriod,'DAILY');
 const cf=vc.extensionData.crashCard.sources[0].crashFree;
 assert.equal(cf.sessions,null);assert.ok(Math.abs(cf.users-(1-(0.01*1000+0.004*3000)/4000))<1e-9);
 // A version name is not a versionCode: a note, nothing read.
 ({s,calls}=services());
 const named=await crashes.crashesTurn(s,'крэши в Google Play после релиза 1.4.2',NOW);
 assert.equal(named.question,true);assert.match(named.text,/versionCode \(число\), а не по имени версии «1\.4\.2»/);
 assert.equal(find(calls,'/errorIssues:search').length,0);
 // iOS: Google Play has nothing to say and says nothing.
 ({s,calls}=services());
 assert.deepEqual(await source.issues(s,{platform:'iOS',period:{start:NOW.toISOString(),end:NOW.toISOString()}}),{issues:[]});
 assert.equal(calls.length,0);
 // No data yet (no freshness): issues still listed, a note says the daily chart is missing.
 ({s,calls}=services({'errorCountMetricSet':()=>({freshnessInfo:{freshnesses:[]}})}));
 const stale=await crashes.crashesTurn(s,'крэши в Google Play за неделю',NOW);
 assert.equal(find(calls,'/errorCountMetricSet:query').length,0);assert.equal(stale.extensionData.crashCard.totals.issues,2);
 assert.match(stale.extensionData.crashCard.notes[0].text,/пока не сообщает дневные данные для Bunker Wars, Other Game/);
 // Errors keep their words; a 403 says what access is missing (src/extensions/google-play/client.cjs explain).
 ({s,calls}=services({'apps:search':()=>{throw Object.assign(Error('Сервис вернул HTTP 403'),{status:403});}}));
 const denied=await crashes.turn(s,'крэши в Google Play за неделю');
 assert.equal(denied.error,true);assert.match(denied.text,/^Крэши · У аккаунта нет доступа к отчётам Google Play/);

 // Routing: Google Play with crashes is not the ANR card; ANR stays there.
 const dialogue=require('../src/dialogue.cjs');
 assert.notEqual(dialogue.intent('крэши в Google Play за неделю'),'anr');assert.equal(dialogue.intent('ANR в Google Play за неделю'),'anr');assert.equal(dialogue.intent('что в Google Play за неделю'),'anr');
 const access=require('../src/service-access.cjs');
 assert.deepEqual(access.detect('покажи крэши в Google Play',null),[]);assert.deepEqual(access.detect('покажи ANR в Google Play',null),['googleplay']);assert.deepEqual(access.detect('покажи данные Google Play',null),['googleplay']);
 // Offer: crashes named with Google Play; ANR and reviews are someone else's; connected in the service settings.
 const list=offers.load();
 const pick=t=>{const d=offers.decide(offers.candidates(t,{offers:list,settings:{}}));return d?.one?[d.one.offer.id]:d?.tie?.map(r=>r.offer.id)||[];};
 for(const p of ['крэши в Google Play','крэши в гугл плей за неделю','покажи падения в Google Play','Google Play крэши за сутки'])assert.deepEqual(pick(p),['google-play'],p);
 for(const p of ['ANR в Google Play','отзывы в Google Play','зависания в гугл плей'])assert.ok(!pick(p).includes('google-play'),p);
 assert.equal(offer.service,'googleplay');assert.deepEqual(offer.also,['crashes']);
 assert.equal(offer.ready({googlePlayCredential:'x'}),false);assert.equal(offer.ready({googlePlayCredential:'x',extension_crashes:'true'}),true);
 console.log('Google Play crashes: errorIssues:search and errorCountMetricSet requests, parsing, new marks, app choice, versionCode and crash-free users, iOS skip, stale data, errors, routing away from ANR and the offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
