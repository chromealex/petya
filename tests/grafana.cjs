// «Grafana»: link parsing and base URL validation, routing incl. near-misses (Grafana down, «нарисуй график», PromQL,
// metrics words), not added → null, not connected → question, then against a local fake Grafana (tests/grafana-fake.cjs):
// the dashboard card (templating incl. a datasource variable and `$__all`, rows and a collapsed row, a library panel,
// a mixed-datasource panel split per datasource, frames → series / stat / gauge / bar gauge / table with units and
// thresholds, unsupported panels), a pasted link with viewPanel / from / to / var-x, the list and search, auth errors
// 401 / 403, a path-prefix redirect, timeouts, the metric mapping proposal (heuristics and the model), the
// metrics-source output and «Метрики игры» showing Grafana, and the offers. No network beyond 127.0.0.1.
const assert=require('node:assert/strict');
const fake=require('./grafana-fake.cjs');
const app=require('../src/extensions/grafana/feature.cjs');
const client=require('../src/extensions/grafana/client.cjs');
const links=require('../src/extensions/grafana/links.cjs');
const query=require('../src/extensions/grafana/query.cjs');
const dash=require('../src/extensions/grafana/dashboard.cjs');
const find=require('../src/extensions/grafana/find.cjs');
const mapping=require('../src/extensions/grafana/mapping.cjs');
const source=require('../src/extensions/grafana/metrics-source.cjs');
const offers=require('../src/features/extension-offers.cjs');

// The main process's request (src/main.cjs sendRequest): JSON, HTTP errors with status/detail, no redirects, a
// timeout (capped here so the timeout case is quick).
function requester(calls,{cap=4000}={}){
 return async(url,options={})=>{
  calls.push({url,options});
  if(new URL(url).pathname==='/api/chat')throw Error('no model');
  const {timeoutMs,...rest}=options;
  const res=await fetch(url,{...rest,redirect:'error',signal:AbortSignal.timeout(Math.min(timeoutMs||90000,cap))});
  if(!res.ok){const e=Error('Сервис вернул HTTP '+res.status);e.status=res.status;e.detail=(await res.text()).slice(0,500);throw e;}
  return res.status===204?null:res.json();
 };
}
function services(settings={},{model,cap}={}){
 const topic={id:'t',title:'Чат',messages:[]},calls=[];
 const s={settings:{model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_grafana:'true',grafanaUrl:'',grafanaToken:fake.TOKEN,grafanaFolder:'',grafanaRender:'false',grafanaCurrency:'USD',grafanaMetricMap:'{}',...settings},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const real=requester(calls,{cap});
 s.request=async(url,options)=>{if(model&&new URL(url).pathname==='/api/chat'){calls.push({url,options});return model(JSON.parse(options.body));}return real(url,options);};
 app.reset();
 return {s,topic,calls};
}
const dsCalls=calls=>calls.filter(c=>c.url.endsWith('/api/ds/query')).map(c=>JSON.parse(c.options.body));

(async()=>{
 // --- Links and the base URL ---
 const w=links.parse('https://dashboards.wombyte.net/d/c9e4b7f6-9caf-428d-a93f-578ec4be556f/leagues?orgId=1&from=now-7d&to=now&var-league=gold&var-league=silver&viewPanel=panel-4');
 assert.deepEqual({base:w.base,uid:w.uid,slug:w.slug,viewPanel:w.viewPanel,from:w.from,to:w.to,vars:w.vars,orgId:w.orgId},
  {base:'https://dashboards.wombyte.net',uid:'c9e4b7f6-9caf-428d-a93f-578ec4be556f',slug:'leagues',viewPanel:4,from:'now-7d',to:'now',vars:{league:['gold','silver']},orgId:1});
 assert.equal(links.parse('https://host.example/grafana/d-solo/abc/x?panelId=3&from=1730000000000&to=1730600000000').viewPanel,3);
 assert.equal(links.parse('https://host.example/grafana/d/abc').base,'https://host.example/grafana');
 assert.equal(links.parse('https://example.com/docs/page'),null);
 assert.equal(links.find('глянь https://g.example.com/d/xyz/sales?viewPanel=2, что там?').uid,'xyz');
 assert.equal(links.dashboard('https://g.example.com/grafana',{uid:'u1',slug:'s',from:'now-7d',to:'now',vars:{league:['gold','silver']},viewPanel:4}),'https://g.example.com/grafana/d/u1/s?from=now-7d&to=now&var-league=gold&var-league=silver&viewPanel=4');
 assert.equal(client.base('https://dashboards.wombyte.net/d/c9e4b7f6-9caf-428d-a93f-578ec4be556f/leagues?orgId=1'),'https://dashboards.wombyte.net','a pasted dashboard link gives the base');
 assert.equal(client.base('https://corp.example.com/grafana/'),'https://corp.example.com/grafana','path prefix kept');
 assert.equal(client.base('https://corp.example.com/grafana/d/abc/x'),'https://corp.example.com/grafana');
 assert.equal(client.base('grafana.example.com'),'https://grafana.example.com');
 assert.equal(client.base('http://localhost:3000'),'http://localhost:3000');
 assert.throws(()=>client.base('http://grafana.example.com'),/https:\/\//);
 assert.throws(()=>client.base('https://admin:pw@grafana.example.com'),/без логина/);
 const v={grafanaUrl:'https://g.example.com/d/x/y',grafanaFolder:'Game',grafanaMetricMap:'{"dau":{"d":"ret-main","p":11}}'};app.validate(v);
 assert.equal(v.grafanaUrl,'https://g.example.com');assert.deepEqual(JSON.parse(v.grafanaMetricMap),{dau:{d:'ret-main',p:11,f:'',t:'',dt:''}});
 assert.throws(()=>app.validate({grafanaMetricMap:'{"mau":{"d":"x","p":1}}'}),/Неизвестная метрика/);

 // --- Routing ---
 for(const p of ['что на дашборде лиг','какие дашборды есть','найди дашборд про ретеншн','открой графану','https://g.example.com/d/abc/leagues?viewPanel=2','что в Grafana по матчмейкингу'])
  assert.ok(!query.excluded(p)&&query.parse(p).explicit,'ours: '+p);
 assert.equal(query.parse('какие дашборды есть').intent,'list');
 assert.equal(query.parse('найди дашборд про ретеншн').intent,'search');assert.deepEqual(query.parse('найди дашборд про ретеншн').words,['ретеншн']);
 assert.deepEqual(query.parse('что на дашборде лиг').words,['лиг']);assert.equal(query.parse('что на дашборде лиг').intent,'show');
 assert.deepEqual(query.implicit('покажи лиги за неделю'),{words:['лиги'],range:{from:'now-7d',to:'now',label:'за неделю'}});
 for(const p of ['графана не открывается','grafana лежит','не могу войти в графану','нарисуй график продаж','rate(http_requests_total[5m]) в prometheus','что такое Grafana','как настроить дашборд в графане'])
  assert.ok(query.excluded(p)||!query.parse(p).explicit,'not ours: '+p);
 for(const p of ['покажи DAU за неделю','покажи крэши за неделю','покажи задачи за неделю','покажи отзывы','покажи ретеншн','нарисуй график','привет'])assert.equal(query.implicit(p),null,'no bare dashboard: '+p);
 assert.deepEqual(['за сутки','за неделю','за месяц','за 3 часа','вчера'].map(t=>query.period('покажи лиги '+t).from),['now-24h','now-7d','now-30d','now-3h','now-1d/d']);
 assert.equal(query.parse('DAU в графане').metric,'dau');assert.equal(query.parse('DAU за неделю').metric,null,'metric words only with Grafana named');
 assert.equal(find.stem('лиги'),'лиг');
 const list=[{uid:'a',title:'Leagues',folder:'Game',tags:[]},{uid:'b',title:'Retention & Revenue',folder:'Game',tags:['kpi']},{uid:'c',title:'Server health',folder:'Infra',tags:[]},{uid:'d',title:'Матчмейкинг',folder:'Infra',tags:[]}];
 assert.equal(find.pick(find.rank(list,['лиги'])).one.uid,'a');assert.equal(find.pick(find.rank(list,['ретеншн'])).one.uid,'b');assert.equal(find.pick(find.rank(list,['выручки'])).one.uid,'b');
 assert.equal(find.pick(find.rank(list,['матчмейкингу'])).one.uid,'d');assert.ok(find.pick(find.rank(list,['погода'])).none);

 // --- Pure dashboard logic ---
 const vars=[{name:'league',values:['gold','silver'],raw:false,multi:true},{name:'server',values:['eu'],raw:false},{name:'one',values:['a.b'],raw:false}];
 assert.equal(dash.interpolate('x{league=~"$league",server="${server}"}',vars,{dsType:'prometheus'}),'x{league=~"(gold|silver)",server="eu"}');
 assert.equal(dash.interpolate("IN ($league) AND s='[[server]]'",vars,{dsType:'grafana-postgresql-datasource'}),"IN ('gold','silver') AND s='eu'");
 assert.equal(dash.interpolate('${league:csv}|${league:pipe}|${one:regex}|$__interval|$unknown',vars,{}),'gold,silver|gold|silver|a\\.b|$__interval|$unknown');
 const now=Date.parse('2026-11-09T10:00:00Z');
 assert.equal(dash.time('now-7d',now),now-7*fake.DAY);assert.equal(dash.time('1730000000000',now),1730000000000);
 assert.equal(dash.range({from:'now-24h',to:'now'},now,{timeFrom:'7d'}).from,now-7*fake.DAY,'panel relative time');
 assert.equal(dash.range({from:'now-24h',to:'now'},now,{timeShift:'1d'}).to,now-fake.DAY);
 assert.equal(dash.interval({from:0,to:7*fake.DAY},300),3600000);
 assert.equal(dash.color('semi-dark-red'),'#e02f44');assert.equal(dash.color('#EAB839'),'#eab839');assert.equal(dash.color('url(x)'),null);
 assert.equal(dash.stepColor({thresholds:{mode:'absolute',steps:[{color:'green',value:null},{color:'red',value:80}]}},90),'#f2495c');
 assert.equal(dash.reduce([1,null,3],'lastNotNull'),3);assert.equal(dash.reduce([1,2,3],'mean'),2);
 const flat=dash.panels(require('./grafana-fake.cjs')&&{panels:[{type:'row',title:'R',id:1,collapsed:true,gridPos:{y:5},panels:[{id:3,type:'stat',gridPos:{y:6,x:0}}]},{id:2,type:'stat',gridPos:{y:0,x:0}}]});
 assert.deepEqual(flat.map(p=>[p.id,p.row]),[[2,''],[3,'R']]);
 const vv=dash.variables({templating:{list:[{name:'league',type:'custom',multi:true,options:[{text:'gold',value:'gold'},{text:'silver',value:'silver'}],current:{value:['$__all'],text:['All']}}]}},{text:'покажи лиги gold за неделю'});
 assert.deepEqual(vv[0].values,['gold']);assert.equal(vv[0].from,'request');

 // --- Not added / not connected ---
 let {s,calls}=services();
 s.settings.extension_grafana='false';assert.equal(await app.turn(s,'что на дашборде лиг'),null);
 s.settings.extension_grafana='true';
 let r=await app.turn(s,'что на дашборде лиг');
 assert.equal(r.question,true);assert.match(r.text,/Grafana ещё не подключена\. Откройте Настройки → «Grafana»/);
 assert.equal(await app.turn(s,'покажи лиги за неделю'),null,'a bare request is not claimed without a connection');
 for(const p of ['графана не открывается','нарисуй график','DAU за неделю','ретеншн D1 D7 D30','покажи крэши за неделю'])assert.equal(await app.turn(s,p),null,p);
 assert.equal(calls.length,0);

 const server=await fake.start();
 try{
  // --- The dashboard card ---
  ({s,calls}=services({grafanaUrl:server.url}));
  r=await app.turn(s,'что на дашборде лиг');
  let card=r.extensionData.grafanaCard;
  assert.equal(card.kind,'dashboard');assert.equal(card.title,'Leagues');assert.equal(card.folder,'Game');assert.equal(card.uid,fake.UID);
  assert.equal(card.range.raw.from,'now-24h','the dashboard time');assert.equal(card.range.label,'за сутки');assert.equal(card.range.source,'dashboard');
  assert.deepEqual(card.panels.map(p=>[p.id,p.kind]),[[1,'stat'],[2,'stat'],[3,'stat'],[4,'timeseries'],[5,'bars'],[6,'table'],[7,'timeseries'],[8,'unsupported']]);
  assert.equal(card.total,9);
  const P=id=>card.panels.find(p=>p.id===id);
  assert.equal(P(1).items[0].value,128);assert.equal(P(1).items[0].color,'#ff9830','128 ≥ 100 → orange');assert.equal(P(1).items[0].spark,null,'graphMode none');
  assert.ok(P(2).items[0].spark.length>2);assert.equal(P(2).items[0].unit,'short');
  assert.equal(P(3).gauge,true);assert.equal(P(3).items[0].unit,'percent');assert.equal(P(3).items[0].max,100);assert.ok(['#eab839','#73bf69','#f2495c'].includes(P(3).items[0].color));
  assert.deepEqual(P(4).series.map(x=>x.name),['gold','silver','bronze']);assert.equal(P(4).series[0].color,'#fade2a','override byName fixed color');
  assert.ok(P(4).series[0].points.length>100&&P(4).series[0].points.length<=360);
  assert.deepEqual(P(5).items.map(i=>[i.name,i.value]),[['gold',5200],['silver',9800],['bronze',12100],['tournaments',42]]);
  assert.deepEqual(P(6).columns.map(c=>[c.name,c.type,c.unit]),[['League','string',''],['Players','number',''],['Revenue','number','currencyUSD'],['Win rate','number','percentunit']]);
  assert.deepEqual(P(6).rows.map(x=>x[0]),['bronze','silver','gold'],'sorted by Players desc');
  assert.equal(P(7).title,'Revenue');assert.equal(P(7).library,true);assert.equal(P(7).series[0].unit,'currencyUSD');
  assert.match(P(8).reason,/«text»/);
  assert.match(P(4).url,/\/grafana\/d\/c9e4b7f6-9caf-428d-a93f-578ec4be556f\/leagues\?from=now-24h&to=now&viewPanel=4$/);
  // Requests: templating resolved, mixed panel split by datasource, library panel and frontend settings read.
  const ds=dsCalls(calls);
  const q1=ds.find(b=>b.queries[0].expr?.startsWith('count(league_active'));
  assert.equal(q1.queries[0].expr,'count(league_active{server="eu",env="prod"})');assert.equal(q1.queries[0].datasource.uid,'prom-main','datasource variable');
  assert.ok(Number(q1.to)-Number(q1.from)===24*3600000);
  const q4=ds.find(b=>/league_players/.test(b.queries[0].expr||''));
  assert.equal(q4.queries[0].expr,'sum by (league) (league_players{league=~"(gold|silver|bronze)",server="eu"})','$__all → every option, Prometheus regex');
  assert.ok(q4.queries[0].intervalMs>=60000,'panel min interval');
  const mixed=ds.filter(b=>b.queries.some(q=>/matches_total|tournaments/.test(q.expr||q.rawSql||'')));
  assert.equal(mixed.length,2,'one request per datasource');assert.match(mixed.find(b=>b.queries[0].rawSql).queries[0].rawSql,/IN \('gold','silver','bronze'\)/);
  assert.match(ds.find(b=>/FROM standings/.test(b.queries[0].rawSql||'')).queries[0].rawSql,/server = 'eu'/);
  assert.ok(calls.some(c=>c.url.endsWith('/api/library-elements/lib-revenue')));
  assert.ok(!ds.some(b=>b.queries.some(q=>/match_duration/.test(q.expr||''))),'unsupported panels are not queried');
  assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer '+fake.TOKEN||c.url.endsWith('/api/health')));
  assert.ok(calls.every(c=>['GET',undefined].includes(c.options.method)||c.url.endsWith('/api/ds/query')),'read-only');
  assert.match(r.text,/^Дашборд «Leagues» \(папка Game\), за сутки: 8 панелей из 9\. Active leagues — 128/);
  assert.deepEqual(r.messages.at(-1).sources,[{title:'Grafana · Leagues',url:card.dashboardUrl}]);

  // Bare request with a period: the dashboard is found by its English title.
  ({s,calls}=services({grafanaUrl:server.url}));
  r=await app.turn(s,'покажи лиги за неделю');
  card=r.extensionData.grafanaCard;assert.equal(card.title,'Leagues');assert.equal(card.range.raw.from,'now-7d');assert.equal(card.range.source,'request');
  assert.equal(await app.turn(s,'покажи погоду за неделю'),null);assert.equal(await app.turn(s,'покажи котиков'),null,'no such dashboard → not ours');
  // An option named in the request.
  r=await app.turn(s,'что на дашборде лиг для сервера asia');
  assert.deepEqual(r.extensionData.grafanaCard.vars.find(v=>v.name==='server'),{name:'server',label:'Сервер',text:['asia'],from:'request'});

  // A pasted link: viewPanel, time and var-x respected.
  ({s,calls}=services({grafanaUrl:server.url}));
  const from=Date.parse('2026-11-01T00:00:00Z'),to=Date.parse('2026-11-02T00:00:00Z');
  r=await app.turn(s,'глянь '+server.url+'/d/'+fake.UID+'/leagues?orgId=1&from='+from+'&to='+to+'&var-league=gold&viewPanel=panel-4');
  card=r.extensionData.grafanaCard;
  assert.deepEqual(card.panels.map(p=>p.id),[4]);assert.equal(card.viewPanel,4);assert.deepEqual(card.panels[0].series.map(x=>x.name),['gold']);
  assert.equal(card.range.from,from);assert.equal(card.range.source,'link');
  assert.equal(dsCalls(calls)[0].from,String(from));
  assert.match(card.panels[0].url,/var-league=gold&viewPanel=4$/);assert.match(card.url,/orgId=1/);
  assert.match(r.text,/панель «Players by league»/);
  r=await app.turn(s,'https://other.example.com/d/abc/x');assert.equal(r.question,true);assert.match(r.text,/другую Grafana \(other\.example\.com\)/);
  r=await app.turn(s,server.url+'/d/'+fake.UID+'/leagues?viewPanel=77');assert.equal(r.question,true);assert.match(r.text,/нет панели 77/);
  r=await app.turn(s,'https://g.example.com/goto/AbCdEf');assert.equal(r,null,'a short link of an unknown host is no dashboard link');

  // List and search.
  ({s,calls}=services({grafanaUrl:server.url,grafanaFolder:'Infra'}));
  r=await app.turn(s,'какие дашборды есть');
  card=r.extensionData.grafanaCard;assert.equal(card.kind,'list');assert.equal(card.items.length,4);assert.equal(card.items[0].folder,'Infra','default folder first');
  assert.equal(card.items.find(i=>i.title==='Leagues').url,server.url+'/d/'+fake.UID+'/leagues','search url with the sub-path');
  assert.match(r.text,/^В Grafana 4 дашборда: /);
  r=await app.turn(s,'найди дашборд про ретеншн');
  assert.equal(r.extensionData.grafanaCard.title,'Retention & Revenue','one hit opens it');
  r=await app.turn(s,'найди дашборд про котиков');assert.equal(r.question,true);assert.match(r.text,/нет дашборда про «котиков»/);
  r=await app.turn(s,'создай дашборд в графане');assert.match(r.text,/только читаю Grafana/);
  assert.ok(!calls.some(c=>c.options.method&&!['GET','POST'].includes(c.options.method)));

  // --- Errors ---
  ({s}=services({grafanaUrl:server.url,grafanaToken:'glsa_wrong'}));
  r=await app.turn(s,'что на дашборде лиг');assert.equal(r.error,true);assert.match(r.text,/^Grafana · Grafana не приняла токен/);
  ({s}=services({grafanaUrl:server.url,grafanaToken:'glsa_viewer_noaccess'}));
  r=await app.turn(s,server.url+'/d/'+fake.UID+'/leagues');assert.equal(r.error,true);assert.match(r.text,/нет доступа.*Viewer/);
  ({s}=services({grafanaUrl:'http://127.0.0.1:'+server.port}));
  await assert.rejects(client.test(s),/перенаправила запрос.*префиксом пути/,'Grafana under a sub-path, base without it');
  ({s}=services({grafanaUrl:server.url},{cap:300}));
  await assert.rejects(client.query(s,{from:1,to:2,queries:[{refId:'A',datasource:{uid:'prom-main'},expr:'slow_metric'}]}),/не ответила за 15 с/);
  const down=services({grafanaUrl:'http://127.0.0.1:9'});
  await assert.rejects(client.test(down.s),/недоступна по адресу http:\/\/127\.0\.0\.1:9/);
  const t=await client.test(services({grafanaUrl:server.url}).s);assert.equal(t.version,'11.3.0');

  // --- Metric mapping ---
  ({s,calls}=services({grafanaUrl:server.url}));
  let prop=await mapping.propose(s);
  const short=x=>x&&[x.d,x.p,x.f];
  assert.deepEqual(Object.fromEntries(Object.entries(prop.proposal).map(([k,x])=>[k,short(x)])),
   {dau:['ret-main',11,''],new:['ret-main',12,''],revenue:['ret-main',13,''],arpdau:['ret-main',15,''],d1:['ret-main',14,'D1'],d7:['ret-main',14,'D7'],d30:['ret-main',14,'D30']});
  assert.ok(!Object.values(prop.proposal).some(x=>x.p===16),'server CPU is no game metric');
  assert.equal(prop.why.dau,'heuristic');
  // The model may pick another candidate among the proposed ones; an index outside the list is ignored.
  ({s,calls}=services({grafanaUrl:server.url,model:'qwen'},{model:body=>{const u=JSON.parse(body.messages[1].content);const out={};for(const m of u.metrics)out[m.id]=m.id==='revenue'?1:m.id==='dau'?99:0;return {message:{content:JSON.stringify(out)}};}}));
  prop=await mapping.propose(s);
  assert.ok(calls.some(c=>c.url.endsWith('/api/chat')));
  if(prop.candidates.revenue.length>1){assert.equal(prop.why.revenue,'model');assert.deepEqual(short(prop.proposal.revenue),short(prop.candidates.revenue[1]));}
  assert.equal(prop.why.dau,'heuristic');

  // --- metrics-source ---
  const map=JSON.stringify({dau:{d:'ret-main',p:11},new:{d:'ret-main',p:12},revenue:{d:'ret-main',p:13},d1:{d:'ret-main',p:14,f:'D1'},d7:{d:'ret-main',p:14,f:'D7'},d30:{d:'ret-main',p:14,f:'D30'}});
  ({s,calls}=services({grafanaUrl:server.url,grafanaMetricMap:map}));
  assert.equal(source.ready(s.settings),true);assert.equal(source.ready({...s.settings,grafanaMetricMap:'{}'}),false,'not mapped → not a source');
  const q={from:'2026-10-01',to:'2026-11-08',metrics:['dau','new','revenue'],platform:'android',version:null,app:null};
  const got=await source.fetch(s,q);
  const S=m=>got.series.find(x=>x.metric===m);
  assert.equal(S('dau').series.length,39);assert.equal(S('dau').series[0].date,'2026-10-01');
  assert.equal(S('dau').series[0].value,12000+(new Date('2026-10-01T00:00:00Z').getUTCDay()%6===0?2400:0)+20*(Math.floor(Date.parse('2026-10-01')/fake.DAY)%50));
  assert.equal(S('revenue').unit,'currency:USD');assert.equal(S('new').unit,'users');
  const qd=dsCalls(calls).find(b=>/game_dau/.test(b.queries[0].expr));
  assert.equal(qd.queries[0].intervalMs,fake.DAY);assert.equal(qd.queries[0].expr,'sum(game_dau{platform=~"android"})','platform through the dashboard variable');
  assert.ok(!got.unavailable.some(u=>u.metric==='platform'));
  assert.ok(got.unavailable.some(u=>u.metric==='version')===false);
  const ret=await source.retention(s,q);
  const c0=ret.cohorts.find(c=>c.date==='2026-10-01');assert.equal(c0.returned[1],Math.round(0.41*c0.size));assert.equal(c0.returned[30],Math.round(0.065*c0.size));
  assert.equal(ret.cohorts.at(-1).returned[1],undefined,'the last day has no D1 yet');
  ({s}=services({grafanaUrl:server.url,grafanaMetricMap:JSON.stringify({dau:{d:'ret-main',p:11},d1:{d:'ret-main',p:14,f:'D1'}})}));
  await assert.rejects(source.retention(s,q),/сопоставьте и «Новые пользователи»/);
  const nor=await source.fetch(s,q);assert.match(nor.unavailable.find(u=>u.metric==='revenue').reason,/не сопоставлена панель выручки/);
  // «Метрики игры» reads Grafana as a source, next to AppMetrica.
  const registry=require('../src/extensions/metrics/sources.cjs');
  const declared=registry.load();assert.ok(declared.some(x=>x.id==='grafana'&&x.name==='Grafana'));
  const metrics=require('../src/extensions/metrics/feature.cjs');
  ({s}=services({grafanaUrl:server.url,grafanaMetricMap:map,extension_metrics:'true',extension_appmetrica:'false'}));
  metrics.reset();
  r=await metrics.metricsTurn(s,'DAU за неделю',new Date(2026,10,9,10,0));
  const mb=r.extensionData.metricsCard.sources;
  assert.deepEqual(mb.map(b=>b.id),['grafana']);assert.deepEqual(mb[0].kpis.map(k=>k.id),['dau','new','d1','revenue','arpdau']);
  assert.equal(mb[0].kpis.find(k=>k.id==='d1').value,0.41);assert.equal(mb[0].retention.rows.length,6);
  assert.match(r.text,/^Grafana, за 7 дней: DAU в среднем/);
  // DAU named with Grafana: the mapped panel of its dashboard.
  r=await app.turn(s,'DAU в графане');assert.deepEqual(r.extensionData.grafanaCard.panels.map(p=>p.id),[11]);
 }finally{await server.close();}

 // --- Offers ---
 const all=offers.load(),settings={};
 const offered=text=>{const d=offers.decide(offers.candidates(text,{offers:all,settings}));return d?d.one?[d.one.offer.id]:d.tie.map(x=>x.offer.id):[];};
 for(const p of ['что на дашборде лиг','какие дашборды есть','найди дашборд про ретеншн','покажи графану','https://dashboards.wombyte.net/d/c9e4b7f6-9caf-428d-a93f-578ec4be556f/leagues'])assert.deepEqual(offered(p),['grafana'],p);
 for(const p of ['графана не открывается','нарисуй график продаж','DAU за неделю','метрики игры за месяц','запрос в prometheus'])assert.ok(!offered(p).includes('grafana'),p);
 assert.equal(require('../src/extensions/grafana/offer.cjs').ready({extension_grafana:'true',grafanaUrl:'https://g.example.com',grafanaToken:'x'}),true);
 // Turn order: Grafana answers «найди дашборд про ретеншн» before «Метрики игры» (alphabetical extension order).
 const order=require('../src/features/extension-ui.cjs').descriptors.map(d=>d.id);
 assert.ok(order.indexOf('grafana')<order.indexOf('metrics'));
 console.log('Grafana: links, routing and near-misses, dashboard card from a fake Grafana (templating, rows, library and mixed panels, frames → series/stat/gauge/bars/table), pasted link, list and search, 401/403/redirect/timeout, mapping proposal, metrics-source and offers passed');
})().catch(e=>{console.error(e);process.exit(1);});
