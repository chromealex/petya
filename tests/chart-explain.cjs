// «Объясни график» (src/extensions/chart-explain): routing with near-misses, holidays, the change detection (spike,
// step, flat, short), series from Petya's own cards (a real «Метрики игры» card built from AppMetrica-shaped answers),
// the evidence readers against fakes — GitHub Actions release runs on a fake HTTP server, monitoring history, crash
// sources, UA campaigns, holidays — and the ranking: every cause has a date and a source; «Нет явной причины» when
// nothing is close; a reader that fails is a note. The screenshot path: no vision model → the download offer and nothing
// read; with the user's model → the points read through the local endpoint (stubbed), dates parsed by code; the
// desktop-reply provider only while the app is added.
const assert=require('node:assert/strict');
const http=require('node:http');
const app=require('../src/extensions/chart-explain/feature.cjs');
const query=require('../src/extensions/chart-explain/query.cjs');
const holidays=require('../src/extensions/chart-explain/holidays.cjs');
const detect=require('../src/extensions/chart-explain/detect.cjs');
const series=require('../src/extensions/chart-explain/series.cjs');
const evidence=require('../src/extensions/chart-explain/evidence.cjs');
const vision=require('../src/extensions/chart-explain/vision.cjs');
const reply=require('../src/extensions/chart-explain/desktop-reply.cjs');
const offer=require('../src/extensions/chart-explain/offer.cjs');

// --- Routing -----------------------------------------------------------------------------------------------------------
for(const [t,k] of [['почему упал график','chart'],['объясни этот график','chart'],['что за провал на графике выручки?','chart'],['почему просел DAU?','metric'],['почему выросла выручка вчера','metric'],
 ['Почему DAU упал на 12,3% к прошлому периоду (11 200 против 12 800)? Период за 7 дней. Что проверить в первую очередь?','metric']])assert.equal(query.about(t),k,t);
for(const t of ['почему упала сборка','почему падает игра','почему упал сервер','график отпусков','нарисуй график продаж','почему падает контейнер postgres','что такое DAU','почему ты так думаешь','почему упали тесты','DAU за неделю','покажи график дежурств'])assert.equal(query.about(t),null,t);
assert.equal(query.direction('почему вырос DAU'),'up');assert.equal(query.metric('почему просела выручка с рекламы'),'ads');
const offers=require('../src/features/extension-offers.cjs');
assert.deepEqual(offers.candidates('почему упал график',{offers:[offer],settings:{}}).map(r=>r.offer.id),['chart-explain']);
assert.deepEqual(offers.candidates('почему упала сборка',{offers:[offer],settings:{}}),[]);

// --- Holidays ------------------------------------------------------------------------------------------------------------
assert.equal(holidays.easter(2026),'2026-04-05');assert.equal(holidays.orthodoxEaster(2026),'2026-04-12');assert.equal(holidays.orthodoxEaster(2025),'2025-04-20');
assert.equal(holidays.thanksgiving(2026),'2026-11-26');
assert.deepEqual(holidays.near('2026-11-04',1,['RU']).map(h=>h.name),['День народного единства']);
assert.deepEqual(holidays.near('2026-11-04',1,['US']),[]);
assert.ok(holidays.near('2026-11-27',0,['US']).some(h=>h.name==='Чёрная пятница'));

// --- Detection -------------------------------------------------------------------------------------------------------------
const D=i=>new Date(Date.parse('2026-10-20T00:00:00Z')+i*86400000).toISOString().slice(0,10);
const pts=v=>v.map((value,i)=>({date:D(i),value}));
const spike=detect.find(pts([100,102,98,101,99,100,103,60,98,101]),'down');
assert.equal(spike.notable,true);assert.equal(spike.date,D(7));assert.equal(spike.onset,D(7));assert.equal(spike.shape,'spike');assert.ok(Math.abs(spike.dev+0.4)<0.01);
const step=detect.find(pts([100,101,99,100,102,80,62,60,61,60]),'down');
assert.equal(step.date,D(7));assert.equal(step.onset,D(5),'the slide started two days earlier');assert.equal(step.shape,'step');
assert.equal(detect.find(pts([100,101,99,100,102,98,101,97,99]),'down').notable,false);
assert.equal(detect.find(pts([100,101,99,100,102,98,101,97,140]),'down').notable,false,'a rise is not the asked drop');
assert.equal(detect.find(pts([100,90]),null).reason,'short');

// --- Series from a real «Метрики игры» card ----------------------------------------------------------------------------------
const compute=require('../src/extensions/metrics/compute.cjs');
const NOW=new Date(Date.UTC(2026,10,9,10));
const w=compute.window(7,NOW);
const dauOf=d=>d==='2026-11-04'?7400:12000+(new Date(d+'T00:00:00Z').getUTCDay()%6===0?1500:0);
const days=compute.range(w.from,w.to);
const metricsCard={period:{days:7},platform:null,sources:[compute.block({id:'appmetrica',name:'AppMetrica',app:'Bunker Wars',series:[{metric:'dau',unit:'users',series:days.map(d=>({date:d,value:dauOf(d)}))},{metric:'revenue',unit:'currency:RUB',series:days.map(d=>({date:d,value:60000}))}],cohorts:null,unavailable:[]},w)]};
const fromCard=series.ADAPTERS.metricsCard(metricsCard);
assert.deepEqual(fromCard.series.map(x=>x.metric),['dau','revenue']);
assert.equal(series.pick(fromCard,'revenue').metric,'revenue');assert.equal(series.pick(fromCard,null).metric,'dau');
const ads=series.ADAPTERS.adRevenue({chart:{days:[D(0),D(1),D(2),D(3)],series:[{id:'AdMob',label:'AdMob',values:[10,12,11,9]},{id:'rest',label:'остальные',values:[1,1,1,1]}]},countries:[{country:'BR'}]});
assert.deepEqual(ads.series[0].points.map(p=>p.value),[11,13,12,10]);assert.deepEqual(ads.countries,['BR']);
assert.equal(series.fromTopic({messages:[{extensionData:{metricsCard}},{role:'user',text:'а?'}]}).kind,'metricsCard');
assert.equal(series.fromTopic({messages:[{text:'привет'}]}),null);

// --- Fakes: GitHub, monitoring, crashes, UA ---------------------------------------------------------------------------------
const calls=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x');calls.push({host:req.headers['x-host'],path:u.pathname,auth:req.headers.authorization});
 const json=(c,b)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(req.headers['x-host']==='api.github.com'&&u.pathname==='/repos/studio/bunker-wars/actions/runs'){
  if(req.headers.authorization!=='Bearer gh-test')return json(401,{message:'Bad credentials'});
  const run=(id,name,status,conclusion,at,event='push',branch='main')=>({id,name,run_number:id,status,conclusion,created_at:at,run_started_at:at,updated_at:at,head_branch:branch,head_sha:'a'.repeat(40),event,display_title:'Release 1.4.2',html_url:'https://github.com/studio/bunker-wars/actions/runs/'+id,workflow_id:7});
  return json(200,{workflow_runs:[run(1,'Release to stores','completed','success','2026-11-03T16:20:00Z','workflow_dispatch'),run(2,'Unit tests','completed','success','2026-11-04T09:00:00Z'),run(3,'Release to stores','completed','failure','2026-11-02T12:00:00Z','workflow_dispatch'),run(4,'Release to stores','completed','success','2026-10-20T12:00:00Z','workflow_dispatch')]});
 }
 json(404,{message:'Not Found'});
});
let base='';
async function request(url,{timeoutMs,headers={},...o}={}){
 const u=new URL(url);const r=await fetch(base+u.pathname+u.search,{...o,headers:{...headers,'x-host':u.hostname}});
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.json();
}
const monitorSources={list:()=>[{id:'prometheus',name:'Prometheus',has:['history']}],history:async()=>[{service:'api',status:'critical',from:'2026-11-04T06:10:00.000Z',to:'2026-11-04T09:40:00.000Z',title:'5xx > 5%',kind:'alert'}]};
const uaSources={list:()=>[{id:'applovin-ua'}],fetchAll:async({start,end})=>{const rows=[];for(let t=Date.parse(start+'T00:00:00Z');t<=Date.parse(end+'T00:00:00Z');t+=86400000){const date=new Date(t).toISOString().slice(0,10);
 rows.push({date,network:'AppLovin',campaign:'BW iOS US',campaignId:'c1',spend:date<'2026-11-03'?400:0,currency:'USD'},{date,network:'Unity Ads',campaign:'BW Android BR',campaignId:'u1',spend:120,currency:'USD'});}return {rows,used:[{name:'AppLovin'}],failed:[]};}};
function services(settings={},topic={id:'t',title:'Чат',messages:[]}){
 return {settings:{'extension_chart-explain':'true',...settings},request,requestProgress:{report(){}},monitorSources,uaSources,attachments:{list:()=>[]},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,t){topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};
}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 app.deps.now=()=>NOW.getTime();
 try{
  // Readers one by one.
  const ctx={from:'2026-11-01',to:'2026-11-05',onset:'2026-11-04',date:'2026-11-04',countries:['RU','US'],now:NOW.getTime()};
  const rel=await evidence.releases(services({'extension_ci-builds':'true',githubToken:'gh-test',githubRepos:'studio/bunker-wars'}),ctx);
  assert.deepEqual(rel.items.map(x=>[x.date,x.title,x.source]),[['2026-11-03','Релизная сборка «Release to stores» (main)','GitHub Actions']],'only successful release runs in the window');
  assert.equal(rel.items[0].url,'https://github.com/studio/bunker-wars/actions/runs/1');
  assert.equal((await evidence.releases(services(),ctx)).checked,false,'«Сборки» not added');
  const inc=await evidence.incidents(services(),ctx);
  assert.deepEqual(inc.items.map(x=>[x.date,x.title,x.hours]),[['2026-11-04','Инцидент «api»: 5xx > 5%',3.5]]);
  const camp=await evidence.campaigns(services(),ctx);
  assert.deepEqual(camp.items.map(x=>[x.date,x.title]),[['2026-11-03','Остановлена кампания «BW iOS US» (AppLovin)']]);
  assert.match(camp.items[0].detail,/400\s\$\/день → 0\s\$\/день/);

  // End to end on a metrics card: DAU drop on 4 Nov → incident, release the day before, campaign stop, the holiday.
  const topic={id:'t',title:'Чат',messages:[{role:'user',text:'DAU за неделю'},{role:'assistant',text:'Метрики.',extensionData:{metricsCard}}]};
  const s=services({'extension_ci-builds':'true',githubToken:'gh-test',githubRepos:'studio/bunker-wars'},topic);
  const r=await app.turn(s,'почему упал график?');
  const card=r.extensionData.chartExplain;
  assert.equal(card.verdict,'causes');assert.equal(card.event.date,'2026-11-04');assert.equal(card.event.direction,'down');
  assert.deepEqual(card.causes.map(c=>c.kind),['incident','release','campaign','holiday']);
  for(const c of card.causes){assert.match(c.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(c.source);}
  assert.match(r.text,/^DAU упал 4 нояб\.: 7\s400 против обычных ≈12\s\d00 \(−\d+(,\d)?%\)\. Возможные причины: 1\) 4 нояб\. — Инцидент «api»: 5xx > 5% \(Prometheus\); 2\) 3 нояб\. — Релизная сборка «Release to stores» \(main\) \(GitHub Actions\); 3\) 3 нояб\. — Остановлена кампания «BW iOS US» \(AppLovin\) \(AppLovin\); 4\) 4 нояб\. — День народного единства \(Календарь праздников\)\./u);
  assert.deepEqual(card.checked.map(c=>[c.kind,c.state]),[['releases','ok'],['incidents','ok'],['crashes','none'],['campaigns','ok'],['holidays','ok']]);
  assert.match(r.text,/Не подключено: крэши\./);

  // Nothing near the date → «Нет явной природы» is a valid answer; a failing reader is a note.
  app.deps.readers={releases:async()=>({kind:'releases',checked:true,items:[{kind:'release',date:'2026-10-20',title:'Старый релиз',source:'GitHub Actions'}],errors:[]}),incidents:async()=>{throw Error('Prometheus не ответил вовремя.');},holidays:async()=>({kind:'holidays',checked:true,items:[],errors:[]})};
  const none=await app.turn(services({},{id:'t2',title:'Чат',messages:[{extensionData:{metricsCard}}]}),'почему просел DAU?');
  assert.equal(none.extensionData.chartExplain.verdict,'none');assert.deepEqual(none.extensionData.chartExplain.causes,[]);
  assert.match(none.text,/Нет явной причины/);
  assert.equal(none.extensionData.chartExplain.checked.find(c=>c.kind==='incidents').state,'error');
  // A rise asked on a chart that only fell: no notable change.
  const flat=await app.turn(services({},{id:'t3',title:'Чат',messages:[{extensionData:{metricsCard}}]}),'почему вырос график выручки?');
  assert.equal(flat.extensionData.chartExplain.verdict,'flat');assert.match(flat.text,/нет заметного роста/);
  app.deps.readers=null;

  // No card: a chart word asks; a metric alone goes to the chat model; not added → nobody.
  assert.equal((await app.turn(services(),'почему упал график')).question,true);
  assert.equal(await app.turn(services(),'почему просел DAU?'),null);
  assert.equal(await app.turn({...services(),settings:{}},'почему упал график'),null);
  assert.equal(await app.turn(services({},topic),'почему упала сборка'),null);

  // --- Screenshot -------------------------------------------------------------------------------------------------------------
  assert.equal(vision.date('4 нояб.',{now:NOW.getTime()}),'2026-11-04');assert.equal(vision.date('Nov 4',{now:NOW.getTime()}),'2026-11-04');
  assert.equal(vision.date('28.12',{now:NOW.getTime()}),'2025-12-28','a date ahead of today is last year');
  assert.equal(vision.date('11/04/2026'),'2026-11-04');assert.equal(vision.date('2026-11-04T00:00'),'2026-11-04');assert.equal(vision.date('пн'),null);
  assert.equal(vision.tidy({points:[{x:'пн',y:1},{x:'вт',y:2},{x:'ср',y:3},{x:'чт',y:4}]}).undated,true);
  const files=[{id:'img1',name:'chart.png',image:true}];
  assert.equal(reply.matches('почему упал график',{files,settings:{'extension_chart-explain':'true'}}),true);
  assert.equal(reply.matches('почему упал график',{files,settings:{}}),false,'never while the app is not added');
  assert.equal(reply.matches('сделай баг из скриншота',{files,settings:{'extension_chart-explain':'true'}}),false);
  assert.equal(reply.matches('почему упал',{files,settings:{'extension_chart-explain':'true'}}),true);
  // No vision model: nothing is read, the card offers the download.
  const asked=[];
  const shot=services({ollamaUrl:'http://127.0.0.1:11434'},{id:'t4',title:'Чат',messages:[]});
  shot.optionalModels={catalog:[{name:'gemma3:4b',vision:true,size:3.3e9}],installed:async()=>['qwen3.5:9b'],download:async n=>{asked.push(n);}};
  shot.request=async()=>{throw Error('no model call expected');};
  const offerCard=(await app.screenshotTurn(shot,'почему упал график',{image:'iVBOR',attachment:'img1'})).extensionData.chartExplain;
  assert.equal(offerCard.state,'needs-model');assert.equal(offerCard.vision.name,'gemma3:4b');
  await app.setup(shot).ipc.downloadModel();assert.deepEqual(asked,['gemma3:4b']);
  // With the user's model: the points come from the local endpoint; correlation as for a card.
  shot.optionalModels.installed=async()=>['gemma3:4b'];
  const sent=[];
  shot.request=async(url,o)=>{sent.push({url,body:JSON.parse(o.body)});return {message:{content:JSON.stringify({title:'DAU',metric:'DAU',unit:'',points:['28 окт.','29 окт.','30 окт.','31 окт.','1 нояб.','2 нояб.','3 нояб.','4 нояб.','5 нояб.'].map((x,i)=>({x,y:i===7?7300:12000+i*10}))})}};};
  app.deps.readers={holidays:evidence.READERS.holidays};
  const read=(await app.screenshotTurn(shot,'почему упал график',{image:'iVBOR',attachment:'img1'})).extensionData.chartExplain;
  assert.equal(read.source,'screenshot');assert.equal(read.model,'gemma3:4b');assert.equal(read.event.date,'2026-11-04');
  assert.deepEqual(read.causes.map(c=>[c.date,c.title]),[['2026-11-04','День народного единства']]);
  assert.match(sent[0].url,/^http:\/\/127\.0\.0\.1:11434/,'the local endpoint only');assert.deepEqual(sent[0].body.messages[1].images,['iVBOR']);assert.equal(sent[0].body.model,'gemma3:4b');
  assert.match(app.text(read),/прочитаны с картинки локальной моделью/);
  app.deps.readers=null;
  console.log('Chart explain: routing and near-misses, offer, holidays (Easter, Thanksgiving, RU), spike/step/flat detection, series from metrics and ad cards, GitHub release runs, incidents, campaign stop, crashes not connected, ranked dated causes, «Нет явной причины», failing reader as a note, screenshot: download offer without a model, read with the user\'s model, label dates, desktop-reply only when added passed');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
