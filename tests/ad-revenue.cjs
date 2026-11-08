// «Реклама и монетизация»: routing incl. near-misses (user acquisition, turning ads off, in-app purchases), not added /
// not connected, the `ad-source` registry, AppLovin MAX and LevelPlay requests (auth, params, paging), card data
// (totals, change, stacked chart, format × network, countries, fill rate, ARPDAU, anomalies vs the 4-week
// baseline), one source failing, service errors, and the offer. No network: both services are stubbed via s.request.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const app=require('../src/extensions/ad-revenue/feature.cjs');
const query=require('../src/extensions/ad-revenue/query.cjs');
const analysis=require('../src/extensions/ad-revenue/analysis.cjs');
const shape=require('../src/extensions/ad-revenue/shape.cjs');
const sources=require('../src/extensions/ad-revenue/sources.cjs');
const levelplay=require('../src/extensions/ad-revenue/levelplay-source.cjs');
const offer=require('../src/extensions/ad-revenue/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const links=require('../src/features/app-links.cjs');

const NOW=new Date('2026-11-09T10:00:00Z');
const DAY=86400000;
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const YESTERDAY='2026-11-08';
// 45 days of AppLovin rows: networks × formats × platforms, weekend uplift, and rewarded on AdMob and AppLovin collapsing yesterday.
const NETS={APPLOVIN_EXCHANGE:40,ADMOB_BIDDING:30,UNITY_BIDDING:15,FACEBOOK_NETWORK:10,MINTEGRAL_BIDDING:6,PANGLE_BIDDING:3,INMOBI_BIDDING:1};
const FMTS={REWARD:[0.6,14],INTER:[0.3,9],BANNER:[0.1,0.6]};
function applovinRows(start,end){
 const out=[];
 for(let t=Date.parse(start+'T00:00:00Z');t<=Date.parse(end+'T00:00:00Z');t+=DAY){
  const day=iso(t),wd=new Date(t).getUTCDay(),weekend=wd===0||wd===6?1.2:1;
  for(const [net,w] of Object.entries(NETS))for(const [fmt,[share,ecpm]] of Object.entries(FMTS))for(const platform of ['android','ios']){
   let revenue=w*share*weekend*(platform==='ios'?1.5:1)*10;
   if(day===YESTERDAY&&fmt==='REWARD'&&(net==='ADMOB_BIDDING'||net==='APPLOVIN_EXCHANGE'))revenue*=0.2;
   const impressions=Math.round(revenue/ecpm*1000);
   out.push({day,application:'Bunker Wars',package_name:'com.studio.bunker',platform,network:net,ad_format:fmt,attempts:String(impressions*3),responses:String(Math.round(impressions*1.5)),impressions:String(impressions),estimated_revenue:revenue.toFixed(4)});
  }
 }
 return out;
}
const COUNTRIES=[{country:'us',impressions:'500000',estimated_revenue:'4200.5'},{country:'de',impressions:'200000',estimated_revenue:'1300'},{country:'ru',impressions:'400000',estimated_revenue:'600.25'},{country:'jp',impressions:'90000',estimated_revenue:'900'}];

function services(over={},settings={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[];
 const s={settings:{model:'','extension_ad-revenue':'true',adRevenueApplovinKey:'applovin_report_key_1234567890',adRevenueLevelplaySecret:'',adRevenueLevelplayRefresh:'',...settings},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){
   const u=new URL(url);calls.push({url:u,options});
   const key=u.host+u.pathname;
   if(over[key])return over[key](u,options);
   if(key==='r.applovin.com/maxReport'){
    assert.equal(u.searchParams.get('api_key'),'applovin_report_key_1234567890');assert.equal(u.searchParams.get('format'),'json');
    const cols=u.searchParams.get('columns').split(',');
    if(cols.includes('country'))return {code:200,count:COUNTRIES.length,results:COUNTRIES};
    const rows=applovinRows(u.searchParams.get('start'),u.searchParams.get('end'));
    const offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));
    return {code:200,count:rows.length,results:rows.slice(offset,offset+limit)};
   }
   throw Object.assign(Error('unexpected '+url),{status:404});
  }};
 return {s,topic,calls};
}

(async()=>{
 // --- Routing: the brief's phrases and near-misses.
 for(const p of ['сколько заработали на рекламе вчера','eCPM по сетям','какой формат приносит больше','упала выручка с rewarded','выручка с рекламы за неделю','какой fill rate у AdMob',
  'ARPDAU за неделю','что в AppLovin за вчера','доход от рекламы по странам','сколько принесли интерстишлы за 14 дней','рекламная выручка упала?','отчёт LevelPlay за неделю'])
  assert.ok(query.about(p),'should trigger: '+p);
 for(const p of ['реклама игры','запусти рекламу игры в TikTok','маркетинговые кампании за месяц','сколько потратили на рекламу','какой CPI у кампании','рекламная кампания в Facebook','закупка трафика',
  'отключи рекламу','убери рекламу из игры','как отключить рекламу в браузере','покупки в приложении за неделю','выручка от покупок в приложении','сколько IAP вчера','выручка за подписки',
  'сколько заработали вчера','что такое eCPM','сделай баннер для сайта','какой формат файла','падение продаж за неделю','',''])
  assert.ok(!query.about(p),'should not trigger: '+p);
 // Parsing: period, format, network, platform, country, view.
 let a=query.parse('сколько заработали на рекламе вчера',NOW);assert.deepEqual([a.period.start,a.period.end,a.period.days,a.period.label],[YESTERDAY,YESTERDAY,1,'вчера']);
 a=query.parse('упала выручка с rewarded',NOW);assert.equal(a.format,'rewarded');assert.equal(a.view,'anomaly');assert.equal(a.period.days,7);assert.equal(a.period.end,YESTERDAY);
 a=query.parse('eCPM по сетям за 14 дней на iOS',NOW);assert.equal(a.view,'ecpm');assert.equal(a.platform,'ios');assert.equal(a.period.days,14);
 a=query.parse('какой формат приносит больше',NOW);assert.equal(a.view,'format');
 a=query.parse('выручка AdMob в США за месяц',NOW);assert.equal(a.network,'Google AdMob');assert.equal(a.country,'US');assert.equal(a.period.days,30);
 a=query.parse('сравни выручку с рекламы с прошлой неделей',NOW);assert.ok(a.compare);
 a=query.parse('отчёт AppLovin MAX за вчера',NOW);assert.equal(a.network,null,'the reporting service is not a network filter');
 // Shapes: one name for a network whichever service reports it.
 assert.equal(shape.network('ADMOB_BIDDING'),'Google AdMob');assert.equal(shape.network('AdMob'),'Google AdMob');assert.equal(shape.network('unityAds'),'Unity / ironSource');assert.equal(shape.network('ironSource'),'Unity / ironSource');
 assert.equal(shape.network('FACEBOOK_NETWORK'),'Meta Audience Network');assert.equal(shape.network('SOME_NEW_NETWORK'),'Some New');
 assert.equal(shape.format('INTER'),'interstitial');assert.equal(shape.format('Rewarded'),'rewarded');assert.equal(shape.format('REWARD'),'rewarded');assert.equal(shape.format('BANNER'),'banner');assert.equal(shape.format('APPOPEN'),'appopen');
 assert.equal(shape.number('1,234.5'),1234.5);assert.equal(shape.number('x'),0);

 // --- The ad-source registry: declared in extension.json, only for kinds app-links knows.
 assert.ok(links.REGISTRIES.includes('ad-source'));
 assert.deepEqual(sources.load().map(x=>x.id),['applovin','levelplay']);
 const reg=sources.create({settings:{'extension_ad-revenue':'true',adRevenueApplovinKey:'applovin_report_key_1234567890'}});
 assert.deepEqual(reg.ready().map(x=>x.id),['applovin']);
 assert.deepEqual(sources.create({settings:{'extension_ad-revenue':'false',adRevenueApplovinKey:'applovin_report_key_1234567890'}}).ready(),[]);

 // --- Not added → null; added but not connected → a question where to connect.
 {const {s}=services({}, {'extension_ad-revenue':'false'});assert.equal(await app.turn(s,'сколько заработали на рекламе вчера'),null);}
 {const {s,calls}=services({}, {adRevenueApplovinKey:''});const r=await app.turn(s,'сколько заработали на рекламе вчера');assert.ok(r.question);assert.match(r.text,/Настройки → «Реклама и монетизация»/);assert.equal(calls.length,0);}
 {const {s}=services();assert.equal(await app.turn(s,'отключи рекламу'),null);assert.equal(await app.turn(s,'покупки в приложении за неделю'),null);}

 // --- Happy path: yesterday, AppLovin only.
 {const {s,calls}=services();
  const r=await app.adTurn(s,'сколько заработали на рекламе вчера',NOW);
  assert.ok(r.handled&&!r.error,r.text);
  const main=calls.find(c=>c.url.searchParams.get('columns').includes('network'));
  assert.equal(main.url.searchParams.get('end'),YESTERDAY);assert.equal(main.url.searchParams.get('start'),'2026-10-11','4 weeks of baseline before the day');
  assert.equal(main.url.searchParams.get('not_zero'),'1');
  assert.match(main.url.searchParams.get('columns'),/^day,application,package_name,platform,network,ad_format,attempts,responses,impressions,estimated_revenue$/);
  const geo=calls.find(c=>c.url.searchParams.get('columns').includes('country'));assert.equal(geo.url.searchParams.get('start'),YESTERDAY);
  const c=r.extensionData.adRevenue;
  assert.deepEqual(c.sources,['AppLovin MAX']);assert.equal(c.period.label,'вчера');
  // Sunday: weekend uplift; AdMob rewarded collapsed to 20%.
  const expected=Object.entries(NETS).reduce((n,[net,w])=>n+Object.entries(FMTS).reduce((m,[fmt,[share]])=>m+[1,1.5].reduce((k,p)=>k+w*share*1.2*p*10*(fmt==='REWARD'&&(net==='ADMOB_BIDDING'||net==='APPLOVIN_EXCHANGE')?0.2:1),0),0),0);
  assert.ok(Math.abs(c.totals.revenue-expected)<0.05,c.totals.revenue+' vs '+expected);
  assert.ok(c.totals.weekday&&c.totals.weekday.weeks===4&&c.totals.weekday.change<-0.1,'compared with the 4 Sundays before');
  assert.match(r.text,/^Вчера реклама принесла .+ \(−\d+% к обычному воскресенью\), .+ показ/);
  assert.equal(c.chart.days.length,14);assert.equal(c.chart.days.at(-1),YESTERDAY);assert.equal(c.chart.series.length,6);assert.equal(c.chart.series.at(-1).id,'rest');
  assert.equal(c.chart.series[0].label,'AppLovin');
  assert.deepEqual(c.formats.map(f=>f.format),['interstitial','rewarded','banner'],'yesterday rewarded fell below interstitial');
  assert.ok(c.matrix.networks.includes('rest')&&c.matrix.cells.some(x=>x.format==='rewarded'&&x.network==='Google AdMob'));
  assert.equal(c.networks.find(n=>n.name==='AppLovin').fill,0.5,'fill rate = responses / attempts per network');
  assert.equal(c.totals.fill,null,'no mediation-level fill from AppLovin');
  assert.equal(c.countries[0].country,'US');assert.equal(c.countries.length,4);
  const drop=c.anomalies.find(x=>x.dimension==='network'&&x.label==='Google AdMob');assert.ok(drop&&drop.change<-0.3&&drop.day===YESTERDAY);
  assert.ok(c.anomalies.some(x=>x.dimension==='format'&&x.label==='rewarded'&&x.change<0));
 }
 // Anomaly question about one format: the answer names the drop with its baseline.
 {const {s}=services();
  const r=await app.adTurn(s,'упала выручка с rewarded',NOW);const c=r.extensionData.adRevenue;
  assert.equal(c.filters.format,'rewarded');assert.ok(c.formats.every(f=>f.format==='rewarded'));
  assert.match(r.text,/Выручка с rewarded 8 ноября — .+, на \d+% ниже обычного для этого дня недели/);
 }
 // Formats and eCPM views.
 {const {s}=services();
  let r=await app.adTurn(s,'какой формат приносит больше',NOW);assert.match(r.text,/Больше всего приносит rewarded — .+ \(\d+%\), дальше interstitial/);
  r=await app.adTurn(s,'eCPM по сетям',NOW);assert.match(r.text,/eCPM по сетям: AppLovin .+, Google AdMob/);
  assert.equal(r.extensionData.adRevenue.networks[0].ecpmTrend.length,14);
  r=await app.adTurn(s,'ARPDAU за неделю',NOW);assert.match(r.text,/ARPDAU посчитать не из чего/);
  r=await app.adTurn(s,'выручка с рекламы на iOS за неделю',NOW);assert.equal(r.extensionData.adRevenue.filters.platform,'ios');assert.deepEqual(r.extensionData.adRevenue.countries,[],'country report is not split by platform');assert.ok(r.extensionData.adRevenue.countriesNarrowed);
  r=await app.adTurn(s,'выручка с рекламы за 60 дней',NOW);assert.equal(r.extensionData.adRevenue.period.days,42,'capped');
 }
 // A month: the window stops at AppLovin's 45 days; the baseline is partial but the answer works.
 {const {s,calls}=services();const r=await app.adTurn(s,'выручка с рекламы за месяц',NOW);assert.ok(!r.error);
  const main=calls.find(c=>c.url.searchParams.get('columns').includes('network'));assert.equal(main.url.searchParams.get('start'),'2026-09-26');}
 // Paging: a page of exactly `limit` rows asks for the next one.
 {let pages=0;const {s}=services({'r.applovin.com/maxReport':u=>{if(u.searchParams.get('columns').includes('country'))return {code:200,results:[]};pages++;return {code:200,results:pages===1?Array.from({length:10000},()=>({day:YESTERDAY,application:'A',platform:'android',network:'ADMOB_BIDDING',ad_format:'BANNER',impressions:'1',estimated_revenue:'0.001'})):[]};}});
  await app.adTurn(s,'сколько заработали на рекламе вчера',NOW);assert.equal(pages,2);}

 // --- LevelPlay: bearer token from the auth endpoint, three reports, DAU → ARPDAU, mediation fill rate.
 {levelplay.forget();
  let auth=0;const seen=[];
  const lp={
   'platform.ironsrc.com/partners/publisher/auth':(u,o)=>{auth++;assert.equal(o.headers.secretkey,'lp_secret_abc');assert.equal(o.headers.refreshToken,'lp_refresh_xyz');return 'jwt.token.value';},
   'platform.ironsrc.com/levelPlay/reporting/v1':(u,o)=>{
    assert.equal(o.headers.Authorization,'Bearer jwt.token.value');seen.push(u.searchParams.get('breakdowns'));
    const b=u.searchParams.get('breakdowns');
    if(b==='country')return {data:[{country:'US',revenue:300,impressions:20000}],page:1,pageSize:1,totalResults:1};
    const days=analysis.daysBetween(u.searchParams.get('startDate'),u.searchParams.get('endDate'));
    if(b==='date,app,platform')return {data:days.map(d=>({date:d,appName:'Tower Rush',platform:'Android',revenue:100,activeUsers:20000,appRequests:10000,appFills:9200})),totalResults:days.length};
    return {data:days.flatMap(d=>[{date:d,appName:'Tower Rush',platform:'Android',networkName:'unityAds',adFormat:'Rewarded',revenue:60,impressions:4000},{date:d,appName:'Tower Rush',platform:'Android',networkName:'AdMob',adFormat:'Interstitial',revenue:40,impressions:5000}]),totalResults:days.length*2};
   }};
  const {s}=services(lp,{adRevenueApplovinKey:'',adRevenueLevelplaySecret:'lp_secret_abc',adRevenueLevelplayRefresh:'lp_refresh_xyz'});
  const r=await app.adTurn(s,'ARPDAU за неделю',NOW);const c=r.extensionData.adRevenue;
  assert.deepEqual(c.sources,['Unity LevelPlay']);assert.deepEqual(seen,['date,app,platform,adNetwork,adFormat','date,app,platform','country']);
  assert.equal(c.totals.revenue,700);assert.equal(c.totals.arpdau,0.005);assert.equal(c.totals.dau,20000);assert.equal(c.totals.fill,0.92);
  assert.match(r.text,/ARPDAU: 0,005.*при 20 тыс\. DAU/);
  assert.deepEqual(c.networks.map(n=>n.name),['Unity / ironSource','Google AdMob']);
  await app.adTurn(s,'сколько заработали на рекламе вчера',NOW);assert.equal(auth,1,'the bearer token is reused for 23 hours');
  // Both sources together; one failing is reported, the other still answers.
  const both=services({...lp,'r.applovin.com/maxReport':()=>{throw Object.assign(Error('HTTP 401'),{status:401});}},{adRevenueLevelplaySecret:'lp_secret_abc',adRevenueLevelplayRefresh:'lp_refresh_xyz'});
  const r2=await app.adTurn(both.s,'сколько заработали на рекламе вчера',NOW);
  assert.ok(!r2.error);assert.deepEqual(r2.extensionData.adRevenue.sources,['Unity LevelPlay']);assert.match(r2.text,/Не удалось прочитать: AppLovin MAX\./);
  assert.match(r2.extensionData.adRevenue.notes[0],/AppLovin не принял Report Key/);
 }
 // --- Service errors: explained in words, the chat answer is an error.
 {const {s}=services({'r.applovin.com/maxReport':()=>{throw Object.assign(Error('HTTP 429'),{status:429});}});
  const r=await app.turn(s,'сколько заработали на рекламе вчера');assert.ok(r.error);assert.match(r.text,/AppLovin ограничил число запросов/);}
 {const {s}=services({'r.applovin.com/maxReport':()=>({code:200})});const r=await app.turn(s,'eCPM по сетям');assert.ok(r.error);assert.match(r.text,/некорректный отчёт/);}
 {const {s}=services({'r.applovin.com/maxReport':()=>({code:200,results:[]})});const r=await app.adTurn(s,'сколько заработали на рекламе вчера',NOW);assert.ok(r.extensionData.adRevenue.empty);assert.match(r.text,/Данных о рекламной выручке вчера нет/);}
 // Model-free: no model setting, no model request.
 {const {s,calls}=services();await app.adTurn(s,'какой формат приносит больше',NOW);assert.ok(calls.every(c=>c.url.host==='r.applovin.com'));}
 // Settings validation.
 {const next={adRevenueApplovinKey:' abc def '};assert.throws(()=>app.validate(next),/Report Key AppLovin указан неверно/);const ok={adRevenueApplovinKey:' applovin_report_key_1234567890 '};app.validate(ok);assert.equal(ok.adRevenueApplovinKey,'applovin_report_key_1234567890');}

 // --- Offer: subject words offer it; near-misses do not; ready only when a source is connected.
 const all=offers.load();
 const pick=text=>{const d=offers.decide(offers.candidates(text,{offers:all,settings:{}}));return d?.one?.offer.id||null;};
 for(const p of ['сколько заработали на рекламе вчера','eCPM по сетям','какой формат приносит больше','упала выручка с rewarded'])assert.equal(pick(p),'ad-revenue',p);
 for(const p of ['реклама игры','маркетинговые кампании','отключи рекламу','покупки в приложении'])assert.notEqual(pick(p),'ad-revenue',p);
 assert.equal(offer.ready({'extension_ad-revenue':'true'}),false);assert.equal(offer.ready({'extension_ad-revenue':'true',adRevenueApplovinKey:'applovin_report_key_1234567890'}),true);
 console.log('Ad revenue: routing and near-misses, ad-source registry, AppLovin and LevelPlay reports, card data, anomalies, errors and offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
