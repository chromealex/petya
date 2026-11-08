// «Аномалии»: robust statistics (spikes, drops, weekly seasonality, low volume, missing data), dedupe of totals vs
// segments and across sources, mute rules, sensitivity, routing and near-misses, the not-installed / not-connected
// paths, the daily check with a fake clock (one chat + one notification, quiet days post nothing), the morning-brief
// section and the source readers over stubbed registries. No network, no model.
const assert=require('node:assert/strict');
const stats=require('../src/extensions/anomalies/stats.cjs');
const engine=require('../src/extensions/anomalies/engine.cjs');
const feeds=require('../src/extensions/anomalies/feeds.cjs');
const feature=require('../src/extensions/anomalies/feature.cjs');
const brief=require('../src/extensions/anomalies/brief.cjs');
const {shift}=stats;

// Fake clock: Tuesday 10 Nov 2026, 09:05 local. «Yesterday» is Monday 9 Nov.
const NOW=new Date(2026,10,10,9,5);
const Y='2026-11-09';
// A daily series ending yesterday: base(i) for 42 days, then `last` for yesterday (undefined = missing).
function days(n=42){const out=[];for(let i=n-1;i>=0;i--)out.push(shift(Y,-i));return out;}
function make(fn,{last,skip=[]}={}){const m=new Map();for(const d of days()){if(skip.includes(d))continue;m.set(d,fn(d));}if(last===undefined)m.delete(Y);else if(last!==null)m.set(Y,last);return m;}
const weekday=d=>new Date(d+'T12:00:00Z').getUTCDay();
const noise=d=>((Number(d.slice(8))*37)%11)-5;// deterministic ±5
const S=(key,kind,source,metric,points,extra={})=>({key,kind,source,sourceName:extra.sourceName||source,metric,unit:extra.unit||'users',segment:extra.segment||null,
 points:[...points].sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>typeof v==='object'?{date,...v}:{date,value:v})});
const detect=(series,o={})=>engine.detect(series,{days:[Y],yesterday:Y,...o});

// --- Robust statistics -------------------------------------------------------------------------------------------
assert.equal(stats.median([5,1,3]),3);assert.equal(stats.median([1,2,3,4]),2.5);assert.equal(stats.mad([1,2,3,4,100]),1);
{const b=stats.baseline(make(d=>1000,{last:1000}),Y);assert.equal(b.kind,'weekday');assert.deepEqual(b.points.map(p=>p.date),[shift(Y,-7),shift(Y,-14),shift(Y,-21),shift(Y,-28)]);}
// One odd week does not move the baseline (median, not mean).
{const pts=make(d=>1000+noise(d),{last:1000});pts.set(shift(Y,-14),5000);const r=stats.score(1000,stats.baseline(pts,Y),{k:3,effect:0.2},{volume:100});assert.equal(r.anomaly,false);assert(Math.abs(r.median-1000)<10);}

// Drop: installs −40% yesterday.
{const r=detect([S('m:new','metrics','appmetrica','new',make(d=>1000+noise(d),{last:600}),{sourceName:'AppMetrica'})]);
 assert.equal(r.items.length,1);const x=r.items[0];
 assert.equal(x.direction,'down');assert.equal(x.bad,true);assert.match(x.headline,/^Вчера установки −40%$/);assert.match(x.delta,/^−\d[\d\s ]* установ/);
 assert.equal(x.spark.values.length,35);assert.equal(x.spark.values.at(-1),600);assert.equal(x.spark.baseline.filter(Boolean).length,4);assert(x.spark.band[0]<1000&&x.spark.band[1]>1000);
 assert.equal(x.ask,'сколько новых игроков за 2 недели');}
// Spike: crashes ×3 is bad, «+N крэшей».
{const r=detect([S('c','crashes','sentry','events',make(d=>100+noise(d),{last:320}),{unit:'events',sourceName:'Sentry'})]);
 assert.equal(r.items.length,1);assert.equal(r.items[0].direction,'up');assert.equal(r.items[0].bad,true);assert.match(r.items[0].delta,/^\+2\d\d крэш/);assert.equal(r.items[0].ask,'топ крэшей вчера в Sentry');}
// Weekly seasonality: weekends are always ×2; a normal Saturday is not an anomaly, a Monday at weekend level is.
{const season=d=>([0,6].includes(weekday(d))?2000:1000)+noise(d);
 const sat='2026-11-07';
 const r1=engine.detect([S('m:dau','metrics','am','dau',make(season,{last:season(Y)}))],{days:[sat],yesterday:Y});
 assert.equal(r1.items.length,0,'weekend peak is normal for a Saturday');
 const r2=detect([S('m:dau','metrics','am','dau',make(season,{last:2000}))]);
 assert.equal(r2.items.length,1,'a Monday at the weekend level is unusual');assert.equal(r2.items[0].direction,'up');assert.equal(r2.items[0].bad,false);}
// Low volume: 3 → 9 tickets is ×3 but too few to call.
{const r=detect([S('s','support','zendesk','tickets',make(d=>3,{last:9}),{unit:'tickets'})]);assert.equal(r.items.length,0);}
// Small effect: −8% with a tight history is not an anomaly at normal sensitivity, but is at high (when ≥12%? no) —
// −15% is caught only at high sensitivity.
{const pts=make(d=>1000+noise(d)/5,{last:850});
 assert.equal(detect([S('m','metrics','am','dau',pts)]).items.length,0,'−15% below the normal minimum effect');
 assert.equal(detect([S('m','metrics','am','dau',pts)],{sensitivity:'high'}).items.length,1,'high sensitivity catches −15%');
 assert.equal(detect([S('m','metrics','am','dau',make(d=>1000+noise(d),{last:650}))],{sensitivity:'low'}).items.length,1,'−35% is caught even at low');}
// Missing data: no point for yesterday → a note, never an item; a source whose every series reads 0 while busy → missing.
{const r=detect([S('m','metrics','am','new',make(d=>1000,{last:undefined}),{sourceName:'AppMetrica'})]);
 assert.equal(r.items.length,0);}
{const r=detect([S('m1','metrics','am','new',make(d=>1000+noise(d),{last:0}),{sourceName:'AppMetrica'}),S('m2','metrics','am','dau',make(d=>5000+noise(d),{last:0}),{sourceName:'AppMetrica'})]);
 assert.equal(r.items.length,0,'zeros everywhere = data not delivered');assert.equal(r.notes.filter(n=>n.missing).length,1);assert.match(r.notes[0].text,/нет данных за вчера.*не аномалия/);}
// Short history: under 3 same weekdays and under 7 days → a note.
{const m=new Map();for(let i=0;i<5;i++)m.set(shift(Y,-i),100);const r=detect([S('m','metrics','am','dau',m,{sourceName:'AppMetrica'})]);
 assert.equal(r.items.length,0);assert(r.notes.some(n=>n.short&&/мало истории/.test(n.text)));}
// 14-day crash stats: the recent-days baseline is used and marked.
{const m=new Map();for(let i=13;i>=1;i--)m.set(shift(Y,-i),50+(i%3));m.set(Y,400);const r=detect([S('c','crashes','sentry','events',m,{unit:'events'})]);
 assert.equal(r.items.length,1);assert.equal(r.items[0].baselineKind,'recent');}
// Ratings: an absolute minimum move and enough ratings that day.
{const rating=(last,n)=>{const m=make(d=>({value:4.4+noise(d)/50,volume:20}),{last:{value:last,volume:n}});return S('r','reviews','appstore','rating',m,{unit:'stars',sourceName:'App Store',segment:{key:'store',value:'appstore',label:'App Store'}});};
 const hit=detect([rating(3.1,25)]);assert.equal(hit.items.length,1);assert.equal(hit.items[0].headline,'Вчера средняя оценка в App Store 3,1★ (обычно 4,4★)');
 assert.equal(detect([rating(3.1,2)]).items.length,0,'two ratings say nothing');}

// --- Dedupe and ranking --------------------------------------------------------------------------------------------
// Installs from Brazil −40% explain most of the total drop: the segment is the headline, the total its context.
{const total=S('t','metrics','am','new',make(d=>3000+noise(d),{last:2350}),{sourceName:'AppMetrica'});
 const br=S('br','metrics','am','new',make(d=>1500+noise(d),{last:900}),{sourceName:'AppMetrica',segment:{key:'country',value:'BR',label:'BR'}});
 const us=S('us','metrics','am','new',make(d=>1500+noise(d),{last:1450}),{sourceName:'AppMetrica',segment:{key:'country',value:'US',label:'US'}});
 const r=detect([total,br,us]);
 assert.equal(r.items.length,1);assert.equal(r.items[0].headline,'Вчера установки из Бразилии −40%');assert(r.items[0].context&&r.items[0].context.change<-0.2);}
// The same move from two sources is one row with «also».
{const a=S('a','metrics','am','dau',make(d=>5000+noise(d),{last:2500}),{sourceName:'AppMetrica'}),b=S('b','metrics','ga','dau',make(d=>5100+noise(d),{last:2600}),{sourceName:'GameAnalytics'});
 const r=detect([a,b]);assert.equal(r.items.length,1);assert.equal(r.items[0].also.length,1);}
// Ranked by impact: revenue −50% outranks +40% support tickets.
{const r=detect([S('s','support','zd','tickets',make(d=>50+noise(d),{last:75}),{unit:'tickets'}),S('ad','ads','max','revenue',make(d=>2000+noise(d),{last:1000}),{unit:'currency:USD',sourceName:'AppLovin MAX'})]);
 assert.equal(r.items.length,2);assert.equal(r.items[0].kind,'ads');assert.match(r.items[0].delta,/^−\$1[\s ]?0\d\d$/);}
// Mute: «Не показывать такое» hides that kind/metric/segment/direction from any source.
{const s1=S('m','metrics','am','new',make(d=>1000+noise(d),{last:600}));const key=detect([s1]).items[0].mute;
 const r=detect([s1],{mutes:[{key}]});assert.equal(r.items.length,0);assert.equal(r.hidden,1);
 const up=detect([S('m','metrics','am','new',make(d=>1000+noise(d),{last:1600}))],{mutes:[{key}]});assert.equal(up.items.length,1,'a rise is not muted by a drop rule');}

// --- Routing ---------------------------------------------------------------------------------------------------------
for(const p of ['что необычного вчера','Что необычного вчера?','есть аномалии за неделю?','аномалии в метриках вчера','покажи аномалии','что странного в данных за неделю'])assert(feature.intent(p),p);
assert.equal(feature.intent('есть аномалии за неделю?').days,7);assert.equal(feature.intent('что необычного вчера').days,1);
for(const p of ['аномальная жара в Москве','необычный подарок жене','придумай необычное имя для героя','упала выручка с рекламы','аномалии eCPM по сетям','DAU за неделю','крэши за вчера','что такое аномалия','странный сон приснился'])assert.equal(feature.intent(p),null,p);

(async()=>{
 const topic={id:'t',title:'Чат',messages:[]};
 const saved={};
 const base=(extra={})=>({settings:{extension_anomalies:'true',anomaliesDaily:'09:00',anomaliesSensitivity:'normal',anomaliesMuted:'[]',anomaliesLast:'',...extra},companyId:'c1',
  saveSettings(v){Object.assign(this.settings,v);Object.assign(saved,v);},requestProgress:{report(){}},
  dialogue:{state:{projects:[{id:'general',name:'Общее'}],topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}});
 // Not installed → null.
 assert.equal(await feature.turn({...base(),settings:{extension_anomalies:'false'}},'что необычного вчера'),null);
 // Installed, nothing connected → a question with the source apps offered.
 {const s=base();let proposed=null;s.extensionOffers={propose:(c,ids,text)=>{proposed=ids;return {handled:true,question:true,text};}};
  const r=await feature.turn(s,'что необычного вчера');assert.equal(r.question,true);assert(proposed.includes('appmetrica')&&proposed.includes('store-reviews'));}
 {const s=base();const r=await feature.turn(s,'что необычного вчера');assert.equal(r.question,true);assert.match(r.text,/подключите источник/);}

 // Happy path with stubbed readers: installs from Brazil drop, crashes calm, support source fails, ads not delivered.
 const series=(points,o)=>({points:[...points].map(([date,value])=>({date,value})),...o});
 const readers={
  metrics:async()=>({series:[
   series(make(d=>3000+noise(d),{last:2350}),{key:'metrics:am:new:all',kind:'metrics',source:'appmetrica',sourceName:'AppMetrica',metric:'new',unit:'users',segment:null}),
   series(make(d=>1500+noise(d),{last:900}),{key:'metrics:am:new:country=BR',kind:'metrics',source:'appmetrica',sourceName:'AppMetrica',metric:'new',unit:'users',segment:{key:'country',value:'BR',label:'BR'}}),
   series(make(d=>9000+noise(d),{last:9010}),{key:'metrics:am:dau:all',kind:'metrics',source:'appmetrica',sourceName:'AppMetrica',metric:'dau',unit:'users',segment:null})],notes:[]}),
  crashes:async()=>({series:[series(make(d=>80+noise(d),{last:82}),{key:'crashes:sentry:events:all',kind:'crashes',source:'sentry',sourceName:'Sentry',metric:'events',unit:'events',segment:null})],notes:[]}),
  support:async()=>({series:[],notes:[{kind:'support',source:'zendesk',sourceName:'Zendesk',text:'Zendesk: 401',error:true}]}),
  ads:async()=>({series:[series(make(d=>2000+noise(d),{last:undefined}),{key:'ads:max:revenue:all',kind:'ads',source:'applovin',sourceName:'AppLovin MAX',metric:'revenue',unit:'currency:USD',segment:null})],notes:[]})
 };
 {const s=base();const r=await feature.turn(s,'что необычного вчера',{now:NOW,readers});
  const card=r.extensionData.anomalies;
  assert.equal(card.mode,'day');assert.equal(card.day,Y);assert.equal(card.items.length,1);assert.equal(card.items[0].headline,'Вчера установки из Бразилии −40%');
  assert(card.notes.some(n=>n.missing&&n.sourceName==='AppLovin MAX'),'ads without yesterday = missing, not an anomaly');
  assert(card.notes.some(n=>n.error&&/Zendesk/.test(n.text)));
  assert.match(r.text,/Нашёл 1 аномалию: установки из Бразилии −40%/);assert.match(r.text,/Нет данных: AppLovin MAX — это не аномалия/);assert.match(r.text,/Не прочитал: Zendesk/);
  assert.deepEqual(card.sources.map(x=>x.name).sort(),['AppLovin MAX','AppMetrica','Sentry']);}
 // Week: every day of the last 7 is scored.
 {const s=base();const wk={metrics:async()=>({series:[series(make(d=>d===shift(Y,-3)?400:1000+noise(d),{last:1000}),{key:'m',kind:'metrics',source:'am',sourceName:'AppMetrica',metric:'new',unit:'users',segment:null})],notes:[]})};
  const r=await feature.turn(s,'есть аномалии за неделю?',{now:NOW,readers:wk});const card=r.extensionData.anomalies;
  assert.equal(card.mode,'week');assert.equal(card.from,shift(Y,-6));assert.equal(card.items.length,1);assert.equal(card.items[0].day,shift(Y,-3));assert.match(card.items[0].headline,/^\d+ ноября установки −60%$/);}
 // A service failure everywhere is an error-free summary naming it, not a crash of the turn.
 {const s=base();const r=await feature.turn(s,'что необычного вчера',{now:NOW,readers:{metrics:async()=>{throw Error('timeout');}}});
  assert.match(r.text,/Не удалось прочитать ни один источник: timeout/);}

 // --- Daily check with a fake clock ---------------------------------------------------------------------------------
 {const s=base(),updates=[];s.chatJobs={update:(t,state)=>updates.push([t.title,state])};
  assert.equal(feature.due(s,new Date(2026,10,10,8,59),['metrics']),false,'before 9:00');
  assert.equal(feature.due(s,new Date(2026,10,10,12,30),['metrics']),false,'more than 3 hours late');
  assert.equal(feature.due({...s,settings:{...s.settings,anomaliesDaily:''}},NOW,['metrics']),false,'switched off');
  assert.equal(feature.due(s,NOW,[]),false,'no connected source: off');
  const r=await feature.daily(s,{now:NOW,readers});
  assert(r.topicId);assert.equal(s.settings.anomaliesLast,'2026-11-10');
  const t=s.dialogue.state.topics.find(x=>x.id===r.topicId);assert.equal(t.title,'Вчера установки из Бразилии −40%');assert.equal(t.messages[0].extensionData.anomalies.items.length,1);
  assert.deepEqual(updates,[['Вчера установки из Бразилии −40%','done']],'one notification that opens the card');
  assert.equal(await feature.daily(s,{now:new Date(2026,10,10,9,30),readers}),null,'once a day');
  // A quiet day: no chat, no notification.
  const quiet=base();quiet.chatJobs={update:()=>updates.push('quiet')};
  const q=await feature.daily(quiet,{now:NOW,readers:{crashes:readers.crashes}});assert.equal(q.topicId,null);assert.equal(updates.length,1);}

 // --- Morning brief part -------------------------------------------------------------------------------------------
 {feature.cache.clear();const s=base();
  assert.equal(await brief.part({settings:{extension_anomalies:'false'}},NOW),null);
  assert.equal(await brief.part(s,NOW),null,'no source → no part');
  const mb=require('../src/features/morning-brief.cjs');
  feature.setup({...s,smoke:true});
  const parts=await mb.partsFor({...s,settings:{...s.settings}},NOW);assert(!parts.some(p=>p.by==='Аномалии'),'registered, quiet without sources');
  // With data: the part is the same summary and card as the chat answer.
  const r=await feature.check(s,{days:1,now:NOW,readers});const text=feature.summary(r);
  assert.match(text,/установки из Бразилии/);}

 // --- Source readers over stubbed registries -----------------------------------------------------------------------------
 {const ms=require('../src/extensions/metrics/sources.cjs'),orig=ms.create;
  const calls=[];
  ms.create=()=>({ready:()=>[{id:'appmetrica',name:'AppMetrica',source:{fetch:async(s,q)=>{calls.push(q.platform);
   if(q.platform==='ios')throw Error('ios is off');
   return {app:'1',series:[{metric:'new',unit:'users',series:days().map(d=>({date:d,value:q.platform?400:1000})),dimensions:{platform:q.platform}}]};}}}]});
  const r=await feeds.metrics({settings:{}},{from:shift(Y,-41),to:Y});ms.create=orig;
  assert.deepEqual(calls,[null,'android','ios']);assert.equal(r.series.length,2);assert.deepEqual(r.series[1].segment,{key:'platform',value:'android',label:'Android'});assert.equal(r.notes.length,0,'a failing platform split is not an error of the source');}
 {const s={settings:{},crashSources:{list:()=>[{id:'sentry',name:'Sentry'}],issues:async(id,q)=>{assert.equal(q.period.statsPeriod,'14d');
   return {issues:[{id:'1',daily:[{day:Y,count:5},{day:shift(Y,-1),count:7},{day:'2020-01-01',count:99}]},{id:'2',daily:[{day:Y,count:1}]}]};}}};
  const r=await feeds.crashes(s,{to:Y,now:NOW});const pts=new Map(r.series[0].points.map(p=>[p.date,p.value]));
  assert.equal(pts.get(Y),6);assert.equal(pts.get(shift(Y,-1)),7);assert.equal(pts.get(shift(Y,-5)),0);assert.equal(r.series[0].points.length,14);}
 {const ss=require('../src/extensions/support/sources.cjs'),orig=ss.create;
  ss.create=()=>({list:()=>[{id:'zendesk',name:'Zendesk',source:{tickets:async()=>[{created:Y+'T10:00:00Z'},{created:Y+'T11:00:00Z'},{created:shift(Y,-2)+'T09:00:00Z'},{created:'2019-01-01T00:00:00Z'}]}}]});
  const r=await feeds.support({settings:{}},{from:shift(Y,-41),to:Y});ss.create=orig;
  const pts=new Map(r.series[0].points.map(p=>[p.date,p.value]));assert.equal(pts.get(Y),2);assert.equal(pts.get(shift(Y,-1)),0);assert.equal(pts.get(shift(Y,-2)),1);}
 {const as=require('../src/extensions/ad-revenue/sources.cjs'),orig=as.create;let asked=null;
  as.create=()=>({ready:()=>[{id:'applovin',name:'AppLovin MAX',source:{maxDays:30,fetch:async(s,q)=>{asked=q;return {rows:[
   {day:shift(Y,-1),network:'AdMob',platform:'android',revenue:100},{day:shift(Y,-1),network:'Unity',platform:'ios',revenue:50},{day:shift(Y,-2),network:'AdMob',platform:'android',revenue:90}]};}}}]});
  const r=await feeds.ads({settings:{}},{from:shift(Y,-41),to:Y});as.create=orig;
  assert.equal(asked.start,shift(Y,-29),'never more days than the source allows');
  const total=r.series.find(x=>!x.segment);assert.deepEqual(total.points.map(p=>p.date),[shift(Y,-2),shift(Y,-1)],'a day without rows is missing, not zero');
  assert.equal(total.points[1].value,150);assert(r.series.some(x=>x.segment?.key==='network'&&x.segment.value==='AdMob'));assert(r.series.some(x=>x.segment?.key==='platform'&&x.segment.value==='ios'));}
 {const rf=require('../src/extensions/store-reviews/feature.cjs'),st=require('../src/extensions/store-reviews/stores.cjs');
  const o={connected:rf.connected,asc:st.ascApps,reviews:st.ascReviews};
  rf.connected=()=>({appstore:true,play:false});st.ascApps=async()=>[{id:'123456',label:'Bunker',store:'appstore'}];
  st.ascReviews=async()=>[{date:Y+'T10:00:00Z',rating:1},{date:Y+'T11:00:00Z',rating:5},{date:shift(Y,-3)+'T11:00:00Z',rating:4}];
  const r=await feeds.reviews({settings:{'extension_store-reviews':'true'}},{from:shift(Y,-41),to:Y});
  Object.assign(rf,{connected:o.connected});st.ascApps=o.asc;st.ascReviews=o.reviews;
  const rating=r.series.find(x=>x.metric==='rating'),bad=r.series.find(x=>x.metric==='negative');
  assert.deepEqual(rating.points.map(p=>[p.date,p.value,p.volume]),[[shift(Y,-3),4,1],[Y,3,2]]);
  assert.equal(bad.points[0].date,shift(Y,-3),'reviews are complete only from the oldest one read');assert.equal(bad.points.at(-1).value,1);}
 // The real registries load and nothing is connected with empty settings.
 assert.deepEqual(feeds.connected({settings:{}}),[]);

 // «Почему?» questions reach the apps that own the data.
 const crashQuery=require('../src/extensions/crashes/query.cjs'),reviews=require('../src/extensions/store-reviews/feature.cjs'),ad=require('../src/extensions/ad-revenue/query.cjs');
 assert(crashQuery.about('топ крэшей вчера в Sentry'),'crashes');
 assert(reviews.wanted('плохие отзывы за неделю в App Store'),'store reviews');
 assert(ad.about('выручка с рекламы вчера по сетям'),'ads');
 const support=require('../src/extensions/support/feature.cjs');assert(support.wanted?support.wanted('что жалуются в поддержку вчера'):true,'support');
 const metricsQ=require('../src/extensions/metrics/query.cjs');assert(metricsQ.about?metricsQ.about('сколько новых игроков за 2 недели на Android'):true,'metrics');
 // Validation.
 const v={anomaliesDaily:'9:00',anomaliesSensitivity:'x',anomaliesMuted:'{',anomaliesLast:'nope'};assert.throws(()=>feature.validate(v),/ЧЧ:ММ/);
 const v2={anomaliesSensitivity:'x',anomaliesMuted:'{',anomaliesLast:'nope'};feature.validate(v2);assert.deepEqual(v2,{anomaliesSensitivity:'normal',anomaliesMuted:'[]',anomaliesLast:''});
 console.log('Anomalies: robust baseline (spikes, drops, weekly seasonality, low volume, missing data, short history), dedupe, mute, sensitivity, routing, daily check with a fake clock, brief section and source readers passed');
})().catch(e=>{console.error(e);process.exit(1);});
