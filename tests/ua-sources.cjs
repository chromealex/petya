// The `ua-source` foundation (src/features/ua-sources.cjs) and its first providers against fake AppLovin, Unity Ads
// and Meta servers on localhost (the providers' fixed hosts are routed to them by the test's s.request): the
// requests each provider sends (endpoint, auth, dates, breakdowns, paging), normalization into one row shape,
// bounded periods, summaries with CPI that never add currencies, failures told apart; then «Закупка трафика»:
// routing with ad-revenue near-misses, not connected → question, the card with networks, campaigns and ROAS.
const assert=require('node:assert/strict');
const http=require('node:http');
const UA=require('../src/features/ua-sources.cjs');
const app=require('../src/extensions/ua-campaigns/feature.cjs');
const meta=require('../src/extensions/ua-campaigns/meta-ua-source.cjs');
const offer=require('../src/extensions/ua-campaigns/offer.cjs');

const calls=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x');const send=(code,b)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(b===undefined?'':JSON.stringify(b));};
 calls.push({host:req.headers['x-host'],path:u.pathname,query:Object.fromEntries(u.searchParams),auth:req.headers.authorization});
 const host=req.headers['x-host'];
 if(host==='r.applovin.com'){
  if(u.searchParams.get('api_key')!=='a'.repeat(40))return send(401,{});
  return send(200,{code:200,results:[
   {day:'2026-11-07',campaign:'BW iOS US',campaign_id_external:'c1',country:'us',platform:'ios',impressions:'120000',clicks:'2400',conversions:'300',cost:'450.50'},
   {day:'2026-11-08',campaign:'BW iOS US',campaign_id_external:'c1',country:'us',platform:'ios',impressions:'100000',clicks:'2000',conversions:'250',cost:'400'},
   {day:'2026-11-08',campaign:'BW Android DE',campaign_id_external:'c2',country:'de',platform:'android',impressions:'50000',clicks:'900',conversions:'200',cost:'120'}]});
 }
 if(host==='services.api.unity.com'){
  if(req.headers.authorization!=='Basic '+Buffer.from('k'.repeat(36)+':'+'s'.repeat(32)).toString('base64'))return send(401,{});
  if(u.searchParams.get('start')==='2026-10-01T00:00:00.000Z')return send(204);
  return send(200,{data:[{timestamp:'2026-11-08',campaignId:'u1',campaignName:'Rewarded US',country:'US',platform:'ios',starts:30000,clicks:900,installs:180,spend:270},
   {timestamp:'2026-11-08',campaignId:'u2',campaignName:'Playable BR',country:'BR',platform:'android',starts:80000,clicks:1600,installs:400,spend:160}]});
 }
 if(host==='graph.facebook.com'){
  if(u.searchParams.get('access_token')!=='m'.repeat(60))return send(400,{error:{message:'Error validating access token: Session has expired on Friday',type:'OAuthException',code:190}});
  if(!u.searchParams.get('after'))return send(200,{data:[{date_start:'2026-11-08',campaign_id:'f1',campaign_name:'BW Lookalike',country:'US',spend:'210.40',impressions:'40000',clicks:'800',account_currency:'USD',actions:[{action_type:'link_click',value:'800'},{action_type:'mobile_app_install',value:'120'}]}],
   paging:{cursors:{after:'X'},next:'https://graph.facebook.com/v24.0/act_123456/insights?after=X&access_token='+'m'.repeat(60)}});
  return send(200,{data:[{date_start:'2026-11-08',campaign_id:'f2',campaign_name:'BW EU',country:'DE',spend:'90',impressions:'20000',clicks:'300',account_currency:'EUR',actions:[{action_type:'omni_app_install',value:'45'}]}],paging:{cursors:{before:'X'}}});
 }
 send(404,{});
});
let base='';
// Petya's s.request, with the providers' real hosts routed to the fake server.
async function request(url,{timeoutMs,headers={},...o}={}){
 const u=new URL(url);
 const r=await fetch(base+u.pathname+u.search,{...o,headers:{...headers,'x-host':u.hostname}});
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.status===204?null:r.json();
}
const KEYS={uaApplovinKey:'a'.repeat(40),uaUnityOrg:'1234567890',uaUnityKeyId:'k'.repeat(36),uaUnitySecret:'s'.repeat(32),uaMetaAccounts:'act_123456',uaMetaToken:'m'.repeat(60)};
const NOW=Date.parse('2026-11-09T10:00:00Z');
function services(settings){const topic={id:'t',title:'Чат',messages:[]};return {settings:{'extension_ua-campaigns':'true',...settings},request,requestProgress:{report(){}},dialogue:{active:()=>topic,persist(){},rememberAction(c,t){topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 try{
  // Contract: providers load; rows are normalized; periods are bounded.
  assert.deepEqual(UA.load().map(x=>x.id),['applovin-ua','meta-ua','unity-ua']);
  assert.deepEqual(UA.row({date:'2026-11-08T00:00',network:'X',campaign:'',country:'gb',platform:'iPhone',spend:'12.345',installs:'3.4',clicks:-1,impressions:'1,000',currency:'eur'},'x'),
   {date:'2026-11-08',network:'X',campaign:'Без названия',campaignId:'',country:'GB',platform:'ios',spend:12.345,installs:3,clicks:0,impressions:1000,currency:'EUR',source:'x'});
  assert.equal(UA.row({date:'nope'},'x').date,'');
  assert.deepEqual(UA.bound({start:'2020-01-01',end:'2030-01-01'},{now:NOW,maxDays:45}),{start:'2026-09-26',end:'2026-11-09',days:45,notes:['Отчёт доступен с 2026-09-26.']});
  assert.equal(UA.bound({start:'2025-01-01',end:'2026-11-08'},{now:NOW,maxDays:3650}).days,92);
  assert.deepEqual(UA.bound({},{now:NOW}),{start:'2026-11-02',end:'2026-11-08',days:7,notes:[]});
  assert.deepEqual(UA.period('сколько потратили вчера',NOW),{start:'2026-11-08',end:'2026-11-08',label:'вчера'});
  assert.deepEqual(UA.period('CPI за 14 дней',NOW),{start:'2026-10-26',end:'2026-11-08',label:'за 14 дн.'});
  assert.equal(UA.period('на прошлой неделе',NOW).start,'2026-11-02');
  const sum=UA.summarize([{network:'A',currency:'USD',spend:10,installs:5,clicks:50,impressions:1000},{network:'A',currency:'EUR',spend:7,installs:1,clicks:0,impressions:0},{network:'B',currency:'USD',spend:2,installs:0,clicks:0,impressions:0}],'network');
  assert.equal(sum.length,3,'currencies are never added');assert.equal(sum[0].cpi,2);assert.equal(sum[0].ctr,0.05);assert.equal(sum.find(x=>x.network==='B').cpi,null);
  assert.equal(UA.roas(150,100),1.5);assert.equal(UA.roas(1,0),null);

  // Providers over HTTP.
  const reg=UA.create(services(KEYS),{now:()=>NOW});
  assert.equal(reg.list().length,3);
  calls.length=0;
  const al=await reg.fetch('applovin-ua',{start:'2026-11-07',end:'2026-11-08'});
  const q=calls[0].query;
  assert.equal(calls[0].path,'/report');assert.equal(q.report_type,'advertiser');assert.equal(q.format,'json');assert.equal(q.start,'2026-11-07');assert.equal(q.end,'2026-11-08');
  assert.equal(q.columns,'day,campaign,campaign_id_external,country,platform,impressions,clicks,conversions,cost');
  assert.deepEqual(al.rows[0],{date:'2026-11-07',network:'AppLovin',campaign:'BW iOS US',campaignId:'c1',country:'US',platform:'ios',spend:450.5,installs:300,clicks:2400,impressions:120000,currency:'USD',source:'applovin-ua'});
  // The AppLovin Report Key of «Реклама и монетизация» is reused.
  assert.equal(UA.create(services({adRevenueApplovinKey:'a'.repeat(40)})).list().map(x=>x.id).join(),'applovin-ua');
  calls.length=0;
  const un=await reg.fetch('unity-ua',{start:'2026-11-08',end:'2026-11-08'});
  assert.equal(calls[0].path,'/advertise/stats/v2/organizations/1234567890/reports/acquisitions');
  assert.deepEqual([calls[0].query.start,calls[0].query.end,calls[0].query.scale,calls[0].query.metrics,calls[0].query.breakdowns,calls[0].query.format],['2026-11-08T00:00:00.000Z','2026-11-09T00:00:00.000Z','day','starts,clicks,installs,spend','campaign,country,platform','json']);
  assert.equal(un.rows[1].impressions,80000);assert.equal(un.rows[1].platform,'android');
  assert.deepEqual((await reg.fetch('unity-ua',{start:'2026-10-01',end:'2026-10-01'})).rows,[],'204 is an empty report');
  calls.length=0;
  const mt=await reg.fetch('meta-ua',{start:'2026-11-08',end:'2026-11-08'});
  assert.equal(calls.length,2,'paging.next is followed');assert.equal(calls[0].path,'/v24.0/act_123456/insights');
  assert.deepEqual(JSON.parse(calls[0].query.time_range),{since:'2026-11-08',until:'2026-11-08'});assert.equal(calls[0].query.level,'campaign');assert.equal(calls[0].query.breakdowns,'country');assert.equal(calls[0].query.time_increment,'1');
  assert.deepEqual(mt.rows.map(r=>[r.installs,r.currency]),[[120,'USD'],[45,'EUR']]);
  assert.equal(meta.installs([{action_type:'link_click',value:'5'}]),0);

  // Failures told apart.
  await assert.rejects(UA.create(services({...KEYS,uaApplovinKey:'b'.repeat(40)})).fetch('applovin-ua',{}),/AppLovin не принял Report Key/);
  await assert.rejects(UA.create(services({...KEYS,uaUnitySecret:'t'.repeat(32)})).fetch('unity-ua',{}),/Unity не принял ключ/);
  await assert.rejects(UA.create(services({...KEYS,uaMetaToken:'n'.repeat(60)})).fetch('meta-ua',{}),/Токен Meta истёк/);
  await assert.rejects(UA.create(services({})).fetch('meta-ua',{}),/не добавлен или не подключён/);
  const partial=await UA.create(services({...KEYS,uaMetaToken:'n'.repeat(60)}),{now:()=>NOW}).fetchAll({start:'2026-11-08',end:'2026-11-08'});
  assert.deepEqual(partial.used.map(x=>x.id),['applovin-ua','unity-ua']);assert.equal(partial.failed[0].id,'meta-ua');

  // «Закупка трафика»: routing and near-misses.
  for(const p of ['сколько потратили на закупку за неделю','CPI по сетям за 30 дней','расходы на рекламные кампании вчера','сколько потратили на рекламу','какой ROAS за неделю','кампании в Unity Ads','стоимость установки по сетям','закупка трафика вчера'])assert.ok(app.about(p),p);
  for(const p of ['сколько заработали на рекламе вчера','eCPM по сетям','выручка с рекламы за неделю','запусти рекламу в TikTok','отключи рекламу','отзывы в App Store','покупки в приложении','что в Unity','расходы на обед'])assert.equal(app.about(p),false,p);
  assert.equal(await app.turn({settings:{}},'CPI по сетям'),null);
  const q1=await app.turn(services({}),'CPI по сетям');assert.ok(q1.question&&/Настройки → «Закупка трафика»/.test(q1.text));

  // The card (Meta in EUR stays apart; ROAS from ad revenue when «Реклама и монетизация» is ready).
  const s=services({...KEYS,'extension_ad-revenue':'true',adRevenueApplovinKey:'a'.repeat(40)});
  const realRequest=s.request;
  s.request=async(url,o)=>/maxReport/.test(url)?{code:200,results:[{day:'2026-11-08',application:'BW',package_name:'x',platform:'ios',network:'AppLovin',ad_format:'REWARD',impressions:'1000',estimated_revenue:'700'}]}:realRequest(url,o);
  const r=await app.uaTurn(s,'сколько потратили на закупку вчера',NOW);
  const c=r.extensionData.uaCampaigns;
  assert.equal(c.currency,'USD');assert.equal(c.totals.spend,400+120+270+160+210.4);assert.equal(c.totals.installs,250+200+180+400+120);
  assert.deepEqual(c.networks.map(x=>x.network),['AppLovin','Unity Ads','Meta']);
  assert.equal(c.campaigns[0].campaign,'BW iOS US');assert.ok(c.notes.some(n=>/EUR|€/.test(n)&&/не сложены/.test(n)));
  assert.equal(c.roas.revenue,700);assert.ok(Math.abs(c.roas.value-700/1160.4)<1e-9);
  assert.match(r.text,/^Вчера на закупку ушло 1\s?160\s\$: 1\s?150 установок, CPI 1,01\s\$\. Больше всего — AppLovin: 520,00\s\$ \(CPI 1,16\s\$\)\. ROAS по выручке с рекламы: 60%\.$/u);
  // A named network only.
  const r2=await app.uaTurn(services(KEYS),'кампании в Unity Ads вчера',NOW);
  assert.deepEqual(r2.extensionData.uaCampaigns.networks.map(x=>x.network),['Unity Ads']);assert.equal(r2.extensionData.uaCampaigns.roas,null);

  // Settings and the offer.
  assert.throws(()=>app.validate({uaMetaAccounts:'act_12,abc'}),/ID рекламных аккаунтов/);
  assert.throws(()=>app.validate({uaApplovinKey:'bad key'}),/Report Key/);
  assert.equal(offer.ready({'extension_ua-campaigns':'true'}),false);assert.equal(offer.ready({'extension_ua-campaigns':'true',...KEYS}),true);
  console.log('UA sources: contract, bounded periods, summaries without mixed currencies, AppLovin/Unity Ads/Meta over HTTP (auth, dates, breakdowns, paging, 204), failures; «Закупка трафика» routing, card and ROAS passed');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
